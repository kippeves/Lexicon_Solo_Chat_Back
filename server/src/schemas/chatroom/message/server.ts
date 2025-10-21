import z from "zod";
import { UserSchema } from "../../user";

export type ChatRoomMessageServer = z.infer<typeof ChatRoomMessageServerSchema>;

export const ChatRoomMessageServerSchema = z.object({
	user: UserSchema,
	sent: z.date(),
	message: z.string(),
});
