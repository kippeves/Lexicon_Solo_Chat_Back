import type * as Party from "partykit/server";
import { tryDecodeToken, tryGetUser } from "../../utils";
import { ChatRoomClientEventSchema } from "../schemas/chatroom/client";
import type { ChatRoomServerEvent } from "../schemas/chatroom/server";
import type { LobbyClientEvent } from "../schemas/lobby/client";
import type { LobbyRoom } from "../schemas/lobbyroom";
import type { User } from "../schemas/user";
import { broadcastEvent, getUserFromContext } from "../utils";
import ChatServer from "./base/chat-server";

export default class RoomServer extends ChatServer {
	constructor(readonly _room: Party.Room) {
		super(_room);
	}

	// add helper to centralize the storage key
	private get storageKey() {
		return `room:${this.room.id}`;
	}

	async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
		try {
			const user = await getUserFromContext(ctx);
			this.shallowMergeConnectionState(conn, { user });
			this.updateLobby();
		} catch {
			// ignore connect errors silently (preserve original behavior)
		}
	}

	async onClose(_conn: Party.Connection) {
		const ids = [];
		for (const conn of this.room.getConnections()) {
			ids.push(conn.id);
		}

		this.updateLobby();
	}

	async onMessage(message: string, sender: Party.Connection) {
		const state = this.getConnectionState(sender);
		if (!state) return;
		const room = await this.getInfoFromLobby();
		if (!room) return;

		// parse safely
		let parsed: unknown;
		try {
			parsed = JSON.parse(message);
		} catch {
			// invalid JSON over WS — ignore
			return;
		}

		const parseResult = ChatRoomClientEventSchema.safeParse(parsed);
		if (!parseResult.success) return;
		const data = parseResult.data;
		const { type } = data;
		const { user } = state;
		const isAdmin = room.createdBy.id !== user?.id;
		switch (type) {
			case "join":
				this.updateLobby();
				break;
			case "message": {
				const { payload } = data;
				// any connected user in the room may send messages; validate payload
				if (!payload?.message || !user) return;

				const chatEvent: ChatRoomServerEvent = {
					type: "message",
					payload: {
						user,
						sent: new Date(),
						message: payload.message,
					},
				};

				// persist and broadcast
				const messages =
					(await this.room.storage.get<ChatRoomServerEvent[]>(
						this.storageKey,
					)) ?? [];
				messages.push(chatEvent);
				await this.room.storage.put(this.storageKey, messages);
				broadcastEvent(this.room, chatEvent);
				break;
			}

			case "close": {
				if (isAdmin) return;

				this.removeFromLobby().then((r) => {
					if (!r) return;
					this.room.storage.delete(this.storageKey);
					broadcastEvent(this.room, {
						type: "close",
						payload: { admin: true },
					});
					setTimeout(() => {
						broadcastEvent(this.room, { type: "close" });
					}, 1500);
				});
				break;
			}

			case "clear": {
				// only room owner can clear
				if (isAdmin) return;

				// clear storage and notify clients
				await this.room.storage.put(this.storageKey, []);
				broadcastEvent(this.room, { type: "clear" });
				break;
			}
		}
	}

	private async authenticateRequest(req: Party.Request) {
		const API = req.headers.get("X-API-KEY");
		const token = req.headers.get("Authorization");

		if (API) return { success: true as const };
		if (!token) return { success: false as const };

		const payload = await tryDecodeToken(token);
		const payloadUser = await tryGetUser(payload);

		return {
			success: Boolean(payloadUser?.success) as true,
			user: payloadUser?.user,
		};
	}

	private async handlePost(req: Party.Request, user: User) {
		const body = await req.json();
		const result = ChatRoomClientEventSchema.safeParse(body);
		if (!result.success)
			return new Response("Invalid request body", { status: 400 });

		const { type } = result.data;
		if (type !== "message" || !result.data.payload?.message) {
			return new Response("Invalid message", { status: 400 });
		}

		const chatEvent: ChatRoomServerEvent = {
			type: "message",
			payload: {
				user,
				sent: new Date(),
				message: result.data.payload.message,
			},
		};

		const messages =
			(await this.room.storage.get<ChatRoomServerEvent[]>(this.storageKey)) ??
			[];
		messages.push(chatEvent);
		await this.room.storage.put(this.storageKey, messages);
		broadcastEvent(this.room, chatEvent);
		return Response.json({ success: true });
	}

	private async handleGet() {
		await this.room.storage.sync();
		const events = await this.room.storage.get<ChatRoomServerEvent[]>(
			this.storageKey,
		);
		const messages =
			events?.filter((e) => e.type === "message").map((e) => e.payload) ?? [];
		const room = await this.getInfoFromLobby();

		if (!room) return new Response("Room not found", { status: 404 });

		return Response.json({ info: room, messages });
	}

	async onRequest(req: Party.Request) {
		const auth = await this.authenticateRequest(req);
		if (!auth.success) return new Response("Unauthorized", { status: 401 });
		const URI = new URL(req.url);
		try {
			switch (req.method) {
				case "POST":
					if (!auth.user)
						return new Response("User not found", { status: 401 });
					return await this.handlePost(req, auth.user);
				case "GET":
					if (URI.pathname.endsWith("/users")) {
						return Response.json(this.getUsers());
					}
					return await this.handleGet();
				default:
					return new Response("Method not allowed", { status: 405 });
			}
		} catch {
			return new Response("Internal server error", { status: 500 });
		}
	}

	private async lobbyRequest(method: "POST" | "DELETE") {
		const API_KEY = process.env.API_KEY;
		if (!API_KEY) throw new Error("No API-Key Defined");

		const room = this.room.context.parties.lobby.get("main");
		const clientEvent = {
			type: "room",
			payload: { roomId: this.room.id },
		} as LobbyClientEvent;

		const res = await room.fetch("/room", {
			headers: { "X-API-KEY": API_KEY },
			method,
			body: JSON.stringify(clientEvent),
		});
		return (await res.json()) as LobbyRoom;
	}

	async getInfoFromLobby() {
		try {
			return await this.lobbyRequest("POST");
		} catch {
			return undefined;
		}
	}

	async removeFromLobby() {
		try {
			return await this.lobbyRequest("DELETE");
		} catch {
			return undefined;
		}
	}

	async updateLobby() {
		const API = process.env.API_KEY;
		if (!API) return;

		const event: LobbyClientEvent = {
			type: "update",
			payload: {
				roomId: this.room.id,
				users: this.getUsers(),
			},
		};
		if (!event) return;
		await this.room.context.parties.lobby.get("main").fetch({
			method: "POST",
			headers: { "X-API-KEY": API },
			body: JSON.stringify(event),
		});
	}
}
