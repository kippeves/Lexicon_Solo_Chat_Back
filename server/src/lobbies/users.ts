import type * as Party from "partykit/server";
import type * as z from "zod";
import { tryDecodeToken } from "../../utils";
import type { PresenceSchema } from "../schemas/messages";
import { UserSchema } from "../schemas/user";
import ChatServer from "./base/chat-server";

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
		this.shallowMergeConnectionState(conn, { user });
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

	getPresenceMessage() {
		return {
			type: "presence",
			payload: { users: this.getUsers() },
		} satisfies Message;
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
