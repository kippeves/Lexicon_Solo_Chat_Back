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
	rooms: LobbyRoom[];
	constructor(readonly room: Party.Room) {
		super(room);
		this.rooms = [];
	}

	async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
		const user = await getUserFromContext(ctx);
		if (!user) return;
		shallowMergeConnectionState(conn, { user });
	}

	async onRequest(req: Party.Request) {
		if (req.method === "POST") {
			const token = req.headers.get("Authorization");
			if (!token) return new Response("Unauthorized", { status: 401 });
			// verify the JWT (in this case using clerk)
			const payload = await tryDecodeToken(token);
			const payloadUser = await tryGetUser(payload);
			if (!payloadUser?.success)
				return new Response(
					JSON.stringify({ type: "error", payload: payloadUser?.error }),
				);
			const user = payloadUser.user;
			if (!user) return new Response("");
			const id = createId(this.rooms.map((room) => room.id));
			const newRoom = LobbyRoomSchema.decode({
				id: id,
				createdBy: user,
				users: [],
			});
			this.rooms.push(newRoom);
			const update: LobbyMessage = { type: "create", payload: newRoom };
			const asString = JSON.stringify(update);
			this.room.broadcast(asString);
			return new Response(asString);
		}
		return new Response();
	}

	onMessage(message: string, _sender: Party.Connection) {
		const obj = JSON.parse(message);
		const { success, data } = LobbyMessageSchema.safeParse(obj);
		if (!success) return new Response();
		switch (data.type) {
			case "create":
				break;
			case "close":
				break;
			case "join": {
				const { roomId, user } = data.payload;
				const searchedRoom = this.rooms.find((room) => room.id === roomId);
				if (!searchedRoom) break;
				searchedRoom.users = [...searchedRoom.users, user];
				this.rooms = [...this.rooms, searchedRoom];
				this.room.broadcast(JSON.stringify(data));
				break;
			}
			case "leave":
				break;
		}
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
