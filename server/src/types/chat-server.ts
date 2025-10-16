import type * as Party from "partykit/server";
import { tryDecodeToken } from "../../utils";

export default class ChatServer implements Party.Server {
	readonly room: Party.Room;
	constructor(readonly _room: Party.Room) {
		this.room = _room;
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
	async onConnect(_conn: Party.Connection, _ctx: Party.ConnectionContext) {}
	onMessage(_message: string, _sender: Party.Connection) {}
}

ChatServer satisfies Party.Worker;
