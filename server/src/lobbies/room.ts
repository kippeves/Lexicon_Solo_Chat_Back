import type * as Party from "partykit/server";
import { tryDecodeToken, tryGetUser } from "../../utils";
import {
	type ChatRoomClientEvent,
	ChatRoomClientEventSchema,
} from "../schemas/chatroom/client";
import type { ChatRoomServerEvent } from "../schemas/chatroom/server";
import { type RoomState, RoomStateSchema } from "../schemas/connection-state";
import type { LobbyClientEvent } from "../schemas/lobby/client";
import type { LobbyRoom } from "../schemas/lobbyroom";
import type { User } from "../schemas/user";
import { getUserFromContext } from "../utils";
import ChatServer from "./base/chat-server";

export default class RoomServer extends ChatServer {
	constructor(readonly _room: Party.Room) {
		super(_room);
	}

	// add helper to centralize the storage key
	private get storageKey() {
		return `room:${this.room.id}`;
	}

	// add helper to centralize broadcasting + serialization
	private broadcastEvent(ev: ChatRoomServerEvent) {
		const payload = JSON.stringify(ev);
		this.room.broadcast(payload);
		return payload;
	}

	async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
		try {
			const user = await getUserFromContext(ctx);
			if (!user) return;
			const room = this.room.context.parties.lobby.get("main");
			const clientEvent = {
				type: "room",
				payload: { roomId: this.room.id },
			} as LobbyClientEvent;
			const API_KEY = process.env.API_KEY;
			if (API_KEY)
				room
					.fetch("/room", {
						headers: {
							"X-API-KEY": API_KEY,
						},
						method: "POST",
						body: JSON.stringify(clientEvent),
					})
					.then(async (e) => {
						const room = (await e.json()) as LobbyRoom;
						shallowMergeConnectionState(conn, { user, room });
					});
		} catch {
			// ignore connect errors silently (preserve original behavior)
		}
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
		const { type, payload } = data;
		const { room, user } = state;

		switch (type) {
			case "message": {
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
					(await this.room.storage.get<ChatRoomClientEvent[]>(
						this.storageKey,
					)) ?? [];
				messages.push(chatEvent);
				await this.room.storage.put(this.storageKey, messages);
				this.broadcastEvent(chatEvent);
				break;
			}
			case "clear": {
				// only room owner can clear
				if (room?.createdBy.id !== user?.id) return;

				// clear storage and notify clients
				await this.room.storage.put(this.storageKey, []);
				this.broadcastEvent({ type: "clear" });
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
						(await this.room.storage.get<ChatRoomClientEvent[]>(
							this.storageKey,
						)) ?? [];
					messages.push(chatEvent);
					await this.room.storage.put(this.storageKey, messages);
					this.broadcastEvent(chatEvent);
					return new Response();
				}
			}
		}
		if (req.method === "GET") {
			const events = await this.room.storage.get<ChatRoomClientEvent[]>(
				this.storageKey,
			);
			const messages =
				events?.filter((e) => e.type === "message").map((e) => e.payload) ?? [];
			return Response.json(messages);
		}
		return new Response("No Requests");
	}

	async updateLobby(type: "join" | "leave", _roomId: string, user: User) {
		const key = process.env.API_KEY;
		try {
			if (key)
				await this.room.context.parties.lobby.get("main").socket({
					credentials: "include",
					body: JSON.stringify({
						type,
						payload: { user },
					}),
				});
		} catch {
			// fail silently if lobby is unavailable
		}
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
