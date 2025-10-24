import type * as Party from "partykit/server";
import type z from "zod";
import { tryDecodeToken } from "../../../utils";
import {
	type UserState,
	UserStateSchema,
} from "../../schemas/connection-state";
import type { UserSchema } from "../../schemas/user";

export default class ChatServer implements Party.Server {
	readonly room: Party.Room;
	constructor(readonly _room: Party.Room) {
		this.room = _room;
	}
	static async onBeforeConnect(request: Party.Request, _lobby: Party.Lobby) {
		try {
			const API = process.env.API_KEY;
			// get token from request query string
			const token = new URL(request.url).searchParams.get("token");
			if (!(token || API)) return new Response("Unauthorized", { status: 401 });
			// verify the JWT (in this case using clerk)
			if (token) {
				await tryDecodeToken(token);
			}
			// forward the request onwards on onConnect
			return request;
		} catch {
			// short-circuit the request before it's forwarded to the party
			return new Response("Unauthorized", { status: 401 });
		}
	}
	async onConnect(_conn: Party.Connection, _ctx: Party.ConnectionContext) {}
	onMessage(_message: string, _sender: Party.Connection) {}
	shallowMergeConnectionState(connection: Party.Connection, state: UserState) {
		this.setConnectionState(connection, (prev) => ({ ...prev, ...state }));
	}

	setConnectionState(
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

	getConnectionState(connection: Party.Connection) {
		const result = UserStateSchema.safeParse(connection.state);
		if (result.success) {
			return result.data;
		} else {
			this.setConnectionState(connection, null);
			return null;
		}
	}

	getUsers() {
		const users = new Map<string, z.infer<typeof UserSchema>>();
		for (const connection of this.room.getConnections()) {
			const state = this.getConnectionState(connection);
			if (state?.user) {
				users.set(state.user.id, state.user);
			}
		}
		return [...users.values()];
	}
}

ChatServer satisfies Party.Worker;
