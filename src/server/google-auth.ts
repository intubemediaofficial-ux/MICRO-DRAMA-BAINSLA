import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

const googleJwks = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);

export async function verifyGoogleIdToken(
  idToken: string,
  audience: string,
  keySet: JWTVerifyGetKey = googleJwks,
) {
  const { payload } = await jwtVerify(idToken, keySet, {
    issuer: ["accounts.google.com", "https://accounts.google.com"],
    audience,
  });
  if (payload.email_verified !== true || typeof payload.email !== "string")
    throw new Error("GOOGLE_EMAIL_UNVERIFIED");
  return {
    email: payload.email.trim().toLowerCase(),
    name: typeof payload.name === "string" ? payload.name.slice(0, 150) : undefined,
  };
}
