import { SimpleJwksCache } from "aws-jwt-verify/jwk";
import { verifyJwt } from "aws-jwt-verify/jwt-verifier";
import type * as Party from "partykit/server";
import type * as z from "zod";
import {
	type ConnectionState,
	ConnectionStateSchema,
} from "./schemas/connection-state";
import type { UsersMessageSchema } from "./schemas/messages";
import { type User, UserSchema } from "./schemas/user";

const DEFAULT_ENDPOINT = "https://kippeves.kinde.com";
const jwksCache = new SimpleJwksCache();

export type Message = z.infer<typeof UsersMessageSchema>;

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

export default class UsersServer implements Party.Server {
	constructor(readonly room: Party.Room) {
		this.party = room;
	}

	readonly party: Party.Room;
	users: Map<string, User> = new Map();

	static async onBeforeConnect(request: Party.Request, _lobby: Party.Lobby) {
		try {
			// get token from request query stringc
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
			const { success, data } = UserSchema.safeParse({
				id: payload.jti,
				name: payload.name || payload.username,
				avatar: payload.picture,
			});

			if (!success) return;
			shallowMergeConnectionState(conn, { user: data });
			this.updateUsers();
		});
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
