import type * as Party from "partykit/server";
import { v4 as uuidv4 } from "uuid";
import { tryDecodeToken, tryGetUser } from "../../utils";
import { type UserState, UserStateSchema } from "../schemas/connection-state";
import { LobbyClientEventSchema } from "../schemas/lobby/client";
import {
	type LobbyServerEvent,
	LobbyServerEventSchema,
} from "../schemas/lobby/server";
import { type LobbyRoom, LobbyRoomSchema } from "../schemas/lobbyroom";
import type { User } from "../schemas/user";
import { getUserFromContext } from "../utils";
import ChatServer from "./base/chat-server";

const ROOMS_KEY = "rooms";

export default class LobbyServer extends ChatServer {
	async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
		const user = await getUserFromContext(ctx);
		shallowMergeConnectionState(conn, { user });
	}

	async onRequest(req: Party.Request) {
		const env_key = process.env.API_KEY;

		const URI = new URL(req.url);
		if (req.method === "GET") {
			if (URI.pathname.endsWith("/rooms")) {
				const rooms =
					(await this.room.storage.get<LobbyRoom[]>(ROOMS_KEY)) ?? [];
				return Response.json(rooms);
			}
		}

		if (req.method === "POST") {
			if (URI.pathname.endsWith("/main/room")) {
				const api = req.headers.get("X-API-KEY");
				const api_same = api && api === env_key;
				if (!api_same) return new Response("Unauthorized", { status: 401 });

				const body = await req.json();
				const item = LobbyClientEventSchema.safeParse(body);
				if (!item.success) return new Response("No ID set", { status: 500 });
				const { type, payload } = item.data;
				if (type !== "room") return new Response("Bad Event");
				const rooms =
					(await this.room.storage.get<LobbyRoom[]>(ROOMS_KEY)) ?? [];
				const room = rooms.find((r) => r.id === payload.roomId);
				return room
					? Response.json(room)
					: new Response("Room not found", { status: 400 });
			}
			if (URI.pathname.endsWith("/main")) {
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
				const update: LobbyServerEvent = { type: "create", payload: newRoom };
				const asString = JSON.stringify(update);
				this.room.broadcast(asString);
				return new Response(asString);
			}
		}
		return new Response();
	}

	async onMessage(message: string, _sender: Party.Connection) {
		const obj = JSON.parse(message);
		const { success, data } = LobbyServerEventSchema.safeParse(obj);
		if (!success) return;
		switch (data.type) {
			case "create":
				break;
			case "close":
				break;
			case "join": {
				this.join(data.payload);
				break;
			}
			case "leave": {
				this.leave(data.payload);
				break;
			}
		}
	}
	async findRoom(roomId: string) {
		const rooms = (await this.room.storage.get<LobbyRoom[]>(ROOMS_KEY)) ?? [];
		return rooms.find((room) => room.id === roomId);
	}

	async leave({ id, roomId }: { id: string; roomId: string }) {
		const rooms = (await this.room.storage.get<LobbyRoom[]>(ROOMS_KEY)) ?? [];
		const roomIndex = rooms.findIndex((room) => room.id === roomId);
		if (roomIndex === -1) return;

		const updatedRoom = {
			...rooms[roomIndex],
			users: rooms[roomIndex].users.filter((u) => u.id !== id),
		};
		const newRooms = [...rooms];
		newRooms[roomIndex] = updatedRoom;
		await this.room.storage.put<LobbyRoom[]>(ROOMS_KEY, newRooms);
		const message = {
			type: "leave",
			payload: { id, roomId },
		} as LobbyServerEvent;
		this.room.broadcast(JSON.stringify(message));
	}

	async join({ roomId, user }: { roomId: string; user: User }) {
		const rooms = (await this.room.storage.get<LobbyRoom[]>(ROOMS_KEY)) ?? [];
		const roomIndex = rooms.findIndex((room) => room.id === roomId);
		if (roomIndex === -1) return;

		// prevent duplicates
		const existing = rooms[roomIndex].users.find((u) => u.id === user.id);
		if (!existing) {
			const updatedRoom = {
				...rooms[roomIndex],
				users: [...rooms[roomIndex].users, user],
			};
			const newRooms = [...rooms];
			newRooms[roomIndex] = updatedRoom;
			await this.room.storage.put<LobbyRoom[]>(ROOMS_KEY, newRooms);
			const message: LobbyServerEvent = {
				type: "join",
				payload: { user, roomId },
			};
			this.room.broadcast(JSON.stringify(message));
		}
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
	// iterative, avoids recursion
	let id: string;
	do {
		const uuid = uuidv4();
		id = uuid
			.toUpperCase()
			.split("-")
			.map((s) => s.slice(0, 2))
			.join("")
			.slice(0, 5);
	} while (rooms.includes(id));
	return id;
};
