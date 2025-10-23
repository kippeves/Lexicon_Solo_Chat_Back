import z from "zod";
import { UserSchema } from "./user";

export const UserStateSchema = z
	.object({
		user: UserSchema.nullable().optional(),
	})
	.nullable();

export type UserState = z.infer<typeof UserStateSchema>;
