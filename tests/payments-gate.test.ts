import { afterEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/microdrama";
  process.env.SESSION_SECRET ??= "test-session-secret-123456";
  process.env.STREAM_TOKEN_SECRET ??= "test-stream-secret-123456";
});

import { paymentsEnabled } from "@/server/subscription-providers";
import { purchasePlan, startTrial } from "@/server/subscriptions";

describe("payments gate", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("blocks purchases in production without a payment provider", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_DEV_PAYMENTS", "");
    expect(paymentsEnabled()).toBe(false);
    await expect(purchasePlan("user", "VIP_MONTHLY", "INR", "IN")).rejects.toThrow(
      "PAYMENTS_UNAVAILABLE",
    );
    await expect(startTrial("user", "VIP_MONTHLY", "INR", "IN")).rejects.toThrow(
      "PAYMENTS_UNAVAILABLE",
    );
  });

  it("allows dev payments outside production", () => {
    vi.stubEnv("NODE_ENV", "test");
    expect(paymentsEnabled()).toBe(true);
  });
});
