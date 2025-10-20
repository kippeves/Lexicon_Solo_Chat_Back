import z from "zod";
import { UserSchema } from "./user";

export const LobbyRoomSchema = z.object({
	id: z.string(),
	createdBy: UserSchema,
	users: z.array(UserSchema),
});

export type LobbyRoom = z.infer<typeof LobbyRoomSchema>;
