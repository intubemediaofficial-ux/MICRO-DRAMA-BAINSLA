import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ queryRaw: vi.fn() }));

vi.mock("@/server/db", () => ({ prisma: { $queryRaw: mocks.queryRaw } }));

import { getEngagementMetrics } from "@/server/analytics";

describe("engagement retention cohorts", () => {
  beforeEach(() => {
    mocks.queryRaw.mockResolvedValue([
      {
        dau: BigInt(2),
        active7d: BigInt(3),
        cohortUsers: BigInt(4),
        d1EligibleUsers: BigInt(3),
        d1Users: BigInt(2),
        d7EligibleUsers: BigInt(1),
        d7Users: BigInt(1),
      },
    ]);
  });

  it("uses signups at least one and seven full days old as retention denominators", async () => {
    const metrics = await getEngagementMetrics();
    const query = mocks.queryRaw.mock.calls[0][0] as { sql: string };
    const source = query.sql;
    expect(source).toContain(`FROM "UserActivityDay"`);
    expect(source).not.toContain(`FROM "WatchProgress"`);
    expect(source).toMatch(/SELECT id,\s*"createdAt",\s*"createdAt"::date AS day/);
    expect(source).toContain(`"createdAt" <= NOW() - INTERVAL '1 day'`);
    expect(source).toContain(`"createdAt" <= NOW() - INTERVAL '7 days'`);
    expect(metrics).toMatchObject({
      d1EligibleUsers: 3,
      d7EligibleUsers: 1,
      d1Retention: 2 / 3,
      d7Retention: 1,
    });
  });
});
