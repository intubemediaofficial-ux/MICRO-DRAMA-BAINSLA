import { beforeEach, describe, expect, it } from "vitest";
process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/microdrama";
process.env.SESSION_SECRET ??= "test-session-secret-123456";
process.env.STREAM_TOKEN_SECRET ??= "test-stream-secret-123456";
process.env.OTP_DEV_CODE ??= "123456";
const load = async () => import("../src/server/tokens");

describe("playback and ad tokens", () => {
  beforeEach(() => {
    process.env.STREAM_TOKEN_SECRET = "test-stream-secret-123456";
  });
  it("rejects tampering and accepts valid stream tokens", async () => {
    const { createStreamToken, verifyStreamToken } = await load();
    const token = createStreamToken("u1", "e1");
    expect(verifyStreamToken(token)).toEqual({ userId: "u1", episodeId: "e1" });
    expect(verifyStreamToken(`${token}x`)).toBeNull();
  });
  it("rejects expired stream tokens", async () => {
    const { createStreamToken, verifyStreamToken } = await load();
    const token = createStreamToken("u1", "e1", -1);
    expect(verifyStreamToken(token)).toBeNull();
  });
  it("creates ad completion tokens with a nonce", async () => {
    const { createAdToken, verifyAdToken } = await load();
    const token = createAdToken("u1", "e1");
    expect(verifyAdToken(token)).toMatchObject({ userId: "u1", episodeId: "e1" });
  });
});
