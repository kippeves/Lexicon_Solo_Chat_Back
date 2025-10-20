import z from "zod";
import { UserSchema } from "../user";

export type ChatRoomServerEvent = z.infer<typeof ChatRoomServerEventSchema>;

export const ChatRoomServerEventSchema = z
	.object({
		type: z.literal("join"),
		payload: z.object({
			user: UserSchema,
		}),
	})
	.or(
		z.object({
			type: z.literal("leave"),
			payload: z.object({
				user: UserSchema,
			}),
		}),
	)
	.or(
		z.object({
			type: z.literal("message"),
			payload: z.object({
				user: UserSchema,
				sent: z.date(),
				message: z.string(),
			}),
		}),
	);
