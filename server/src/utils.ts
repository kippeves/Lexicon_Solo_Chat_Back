import type * as Party from "partykit/server";
import { tryDecodeToken } from "../utils";
import {
	type ConnectionState,
	ConnectionStateSchema,
} from "./schemas/connection-state";
import { UserSchema } from "./schemas/user";

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

export async function getUserFromContext(ctx: Party.ConnectionContext) {
	const url = new URL(ctx.request.url);
	const query = url.searchParams;
	const token = query.get("token");
	if (!token) return null;

	const payload = await tryDecodeToken(token);
	const data = UserSchema.parse({
		id: payload.sub,
		name: payload.name || payload.username,
		avatar: payload.picture,
	});

	return data;
}
