import { afterEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/microdrama";
  process.env.SESSION_SECRET ??= "test-session-secret-123456";
  process.env.STREAM_TOKEN_SECRET ??= "test-stream-secret-123456";
});

vi.mock("@/server/settings", () => ({
  getSettings: async () => ({
    RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID || undefined,
    RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || undefined,
    RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET || undefined,
    PAYMENTS_ENABLED: process.env.PAYMENTS_ENABLED === "true",
  }),
}));

import { paymentsEnabled } from "@/server/subscription-providers";
import { purchasePlan, startTrial } from "@/server/subscriptions";

describe("payments gate", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("blocks purchases in production without a payment provider", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_DEV_PAYMENTS", "");
    vi.stubEnv("RAZORPAY_KEY_ID", "");
    vi.stubEnv("RAZORPAY_KEY_SECRET", "");
    expect(await paymentsEnabled()).toBe(false);
    await expect(purchasePlan("user", "VIP_MONTHLY", "INR", "IN")).rejects.toThrow(
      "PAYMENTS_UNAVAILABLE",
    );
    await expect(startTrial("user", "VIP_MONTHLY", "INR", "IN")).rejects.toThrow(
      "PAYMENTS_UNAVAILABLE",
    );
  });

  it("keeps checkout disabled when the Razorpay toggle is off", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_DEV_PAYMENTS", "");
    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_key");
    vi.stubEnv("RAZORPAY_KEY_SECRET", "rzp_test_secret");
    vi.stubEnv("PAYMENTS_ENABLED", "false");
    expect(await paymentsEnabled()).toBe(false);
  });

  it("requires Razorpay keys and the enabled toggle in every environment", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("PAYMENTS_ENABLED", "true");
    vi.stubEnv("RAZORPAY_KEY_ID", "");
    vi.stubEnv("RAZORPAY_KEY_SECRET", "");
    expect(await paymentsEnabled()).toBe(false);
    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_key");
    vi.stubEnv("RAZORPAY_KEY_SECRET", "rzp_test_secret");
    expect(await paymentsEnabled()).toBe(true);
  });
});
