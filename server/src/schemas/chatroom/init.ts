import z from "zod";
import { LobbyRoomSchema } from "../lobbyroom";
import { ChatRoomMessageServerSchema } from "./message/server";

export type ChatRoomInitData = z.infer<typeof ChatRoomInitDataSchema>;

export const ChatRoomInitDataSchema = z.object({
	info: LobbyRoomSchema,
	messages: z.array(ChatRoomMessageServerSchema),
});
