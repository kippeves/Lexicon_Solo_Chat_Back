import { SimpleJwksCache } from "aws-jwt-verify/jwk";
import { verifyJwt } from "aws-jwt-verify/jwt-verifier";
import type * as Party from "partykit/server";
import type * as z from "zod";
import type { RoomsMessageSchema } from "./schemas/messages";
import { UserSchema } from "./schemas/user";

const DEFAULT_ENDPOINT = "https://kippeves.kinde.com";
const jwksCache = new SimpleJwksCache();

type Message = z.infer<typeof RoomsMessageSchema>;

async function tryDecodeToken(token: string) {
	return await verifyJwt(
		token,
		`${DEFAULT_ENDPOINT}/.well-known/jwks`,
		{
			issuer: DEFAULT_ENDPOINT,
			audience: null,
		},
		jwksCache.getJwk.bind(jwksCache), // use JWKS cache (optional)
	);
}

export default class RoomsServer implements Party.Server {
	constructor(readonly room: Party.Room) {
		this.party = room;
	}

	readonly party: Party.Room;

	static async onBeforeConnect(request: Party.Request, _lobby: Party.Lobby) {
		try {
			// get token from request query string
			const token = new URL(request.url).searchParams.get("token");
			if (!token) return new Response("Unauthorized", { status: 401 });
			// verify the JWT (in this case using clerk)
			const payload = await tryDecodeToken(token);
			// pass any information to the onConnect handler in headers (optional)
			payload.aud && request.headers.set("X-User-ID", payload.aud?.toString());
			// forward the request onwards on onConnect
			return request;
		} catch {
			// short-circuit the request before it's forwarded to the party
			return new Response("Unauthorized", { status: 401 });
		}
	}

	onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
		const token = new URL(ctx.request.url).searchParams.get("token");
		if (!token) return;

		tryDecodeToken(token).then((payload) => {
			const { success, data, error } = UserSchema.safeParse({
				id: payload.jti,
				name: payload.name || payload.username,
				avatar: payload.picture,
			});
		});
	}

	onMessage(message: string, sender: Party.Connection) {
		// let's log the message
		console.log(`connection ${sender.id} sent message: ${message}`);
		// as well as broadcast it to all the other connections in the room...
		// this.room.broadcast(
		// 	`${sender.id}: ${message}`,
		// 	// ...except for the connection it came from
		// 	[sender.id],
		// );
	}
}

RoomsServer satisfies Party.Worker;
