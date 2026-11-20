import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ upsert: vi.fn() }));

vi.mock("@/server/db", () => ({
  prisma: { userActivityDay: { upsert: mocks.upsert } },
}));

import { recordUserActivityDay } from "@/server/activity";

describe("daily user activity", () => {
  it("upserts one UTC calendar day per user", async () => {
    mocks.upsert.mockResolvedValue({});
    await recordUserActivityDay("user-1", new Date("2026-11-14T23:45:00.000Z"));
    const day = new Date("2026-11-14T00:00:00.000Z");
    expect(mocks.upsert).toHaveBeenCalledWith({
      where: { userId_day: { userId: "user-1", day } },
      create: { userId: "user-1", day },
      update: {},
    });
  });
});
