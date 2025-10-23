import z from "zod";
import { LobbyRoomSchema } from "../lobbyroom";
import { UserSchema } from "../user";

export type LobbyServerEvent = z.infer<typeof LobbyServerEventSchema>;

export const LobbyServerEventSchema = z
	.object({
		type: z.literal("create"),
		payload: z.object({ room: LobbyRoomSchema }),
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
			type: z.literal("update"),
			payload: z.object({
				roomId: z.string(),
				users: z.array(UserSchema),
			}),
		}),
	)
	.or(
		z.object({
			type: z.literal("room"),
			payload: z.object({
				room: z.object(LobbyRoomSchema).nullable(),
			}),
		}),
	);
