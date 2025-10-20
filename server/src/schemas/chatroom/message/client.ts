import z from "zod";
export type ChatRoomClientMessage = z.infer<typeof ChatRoomMessageClientSchema>;
export const ChatRoomMessageClientSchema = z
	.object({
		type: z.literal("init"),
		roomId: z.string(),
	})
	.or(
		z.object({
			type: z.literal("return"),
			success: z.boolean(),
		}),
	)
	.or(
		z.object({
			type: z.literal("error"),
			error: z.string(),
		}),
	);
