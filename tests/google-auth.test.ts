import { describe, expect, it } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { verifyGoogleIdToken } from "@/server/google-auth";

const audience = "google-web-client.apps.googleusercontent.com";

async function signedToken(
  claims: { email_verified: boolean },
  aud = audience,
) {
  const { privateKey, publicKey } = await generateKeyPair("ES256");
  const jwk = await exportJWK(publicKey);
  jwk.kid = "local-google-key";
  jwk.alg = "ES256";
  jwk.use = "sig";
  const keySet = createLocalJWKSet({ keys: [jwk] });
  const token = await new SignJWT({
    email: "person@example.test",
    name: "Test Person",
    ...claims,
  })
    .setProtectedHeader({ alg: "ES256", kid: "local-google-key" })
    .setIssuer("https://accounts.google.com")
    .setAudience(aud)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
  return { token, keySet };
}

describe("Google identity token verification", () => {
  it("rejects a token with the wrong audience", async () => {
    const { token, keySet } = await signedToken({ email_verified: true }, "other-client");
    await expect(verifyGoogleIdToken(token, audience, keySet)).rejects.toThrow();
  });

  it("rejects an unverified email and returns normalized verified identities", async () => {
    const unverified = await signedToken({ email_verified: false });
    await expect(verifyGoogleIdToken(unverified.token, audience, unverified.keySet)).rejects.toThrow(
      "GOOGLE_EMAIL_UNVERIFIED",
    );

    const verified = await signedToken({ email_verified: true });
    await expect(verifyGoogleIdToken(verified.token, audience, verified.keySet)).resolves.toEqual({
      email: "person@example.test",
      name: "Test Person",
    });
  });
});
