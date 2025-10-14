import type * as Party from "partykit/server";
import { tryDecodeToken } from "../utils";
import { UserSchema } from "./schemas/user";

export default class RoomServer implements Party.Server {
	readonly party: Party.Room;
	constructor(readonly room: Party.Room) {
		this.party = room;
	}
	static async onBeforeConnect(request: Party.Request, _lobby: Party.Lobby) {
		try {
			// get token from request query string
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

	async onConnect(_conn: Party.Connection, ctx: Party.ConnectionContext) {
		const token = new URL(ctx.request.url).searchParams.get("token");
		if (!token) return;
		console.log(this.party.id);
		const payload = await tryDecodeToken(token);

		UserSchema.safeParse({
			id: payload.jti,
			name: payload.name || payload.username,
			avatar: payload.picture,
		});
	}
}
