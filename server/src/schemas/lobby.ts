import z from "zod";
import { UserSchema } from "./user";

export const LobbyRoomSchema = z.object({
	id: z.string(),
	createdBy: UserSchema,
	users: z.array(UserSchema),
});

export type LobbyRoom = z.infer<typeof LobbyRoomSchema>;

export type LobbyMessage = z.infer<typeof LobbyMessageSchema>;

export const LobbyMessageSchema = z
	.object({
		type: z.literal("create"),
		payload: LobbyRoomSchema,
	})
	.or(
		z.object({
			type: z.literal("close"),
			payload: z.object(),
		}),
	)
	.or(
		z.object({
			type: z.literal("join"),
			payload: z.object({
				roomId: z.string(),
				user: UserSchema,
			}),
		}),
	)
	.or(
		z.object({
			type: z.literal("leave"),
			payload: z.object({
				roomId: z.string(),
				id: z.string(),
			}),
		}),
	);
