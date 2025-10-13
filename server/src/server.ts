import type * as Party from "partykit/server";

export default class Server implements Party.Server {
	constructor(readonly room: Party.Room) {}
	onConnect(_conn: Party.Connection, _ctx: Party.ConnectionContext) {}

	onMessage(_message: string, _sender: Party.Connection) {}
}

Server satisfies Party.Worker;
