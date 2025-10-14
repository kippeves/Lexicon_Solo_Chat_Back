import type * as Party from "partykit/server";
import type * as z from "zod";
import { tryDecodeToken } from "../utils";
import {
	type ConnectionState,
	ConnectionStateSchema,
} from "./schemas/connection-state";
import type { UsersMessageSchema } from "./schemas/messages";
import { UserSchema } from "./schemas/user";

export type Message = z.infer<typeof UsersMessageSchema>;

export default class UsersServer implements Party.Server {
	constructor(readonly room: Party.Room) {
		this.party = room;
	}

	readonly party: Party.Room;

	static async onBeforeConnect(request: Party.Request, _lobby: Party.Lobby) {
		try {
			// get token from request query stringc
			const token = new URL(request.url).searchParams.get("token");
			if (!token) return new Response("Unauthorized", { status: 401 });
			// verify the JWT (in this case using clerk)
			await tryDecodeToken(token);
			// forward the request onwards on onConnect
			return request;
		} catch {
			// short-circuit the request before it's forwarded to the party
			return new Response("Unauthorized", { status: 401 });
		}
	}

	async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
		const token = new URL(ctx.request.url).searchParams.get("token");
		if (!token) return;

		const payload = await tryDecodeToken(token);
		const { success, data } = UserSchema.safeParse({
			id: payload.sub,
			name: payload.name || payload.username,
			avatar: payload.picture,
		});
		if (!success) conn.close();
		shallowMergeConnectionState(conn, { user: data });
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
		for (const connection of this.party.getConnections()) {
			connection.send(presenceMessage);
		}
	}

	getUsers() {
		const users = new Map<string, z.infer<typeof UserSchema>>();

		for (const connection of this.party.getConnections()) {
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
			payload: { users: [...this.getUsers()] },
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

function shallowMergeConnectionState(
	connection: Party.Connection,
	state: ConnectionState,
) {
	setConnectionState(connection, (prev) => ({ ...prev, ...state }));
}

function setConnectionState(
	connection: Party.Connection,
	state:
		| ConnectionState
		| ((prev: ConnectionState | null) => ConnectionState | null),
) {
	if (typeof state !== "function") {
		return connection.setState(state);
	}
	connection.setState((prev: unknown) => {
		const prevParseResult = ConnectionStateSchema.safeParse(prev);
		if (prevParseResult.success) {
			return state(prevParseResult.data);
		} else {
			return state(null);
		}
	});
}

function getConnectionState(connection: Party.Connection) {
	const result = ConnectionStateSchema.safeParse(connection.state);
	if (result.success) {
		return result.data;
	} else {
		setConnectionState(connection, null);
		return null;
	}
}

UsersServer satisfies Party.Worker;
