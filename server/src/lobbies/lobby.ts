import type * as Party from "partykit/server";
import { v4 as uuidv4 } from "uuid";
import { tryDecodeToken, tryGetUser } from "../../utils";
import { type UserState, UserStateSchema } from "../schemas/connection-state";
import { LobbyClientEventSchema } from "../schemas/lobby/client";
import type { LobbyServerEvent } from "../schemas/lobby/server";
import { type LobbyRoom, LobbyRoomSchema } from "../schemas/lobbyroom";
import { broadcastEvent, getUserFromContext } from "../utils";
import ChatServer from "./base/chat-server";

const ROOMS_KEY = "rooms";

export default class LobbyServer extends ChatServer {
	async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
		const user = await getUserFromContext(ctx);
		shallowMergeConnectionState(conn, { user });
	}

	async onRequest(req: Party.Request) {
		const checkAPI = () => {
			const api = req.headers.get("X-API-KEY");
			const api_same = api === process.env.API_KEY;
			if (api && !api_same)
				return new Response("Unauthorized", { status: 401 });
		};

		const URI = new URL(req.url);
		if (req.method === "GET") {
			if (URI.pathname.endsWith("/rooms")) {
				// load rooms once and return
				const rooms =
					(await this.room.storage.get<LobbyRoom[]>(ROOMS_KEY)) ?? [];
				const roomsWithUsers = await Promise.all(
					rooms.map(async (room) => ({
						...room,
						users: await this.getUsersForRoom(room.id),
					})),
				);

				return Response.json(roomsWithUsers);
			}
		}

		if (req.method === "DELETE") {
			if (URI.pathname.endsWith("/main/room")) {
				const error = checkAPI();
				if (error) return error;

				// parse and validate once
				const body = await req.json();
				const item = LobbyClientEventSchema.safeParse(body);
				if (!item.success) return new Response("No ID set", { status: 500 });
				const { type, payload } = item.data;
				if (type !== "room") return new Response("Bad Event");
				const { roomId } = payload;

				try {
					// load rooms once
					const rooms =
						(await this.room.storage.get<LobbyRoom[]>(ROOMS_KEY)) ?? [];
					const room = rooms.find((r) => r.id === roomId);
					// write filtered list
					await this.room.storage.put<LobbyRoom[]>(ROOMS_KEY, [
						...rooms.filter((r) => r.id !== roomId),
					]);
					return room
						? Response.json(room)
						: new Response("Room not found", { status: 400 });
				} catch {
					return new Response("Something went wrong", { status: 500 });
				}
			}
		}

		if (req.method === "POST") {
			if (URI.pathname.endsWith("/main/room")) {
				const error = checkAPI();
				if (error) return error;

				// parse and validate once
				const body = await req.json();
				const item = LobbyClientEventSchema.safeParse(body);
				if (!item.success) return new Response("No ID set", { status: 500 });
				const { type, payload } = item.data;
				if (type !== "room") return new Response("Bad Event");

				// load rooms once and return found room (no extra fetch)
				const rooms =
					(await this.room.storage.get<LobbyRoom[]>(ROOMS_KEY)) ?? [];
				const room = rooms.find((r) => r.id === payload.roomId);
				return room
					? Response.json(room)
					: new Response("Room not found", { status: 400 });
			}
			if (URI.pathname.endsWith("/main")) {
				// parse and validate once
				const body = await req.json();

				const { success, data, error } = LobbyClientEventSchema.safeParse(body);

				if (!success) return new Response(`Error: ${error.message}`);

				switch (data.type) {
					case "update": {
						const { payload } = data;
						const event: LobbyServerEvent = {
							type: "update",
							payload,
						};
						for (const connection of this.room.getConnections()) {
							connection.send(JSON.stringify(event));
						}

						break;
					}
					case "create": {
						const token = req.headers.get("Authorization");
						if (!token) return new Response("Unauthorized", { status: 401 });
						const payload = await tryDecodeToken(token);
						const payloadUser = await tryGetUser(payload);
						if (!payloadUser?.success)
							return new Response(
								JSON.stringify({ type: "error", payload: payloadUser?.error }),
							);
						const user = payloadUser.user;
						if (!user) return new Response("");

						// load rooms once
						const rooms =
							(await this.room.storage.get<LobbyRoom[]>(ROOMS_KEY)) ?? [];

						const id = createId(rooms.map((room) => room.id));
						const newRoom = LobbyRoomSchema.decode({
							id: id,
							createdBy: user,
							users: [],
						});
						const newList = [...rooms, newRoom] as LobbyRoom[];
						await this.room.storage.put<LobbyRoom[]>(ROOMS_KEY, newList);

						// broadcast string, return structured JSON response efficiently
						const update: LobbyServerEvent = {
							type: "create",
							payload: { room: newRoom },
						};
						
						this.room.broadcast(JSON.stringify(update));
						return Response.json(update);
					}
				}
			}
		}
		return new Response();
	}

	async onMessage(message: string, _sender: Party.Connection) {
		const obj = JSON.parse(message);
		const { success, data } = await LobbyClientEventSchema.safeParseAsync(obj);
		if (!success) return;
		switch (data.type) {
			case "close":
				broadcastEvent<LobbyServerEvent>(this.room, {
					type: "close",
					payload: data.payload,
				});
				break;
		}
	}
	async findRoom(roomId: string) {
		const rooms = (await this.room.storage.get<LobbyRoom[]>(ROOMS_KEY)) ?? [];
		return rooms.find((room) => room.id === roomId);
	}

	async getUsersForRoom(roomId: string) {
		const apiKey = process.env.API_KEY;
		const room = this.room.context.parties.room.get(roomId);
		if (!apiKey || !room) {
			throw !apiKey ? "No API-key" : "No such room found";
		}
		const res = await room.fetch("/users", {
			headers: { "X-API-KEY": apiKey },
		});
		const users = await res.json();
		return users;
	}
}

function shallowMergeConnectionState(
	connection: Party.Connection,
	state: UserState,
) {
	setConnectionState(connection, (prev) => ({ ...prev, ...state }));
}

function setConnectionState(
	connection: Party.Connection,
	state: UserState | ((prev: UserState | null) => UserState | null),
) {
	if (typeof state !== "function") {
		return connection.setState(state);
	}
	connection.setState((prev: unknown) => {
		const prevParseResult = UserStateSchema.safeParse(prev);
		if (prevParseResult.success) {
			return state(prevParseResult.data);
		} else {
			return state(null);
		}
	});
}

const createId = (rooms: string[]): string => {
	// use a Set for O(1) membership checks
	const existing = new Set(rooms);
	let id: string;
	while (true) {
		const uuid = uuidv4();
		id = uuid
			.toUpperCase()
			.split("-")
			.map((s) => s.slice(0, 2))
			.join("")
			.slice(0, 5);
		if (!existing.has(id)) return id;
	}
};
