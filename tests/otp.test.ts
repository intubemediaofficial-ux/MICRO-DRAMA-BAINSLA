import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/microdrama";
  process.env.SESSION_SECRET ??= "test-session-secret-123456";
  process.env.STREAM_TOKEN_SECRET ??= "test-stream-secret-123456";
  process.env.OTP_DEV_CODE ??= "123456";
  process.env.CRON_SECRET ??= "test-cron-secret";
});

import { createOtpChallenge, normalizeIdentifier, verifyOtpChallenge } from "../src/server/otp";

const email = () => `otp-${crypto.randomUUID().slice(0, 8)}@test.local`;
const wrong = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, "0");

describe("email OTP challenges", () => {
  it("normalizes email identifiers", () => {
    expect(normalizeIdentifier("  User@Example.COM ")).toBe("user@example.com");
  });

  it("accepts the right code once", async () => {
    const id = email();
    const code = await createOtpChallenge(id);
    expect(await verifyOtpChallenge(id, wrong(code))).toBe(false);
    expect(await verifyOtpChallenge(id, code)).toBe(true);
    expect(await verifyOtpChallenge(id, code)).toBe(false);
  });

  it("locks the challenge after five wrong attempts", async () => {
    const id = email();
    const code = await createOtpChallenge(id);
    for (let i = 0; i < 5; i++) await verifyOtpChallenge(id, wrong(code));
    expect(await verifyOtpChallenge(id, code)).toBe(false);
  });
});
