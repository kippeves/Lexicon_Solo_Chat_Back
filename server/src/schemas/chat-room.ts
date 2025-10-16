import z from "zod";
import { UserSchema } from "./user";

export type ChatRoomEvent = z.infer<typeof ChatRoomEventSchema>;

export const ChatRoomEventSchema = z
	.object({
		type: z.literal("user:join"),
		payload: z.object({
			user: UserSchema,
		}),
	})
	.or(
		z.object({
			type: z.literal("user:leave"),
			payload: UserSchema,
		}),
	)
	.or(
		z.object({
			type: z.literal("server:message"),
			payload: z.object({
				user: UserSchema,
				sent: z.date(),
				message: z.string(),
			}),
		}),
	)
	.or(
		z.object({
			type: z.literal("user:message"),
			payload: z.object({
				message: z.string(),
			}),
		}),
	);
