import z from "zod";
import { LobbyRoomSchema } from "../lobbyroom";
import { UserSchema } from "../user";

export type LobbyClientEvent = z.infer<typeof LobbyClientEventSchema>;

export const LobbyClientEventSchema = z
	.object({
		type: z.literal("create"),
		payload: z.object({
			room: LobbyRoomSchema,
		}),
	})
	.or(
		z.object({
			type: z.literal("close"),
			payload: z.object({
				roomId: z.string(),
			}),
		}),
	)
	.or(
		z.object({
			type: z.literal("room"),
			payload: z.object({
				roomId: z.string(),
			}),
		}),
	)
	.or(
		z.object({
			type: z.literal("join"),
			payload: z.object({
				user: UserSchema,
				roomId: z.string(),
			}),
		}),
	)
	.or(
		z.object({
			type: z.literal("leave"),
			payload: z.object({
				roomId: z.string(),
				userId: z.string(),
			}),
		}),
	);
