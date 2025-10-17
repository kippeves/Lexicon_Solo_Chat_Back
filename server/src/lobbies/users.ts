import type * as Party from "partykit/server";
import type * as z from "zod";
import type { UsersMessageSchema } from "../schemas/messages";
import type { UserSchema } from "../schemas/user";
import ChatServer from "../types/chat-server";
import {
	getConnectionState,
	getUserFromContext,
	shallowMergeConnectionState,
} from "../utils";

export type Message = z.infer<typeof UsersMessageSchema>;

export default class UsersServer extends ChatServer {
	constructor(readonly room: Party.Room) {
		super(room);
	}

	async onRequest(req: Party.Request) {
		if (req.method === "GET") {
			return Response.json(this.getUsers());
		}
	}

	async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
		const user = await getUserFromContext(ctx);
		if (!user) return;
		shallowMergeConnectionState(conn, { user });
		this.updateUsers();
	}

	onClose(): void | Promise<void> {
		this.updateUsers();
	}

	onError(): void | Promise<void> {
		this.updateUsers();
	}

	updateUsers() {
		const presenceMessage = JSON.stringify(this.getPresenceMessage());
		for (const connection of this.room.getConnections()) {
			connection.send(presenceMessage);
		}
	}

	getUsers() {
		const users = new Map<string, z.infer<typeof UserSchema>>();

		for (const connection of this.room.getConnections()) {
			const state = getConnectionState(connection);
			if (state?.user) {
				users.set(state.user.id, state.user);
			}
		}

		return [...users.values()];
	}

	getPresenceMessage() {
		return {
			type: "presence",
			payload: { users: this.getUsers() },
		} satisfies Message;
	}

	onMessage(message: string, sender: Party.Connection) {
		// let's log the message
		console.log(`connection ${sender.id} sent message: ${message}`);
		// as well as broadcast it to all the other connections in the room...
		this.room.broadcast(
			`${sender.id}: ${message}`,
			// ...except for the connection it came from
			[sender.id],
		);
	}
}
