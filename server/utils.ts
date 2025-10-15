import { SimpleJwksCache } from "aws-jwt-verify/jwk";
import type { JwtPayload } from "aws-jwt-verify/jwt-model";
import { verifyJwt } from "aws-jwt-verify/jwt-verifier";
import { UserSchema } from "./src/schemas/user";

const DEFAULT_ENDPOINT = "https://kippeves.kinde.com";
const jwksCache = new SimpleJwksCache();

export async function tryDecodeToken(token: string) {
	return await verifyJwt(
		token,
		`${DEFAULT_ENDPOINT}/.well-known/jwks`,
		{
			issuer: DEFAULT_ENDPOINT,
			audience: null,
		},
		jwksCache.getJwk.bind(jwksCache), // use JWKS cache (optional)
	);
}

export async function tryGetUser(payload: JwtPayload) {
	const { success, data, error } = UserSchema.safeParse({
		id: payload.sub,
		name: payload.name || payload.username,
		avatar: payload.picture,
	});
	if (success && data) return { success: true, user: data };
	if (!success) return { success: false, error };
}
