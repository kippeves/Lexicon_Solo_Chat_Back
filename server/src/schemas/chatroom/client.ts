import z from "zod";

export type ChatRoomClientEvent = z.infer<typeof ChatRoomClientEventSchema>;

export const ChatRoomClientEventSchema = z
	.object({
		type: z.literal("message"),
		payload: z.object({
			message: z.string(),
		}),
	})
	.or(
		z.object({
			type: z.literal("clear"),
		}),
	)
	.or(
		z.object({
			type: z.literal("close"),
		}),
	);
