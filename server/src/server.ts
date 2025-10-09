import { SimpleJwksCache } from "aws-jwt-verify/jwk";
import { verifyJwt } from "aws-jwt-verify/jwt-verifier";
import type * as Party from "partykit/server";

const DEFAULT_ENDPOINT = "https://kippeves.kinde.com";
const jwksCache = new SimpleJwksCache();

export default class Server implements Party.Server {
	constructor(readonly room: Party.Room) {}
	static async onBeforeConnect(request: Party.Request, _lobby: Party.Lobby) {
		try {
			// get token from request query string
			const token = new URL(request.url).searchParams.get("token");
			if (!token) return new Response("Unauthorized", { status: 401 });
			// verify the JWT (in this case using clerk)
			const payload = await verifyJwt(
				token,
				`${DEFAULT_ENDPOINT}/.well-known/jwks`,
				{
					issuer: DEFAULT_ENDPOINT,
					audience: null,
				},
				jwksCache.getJwk.bind(jwksCache), // use JWKS cache (optional)
			);
			// pass any information to the onConnect handler in headers (optional)
			payload.aud && request.headers.set("X-User-ID", payload.aud?.toString());
			// forward the request onwards on onConnect
			return request;
		} catch (e) {
			console.log(e);
			// authentication failed!
			// short-circuit the request before it's forwarded to the party
			return new Response("Unauthorized", { status: 401 });
		}
	}

	onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
		const userId = ctx.request.headers.get("X-User-ID");
		// A websocket just connected!
		console.log(
			`Connected:
      id: ${conn.id}
	  userId: ${userId}
      room: ${this.room.id}
      url: ${new URL(ctx.request.url).pathname}`,
		);
		// let's send a message to the connection
		conn.send("hello from server");
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

Server satisfies Party.Worker;
