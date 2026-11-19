import { afterAll, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/microdrama";
});

import { prisma } from "@/server/db";
import { getEngagementMetrics } from "@/server/analytics";

describe("engagement analytics database query", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("executes the cohort query against PostgreSQL", async () => {
    await expect(getEngagementMetrics()).resolves.toEqual(
      expect.objectContaining({
        dau: expect.any(Number),
        active7d: expect.any(Number),
        cohortUsers: expect.any(Number),
        d1EligibleUsers: expect.any(Number),
        d7EligibleUsers: expect.any(Number),
      }),
    );
  });
});
