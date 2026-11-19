import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/microdrama";
  process.env.SESSION_SECRET ??= "test-session-secret-123456";
  return { token: "" };
});

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (state.token ? { value: state.token } : undefined),
    set: (_name: string, value: string) => {
      state.token = value;
    },
    delete: () => {
      state.token = "";
    },
  }),
}));

import { issueSession } from "@/server/auth";
import { prisma } from "@/server/db";
import { POST as formCheckin } from "@/app/api/checkin/route";
import { GET as getCheckin, POST as postCheckin } from "@/app/api/mobile/checkin/route";

const suffix = crypto.randomUUID().slice(0, 8);
let userId = "";

describe("mobile daily check-in", () => {
  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { email: `checkin-${suffix}@test.local`, referralCode: `CI${suffix}` },
    });
    userId = user.id;
    await issueSession({ userId, role: "USER" });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    state.token = "";
  });

  it("returns status, awards once, and preserves the web check-in route", async () => {
    const before = await (await getCheckin()).json();
    expect(before).toMatchObject({
      checkedInToday: false,
      streak: 0,
      nextReward: 5,
      rewards: [5, 8, 12, 16, 22, 30, 50],
    });

    const first = await postCheckin();
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ coinsAwarded: 5, streak: 1, balance: 5 });

    const duplicate = await postCheckin();
    expect(duplicate.status).toBe(409);
    expect((await duplicate.json()).error.message).toBe("Already checked in today");

    const legacy = await formCheckin();
    expect(legacy.status).toBe(200);
    expect(await legacy.json()).toMatchObject({ ok: true, streak: 1 });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).coinBalance).toBe(5);
  });
});
