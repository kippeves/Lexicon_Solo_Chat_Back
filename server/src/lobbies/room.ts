import type * as Party from "partykit/server";
import { tryGetUser as readUserFromToken, tryDecodeToken } from "../../utils";
import type { User } from "../schemas/user";
import ChatServer from "../types/chat-server";

export default class RoomServer extends ChatServer {
	async onConnect(_conn: Party.Connection, ctx: Party.ConnectionContext) {
		const token = new URL(ctx.request.url).searchParams.get("token");
		if (!token) return;

		const payload = await tryDecodeToken(token);
		const payloadUser = await readUserFromToken(payload);
		if (payloadUser?.success && payloadUser.user) {
			this.updateLobby("join", this.room.id, payloadUser.user);
		}

		return new Response();
	}

	async updateLobby(type: "join" | "leave", roomId: string, user: User) {
		const lobbySocket = await this.room.context.parties.lobby
			.get("main")
			.socket();
		lobbySocket.send(
			JSON.stringify({
				type,
				payload: { roomId, user },
			}),
		);
	}
}
