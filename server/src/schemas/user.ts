import { z } from "zod";

export const UserSchema = z.object({
	id: z.string(),
	name: z.string(),
	avatar: z.url(),
});

export type User = z.infer<typeof UserSchema>;
