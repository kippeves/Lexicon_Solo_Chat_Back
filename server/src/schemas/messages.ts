import * as z from "zod";
import { UserSchema } from "./user";

export const UsersMessageSchema = z.object({
	type: z.literal("presence"),
	payload: z.object({ users: z.array(UserSchema) }),
});

export const RoomsMessageSchema = z.object({
	type: z.literal("roomCreated"),
	payload: z.object({ room: {} }),
});
