import type * as Party from "partykit/server";
import { tryDecodeToken } from "../utils";
import { UserSchema } from "./schemas/user";

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

// add helper to centralize broadcasting + serialization
export function broadcastEvent<T>(
	room: Party.Room,
	ev: T,
	conn?: Party.Connection,
) {
	const payload = JSON.stringify(ev);
	if (conn) room.broadcast(payload, [conn.id]);
	else room.broadcast(payload);
	return payload;
}
