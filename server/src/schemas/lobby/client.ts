import z from "zod";

export type LobbyClientEvent = z.infer<typeof LobbyClientEventSchema>;

export const LobbyClientEventSchema = z
	.object({
		type: z.literal("create"),
		payload: z.object({}),
	})
	.or(
		z.object({
			type: z.literal("room"),
			payload: z.object({
				roomId: z.string(),
			}),
		}),
	);
