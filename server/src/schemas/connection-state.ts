import z from "zod";
import { LobbyRoomSchema } from "./lobbyroom";
import { UserSchema } from "./user";

export const UserStateSchema = z
	.object({
		user: UserSchema.nullable().optional(),
	})
	.nullable();

export type UserState = z.infer<typeof UserStateSchema>;

export const RoomStateSchema = z
	.object({
		user: UserSchema.nullable().optional(),
		room: LobbyRoomSchema.nullable().optional(),
	})
	.nullable();

export type RoomState = z.infer<typeof RoomStateSchema>;
