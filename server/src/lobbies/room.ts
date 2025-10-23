import type * as Party from "partykit/server";
import { tryDecodeToken, tryGetUser } from "../../utils";
import { ChatRoomClientEventSchema } from "../schemas/chatroom/client";
import type { ChatRoomInitData } from "../schemas/chatroom/init";
import type { ChatRoomMessageServer } from "../schemas/chatroom/message/server";
import type { ChatRoomServerEvent } from "../schemas/chatroom/server";
import { type RoomState, RoomStateSchema } from "../schemas/connection-state";
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
			if (!user) return;
			await this.getInfoFromLobby().then((room) => {
				shallowMergeConnectionState(conn, { user, room });
				this.updateLobby("join", user);
			});
		} catch {
			// ignore connect errors silently (preserve original behavior)
		}
	}

	async onClose(_conn: Party.Connection) {
		const state = getConnectionState(_conn);
		if (!state) return;
		const { user } = state;
		if (user) this.updateLobby("leave", user);
	}

	async onMessage(message: string, sender: Party.Connection) {
		const state = getConnectionState(sender);
		if (!state) return;

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
		const { room, user } = state;
		const isAdmin = room?.createdBy.id !== user?.id;
		switch (type) {
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

	async onRequest(req: Party.Request) {
		const token = req.headers.get("Authorization");
		if (!token) return new Response();
		const payload = await tryDecodeToken(token);
		const payloadUser = await tryGetUser(payload);
		if (!payloadUser?.success) {
			const error = payloadUser?.error;
			return new Response(error?.message);
		}
		const user = payloadUser.user;
		if (!user) return new Response("User could not be found");

		if (req.method === "POST") {
			const body = await req.json();
			const { success, data } = ChatRoomClientEventSchema.safeParse(body);
			if (!success) return new Response();

			const { type } = data;
			switch (type) {
				case "message": {
					const { payload } = data;
					// validate payload message
					if (!payload?.message) return new Response();

					const chatEvent: ChatRoomServerEvent = {
						type: "message",
						payload: {
							user: user,
							sent: new Date(),
							message: payload.message,
						},
					};

					const messages =
						(await this.room.storage.get<ChatRoomServerEvent[]>(
							this.storageKey,
						)) ?? [];
					messages.push(chatEvent);
					await this.room.storage.put(this.storageKey, messages);
					broadcastEvent(this.room, chatEvent);
					return Response.json([]);
				}
			}
		}
		if (req.method === "GET") {
			const events = await this.room.storage.get<ChatRoomServerEvent[]>(
				this.storageKey,
			);
			const messages: ChatRoomMessageServer[] =
				events?.filter((e) => e.type === "message").map((e) => e.payload) ?? [];
			return await this.getInfoFromLobby().then((room) => {
				if (!room) return;
				const initData: ChatRoomInitData = { info: room, messages };
				return Response.json(initData);
			});
		}
		return new Response("No Requests");
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

	async updateLobby(type: "join" | "leave", user: User) {
		const API = process.env.API_KEY;
		if (!API) return;

		let event: LobbyClientEvent | undefined;
		if (type === "join")
			event = {
				type,
				payload: {
					roomId: this.room.id,
					user,
				},
			};
		else
			event = {
				type,
				payload: {
					roomId: this.room.id,
					userId: user.id,
				},
			};
		if (!event) return;
		const lobby = await this.room.context.parties.lobby
			.get("main")
			.socket({ headers: { "X-API-KEY": API } });
		lobby.send(JSON.stringify(event));
	}
}

function shallowMergeConnectionState(
	connection: Party.Connection,
	state: RoomState,
) {
	setConnectionState(connection, (prev) => ({ ...prev, ...state }));
}

function setConnectionState(
	connection: Party.Connection,
	state: RoomState | ((prev: RoomState | null) => RoomState | null),
) {
	if (typeof state !== "function") {
		return connection.setState(state);
	}
	connection.setState((prev: unknown) => {
		const prevParseResult = RoomStateSchema.safeParse(prev);
		if (prevParseResult.success) {
			return state(prevParseResult.data);
		} else {
			return state(null);
		}
	});
}

function getConnectionState(connection: Party.Connection) {
	const result = RoomStateSchema.safeParse(connection.state);
	if (result.success) {
		return result.data;
	} else {
		setConnectionState(connection, null);
		return null;
	}
}
