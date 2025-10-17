import type * as Party from "partykit/server";
import { type ChatRoomEvent, ChatRoomEventSchema } from "../schemas/chat-room";
import type { User } from "../schemas/user";
import ChatServer from "../types/chat-server";
import {
	getConnectionState,
	getUserFromContext,
	shallowMergeConnectionState,
} from "../utils";

export default class RoomServer extends ChatServer {
	async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
		const user = await getUserFromContext(ctx);
		if (!user) return;
		shallowMergeConnectionState(conn, { user });
		this.updateLobby("join", this.room.id, user);
		const message = {
			type: "user:join",
			payload: { user: user },
		} satisfies ChatRoomEvent;

		this.room.broadcast(JSON.stringify(message));
	}

	async onRequest(req: Party.Request) {
		if (req.method === "GET") {
			const messages =
				(await this.room.storage.get(`room:${this.room.id}`)) ?? [];
			return Response.json(messages);
		}
	}

	async onMessage(message: string, sender: Party.Connection) {
		const state = getConnectionState(sender);
		const obj = JSON.parse(message);
		const { success, data } = ChatRoomEventSchema.safeParse(obj);
		if (!(state?.user && success)) return;
		const { type, payload } = data;
		const roomId = `room:${this.room.id}`;
		switch (type) {
			case "user:message": {
				let messages =
					(await this.room.storage.get<ChatRoomEvent[]>(roomId)) ?? [];
				const message = {
					type: "server:message",
					payload: {
						user: state?.user,
						sent: new Date(),
						message: payload.message,
					},
				} as ChatRoomEvent;
				messages = [...messages, message];
				await this.room.storage.put(roomId, messages);
				this.room.broadcast(JSON.stringify(message));
				break;
			}
		}
	}

	async updateLobby(type: "join" | "leave", _roomId: string, user: User) {
		const lobbySocket = await this.room.context.parties.lobby
			.get("main")
			.socket();

		lobbySocket.send(
			JSON.stringify({
				type,
				payload: { user },
			}),
		);
	}
}
