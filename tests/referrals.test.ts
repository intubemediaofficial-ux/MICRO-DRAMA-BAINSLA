import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { findOrCreateUser } from "@/server/auth";

const suffix = crypto.randomUUID().slice(0, 8);
const userIds: string[] = [];

async function createUser(label: string, disabled = false) {
  const user = await prisma.user.create({
    data: {
      email: `referral-${label}-${suffix}@test.local`,
      referralCode: `RF${label.toUpperCase()}${suffix}`,
      isDisabled: disabled,
    },
  });
  userIds.push(user.id);
  return user;
}

describe("signup referrals", () => {
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("credits a new referred user and referrer once, but not on existing-user login", async () => {
    const referrer = await createUser("owner");
    const signupEmail = `referral-new-${suffix}@test.local`;
    const signup = await findOrCreateUser(signupEmail, referrer.referralCode);
    userIds.push(signup.id);
    expect(signup.referredById).toBe(referrer.id);
    expect(
      await prisma.coinTransaction.count({
        where: { refType: "referral", refId: referrer.id, userId: signup.id },
      }),
    ).toBe(1);
    expect(
      await prisma.coinTransaction.count({
        where: { refType: "referral", refId: signup.id, userId: referrer.id },
      }),
    ).toBe(1);

    await findOrCreateUser(signupEmail, referrer.referralCode);
    expect(
      await prisma.coinTransaction.count({
        where: { refType: "referral", refId: signup.id },
      }),
    ).toBe(1);
  });

  it("ignores self and disabled referrals and caps rewards at 20 in a rolling 30 days", async () => {
    const referrer = await createUser("cap");
    const self = await findOrCreateUser(referrer.email!, referrer.referralCode);
    expect(self.id).toBe(referrer.id);
    expect(self.referredById).toBeNull();

    const disabled = await createUser("disabled", true);
    const ignored = await findOrCreateUser(
      `referral-ignored-${suffix}@test.local`,
      disabled.referralCode,
    );
    userIds.push(ignored.id);
    expect(ignored.referredById).toBeNull();

    await prisma.coinTransaction.createMany({
      data: Array.from({ length: 20 }, (_, index) => ({
        id: `ref-cap-${suffix}-${index}`,
        userId: referrer.id,
        delta: 50,
        type: "REFERRAL_BONUS" as const,
        balanceAfter: 1_000,
        refType: "referral",
        refId: `prior-${index}`,
      })),
    });
    const before = await prisma.user.findUniqueOrThrow({
      where: { id: referrer.id },
      select: { coinBalance: true },
    });
    const capped = await findOrCreateUser(
      `referral-capped-${suffix}@test.local`,
      referrer.referralCode,
    );
    userIds.push(capped.id);
    expect(capped.referredById).toBe(referrer.id);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: referrer.id } })).coinBalance).toBe(
      before.coinBalance,
    );
    expect(
      await prisma.coinTransaction.count({
        where: { userId: capped.id, type: "REFERRAL_BONUS" },
      }),
    ).toBe(0);
  });
});
