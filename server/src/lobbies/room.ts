import type * as Party from "partykit/server";
import {
	type ChatRoomClientEvent,
	ChatRoomClientEventSchema,
} from "../schemas/chatroom/client";
import type { ChatRoomServerEvent } from "../schemas/chatroom/server";
import type { User } from "../schemas/user";
import ChatServer from "../types/chat-server";
import {
	getConnectionState,
	getUserFromContext,
	shallowMergeConnectionState,
} from "../utils";

export default class RoomServer extends ChatServer {
	constructor(readonly _room: Party.Room) {
		super(_room);
	}

	// add helper to centralize the storage key
	private get messagesKey() {
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
			shallowMergeConnectionState(conn, { user });
			this.updateLobby("join", this.room.id, user);
			const message = {
				type: "join",
				payload: { user },
			} satisfies ChatRoomServerEvent;
			this.broadcastEvent(message);
		} catch {
			// ignore connect errors silently (preserve original behavior)
		}
	}

	async onRequest(req: Party.Request) {
		if (req.method === "GET") {
			const messages =
				(await this.room.storage.get<ChatRoomClientEvent[]>(
					this.messagesKey,
				)) ?? [];
			return Response.json(messages);
		}
		return new Response("No Requests");
	}

	async onMessage(message: string, sender: Party.Connection) {
		const state = getConnectionState(sender);
		if (!state?.user) return;

		let parsed: unknown;
		try {
			parsed = JSON.parse(message);
		} catch {
			return;
		}

		const { success, data } = ChatRoomClientEventSchema.safeParse(parsed);
		if (!success) return;

		const { type, payload } = data;
		switch (type) {
			case "message": {
				// validate payload message
				if (!payload?.message) return;

				const chatEvent: ChatRoomServerEvent = {
					type: "message",
					payload: {
						user: state.user,
						sent: new Date(),
						message: payload.message,
					},
				};

				const messages =
					(await this.room.storage.get<ChatRoomClientEvent[]>(
						this.messagesKey,
					)) ?? [];
				messages.push(chatEvent);
				await this.room.storage.put(this.messagesKey, messages);

				this.broadcastEvent(chatEvent);
				break;
			}
		}
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
