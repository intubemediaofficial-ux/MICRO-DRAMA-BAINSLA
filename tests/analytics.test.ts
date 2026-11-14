import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ queryRaw: vi.fn() }));

vi.mock("@/server/db", () => ({ prisma: { $queryRaw: mocks.queryRaw } }));

import { getEngagementMetrics } from "@/server/analytics";

describe("engagement retention cohorts", () => {
  beforeEach(() => {
    mocks.queryRaw.mockResolvedValue([
      {
        dau: 2n,
        active7d: 3n,
        cohortUsers: 4n,
        d1EligibleUsers: 3n,
        d1Users: 2n,
        d7EligibleUsers: 1n,
        d7Users: 1n,
      },
    ]);
  });

  it("uses signups at least one and seven full days old as retention denominators", async () => {
    const metrics = await getEngagementMetrics();
    const query = mocks.queryRaw.mock.calls[0][0] as { sql: string[] };
    const source = query.sql.join(" ");
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
