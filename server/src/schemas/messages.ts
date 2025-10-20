import * as z from "zod";
import { UserSchema } from "./user";

export const PresenceSchema = z.object({
	type: z.literal("presence"),
	payload: z.object({ users: z.array(UserSchema) }),
});
