import z from "zod";
import { UserSchema } from "../user";

export type LobbyClientEvent = z.infer<typeof LobbyClientEventSchema>;

export const LobbyClientEventSchema = z
	.object({
		type: z.literal("create"),
		payload: z.object().optional(),
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
			type: z.literal("update"),
			payload: z.object({
				roomId: z.string(),
				users: z.array(UserSchema),
			}),
		}),
	);
