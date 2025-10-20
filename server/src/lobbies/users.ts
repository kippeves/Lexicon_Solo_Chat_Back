import type * as Party from "partykit/server";
import type * as z from "zod";
import { tryDecodeToken } from "../../utils";
import {
	type ConnectionState,
	ConnectionStateSchema,
} from "../schemas/connection-state";
import type { PresenceSchema } from "../schemas/messages";
import { UserSchema } from "../schemas/user";
import ChatServer from "../types/chat-server";

export type Message = z.infer<typeof PresenceSchema>;

export default class UsersServer extends ChatServer {
	constructor(readonly _room: Party.Room) {
		super(_room);
	}

	async onRequest(req: Party.Request) {
		if (req.method === "GET") {
			return Response.json(this.getUsers());
		}
		return new Response("No Response");
	}

	async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
		const user = await getUserFromContext(ctx);
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
}

export function shallowMergeConnectionState(
	connection: Party.Connection,
	state: ConnectionState,
) {
	setConnectionState(connection, (prev) => ({ ...prev, ...state }));
}

export function setConnectionState(
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

export function getConnectionState(connection: Party.Connection) {
	const result = ConnectionStateSchema.safeParse(connection.state);
	if (result.success) {
		return result.data;
	} else {
		setConnectionState(connection, null);
		return null;
	}
}

async function getUserFromContext(ctx: Party.ConnectionContext) {
	const token = new URL(ctx.request.url).searchParams.get("token");
	if (!token) return null;

	const payload = await tryDecodeToken(token);
	const { data } = UserSchema.safeParse({
		id: payload.sub,
		name: payload.name || payload.username,
		avatar: payload.picture,
	});
	return data;
}
