import z from "zod";
import { UserSchema } from "./user";

export const ConnectionStateSchema = z
	.object({
		user: UserSchema.nullable().optional(),
	})
	.nullable();

export type ConnectionState = z.infer<typeof ConnectionStateSchema>;
