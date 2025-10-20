import z from "zod";

export type LobbyClientEvent = z.infer<typeof LobbyClientEventSchema>;

export const LobbyClientEventSchema = z.object({
	type: z.literal("create"),
	payload: {},
});
