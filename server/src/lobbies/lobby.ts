import type * as Party from "partykit/server";
import { v4 as uuidv4 } from "uuid";
import { tryDecodeToken, tryGetUser } from "../../utils";
import {
	type LobbyMessage,
	LobbyMessageSchema,
	type LobbyRoom,
	LobbyRoomSchema,
} from "../schemas/lobby";
import ChatServer from "../types/chat-server";
import { getUserFromContext, shallowMergeConnectionState } from "../utils";

export default class LobbyServer extends ChatServer {
	async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
		const user = await getUserFromContext(ctx);
		if (!user) return;
		shallowMergeConnectionState(conn, { user });
	}

	async onRequest(req: Party.Request) {
		const token = req.headers.get("Authorization");
		if (!token) return new Response("Unauthorized", { status: 401 });
		if (req.method === "GET") {
			const URI = new URL(req.url);
			if (URI.pathname.endsWith("/rooms")) {
				const rooms = (await this.room.storage.get<LobbyRoom[]>("rooms")) ?? [];
				return Response.json(rooms);
			}
		}
		if (req.method === "POST") {
			const payload = await tryDecodeToken(token);
			const payloadUser = await tryGetUser(payload);
			if (!payloadUser?.success)
				return new Response(
					JSON.stringify({ type: "error", payload: payloadUser?.error }),
				);
			const user = payloadUser.user;
			if (!user) return new Response("");
			const rooms = (await this.room.storage.get<LobbyRoom[]>("rooms")) ?? [];

			const id = createId(rooms.map((room) => room.id));
			const newRoom = LobbyRoomSchema.decode({
				id: id,
				createdBy: user,
				users: [],
			});
			const newList = [...rooms, newRoom] as LobbyRoom[];
			this.room.storage.put<LobbyRoom[]>("rooms", newList);
			const update: LobbyMessage = { type: "create", payload: newRoom };
			const asString = JSON.stringify(update);
			this.room.broadcast(asString);
			return new Response(asString);
		}
		return new Response();
	}

	async onMessage(message: string, _sender: Party.Connection) {
		const obj = JSON.parse(message);
		const { success, data } = LobbyMessageSchema.safeParse(obj);
		if (!success) return new Response();
		switch (data.type) {
			case "create":
				break;
			case "close":
				break;
			case "join": {
				const { user } = data.payload;
				const update = await this.findRoom(this.room.id);
				if (!update) return;
				const rooms = (await this.room.storage.get<LobbyRoom[]>("rooms")) ?? [];
				update.users = [...update.users, user];
				this.room.storage.put("rooms", [...rooms, update]);
				this.room.broadcast(JSON.stringify(data));
				break;
			}
			case "leave": {
				const { id, roomId } = data.payload;
				const update = await this.findRoom(roomId);
				if (!update) return;
				const rooms = (await this.room.storage.get<LobbyRoom[]>("rooms")) ?? [];
				update.users = update.users.filter((u) => u.id !== id);
				this.room.storage.put("rooms", [...rooms, update]);
				break;
			}
		}
	}
	async findRoom(roomId: string) {
		const rooms = (await this.room.storage.get<LobbyRoom[]>("rooms")) ?? [];
		return rooms.find((room) => room.id === roomId);
	}
}

const createId = (rooms: string[]): string => {
	const uuid = uuidv4();
	const id = uuid
		.toUpperCase()
		.split("-")
		.map((s) => s.slice(0, 2))
		.join("")
		.slice(0, 5);

	return rooms.includes(id) ? createId(rooms) : id;
};
