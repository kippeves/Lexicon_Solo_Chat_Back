import type * as Party from "partykit/server";

export default class Main implements Party.Server {
	constructor(readonly room: Party.Room) {}
	onConnect(_conn: Party.Connection, _ctx: Party.ConnectionContext) {}

	onMessage(_message: string, _sender: Party.Connection) {}
}

Main satisfies Party.Worker;
