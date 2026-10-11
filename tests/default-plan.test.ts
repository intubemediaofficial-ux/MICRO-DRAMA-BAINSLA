import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/microdrama";
  process.env.SESSION_SECRET ??= "test-session-secret-123456";
  process.env.STREAM_TOKEN_SECRET ??= "test-stream-secret-123456";
  process.env.OTP_DEV_CODE ??= "123456";
  process.env.CRON_SECRET ??= "test-cron-secret";
});

import { prisma } from "../src/server/db";
import { DEFAULT_PLAN_CODE, getSubscriptionOffer } from "../src/server/subscriptions";

const code = `TEST_FALLBACK_${crypto.randomUUID().slice(0, 8)}`;
let defaultWasActive: boolean | null = null;

describe("default plan fallback", () => {
  beforeAll(async () => {
    const existing = await prisma.plan.findUnique({ where: { code: DEFAULT_PLAN_CODE } });
    defaultWasActive = existing?.isActive ?? null;
    if (existing)
      await prisma.plan.update({ where: { id: existing.id }, data: { isActive: false } });
    await prisma.plan.create({
      data: {
        code,
        name: "Fallback VIP",
        createdAt: new Date(0),
        prices: { create: { currency: "INR", amountMinor: 49_900, trialAmountMinor: 900 } },
      },
    });
  });

  afterAll(async () => {
    await prisma.plan.delete({ where: { code } });
    if (defaultWasActive !== null)
      await prisma.plan.update({
        where: { code: DEFAULT_PLAN_CODE },
        data: { isActive: defaultWasActive },
      });
  });

  it("uses the oldest active plan when the default plan code is missing", async () => {
    const offer = await getSubscriptionOffer(DEFAULT_PLAN_CODE, "INR");
    expect(offer?.plan.code).toBe(code);
    expect(offer?.price.amountMinor).toBe(49_900);
  });

  it("does not fall back for an explicit unknown plan code", async () => {
    expect(await getSubscriptionOffer("NO_SUCH_PLAN", "INR")).toBeNull();
  });
});
