import { SimpleJwksCache } from "aws-jwt-verify/jwk";
import { verifyJwt } from "aws-jwt-verify/jwt-verifier";

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
