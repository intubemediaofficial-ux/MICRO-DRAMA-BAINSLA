import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findLog: vi.fn(),
  count: vi.fn(),
  findOldLogs: vi.fn(),
  deleteLogs: vi.fn(),
  upsert: vi.fn(),
  update: vi.fn(),
  findPage: vi.fn(),
  findPost: vi.fn(),
  findSeries: vi.fn(),
  findRedirect: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  prisma: {
    notFoundLog: {
      findUnique: mocks.findLog,
      count: mocks.count,
      findMany: mocks.findOldLogs,
      deleteMany: mocks.deleteLogs,
      upsert: mocks.upsert,
      update: mocks.update,
    },
    contentPage: { findFirst: mocks.findPage },
    blogPost: { findFirst: mocks.findPost },
    series: { findFirst: mocks.findSeries },
    redirect: { findFirst: mocks.findRedirect },
  },
}));

import { POST } from "@/app/api/seo/not-found/route";

describe("public 404 logging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findLog.mockResolvedValue(null);
    mocks.count.mockResolvedValue(2000);
    mocks.findOldLogs.mockResolvedValue([{ id: "old-entry" }]);
    mocks.deleteLogs.mockResolvedValue({ count: 1 });
    mocks.upsert.mockResolvedValue({});
    mocks.update.mockResolvedValue({});
    mocks.findPage.mockResolvedValue(null);
    mocks.findPost.mockResolvedValue(null);
    mocks.findSeries.mockResolvedValue(null);
    mocks.findRedirect.mockResolvedValue(null);
  });

  it("evicts the stalest low-hit entry before recording a new path at capacity", async () => {
    const response = await POST(
      new Request("http://localhost/api/seo/not-found", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.8",
        },
        body: JSON.stringify({ path: "/missing-story" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.findOldLogs).toHaveBeenCalledWith({
      orderBy: [{ lastSeenAt: "asc" }, { hits: "asc" }],
      take: 1,
      select: { id: true },
    });
    expect(mocks.deleteLogs).toHaveBeenCalledWith({ where: { id: { in: ["old-entry"] } } });
    expect(mocks.upsert).toHaveBeenCalled();
  });

  it("does not log published content", async () => {
    mocks.findPost.mockResolvedValueOnce({ id: "published-post" });
    const response = await POST(
      new Request("http://localhost/api/seo/not-found", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
        body: JSON.stringify({ path: "/blog/published-post" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.findLog).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("checks redirects only for routes that resolve them and still logs other 404s", async () => {
    mocks.findRedirect.mockResolvedValue({ id: "active-redirect" });
    for (const [index, path] of [
      [0, "/blog/moved-post"],
      [1, "/series/moved-series"],
    ] as const) {
      const response = await POST(
        new Request("http://localhost/api/seo/not-found", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": `203.0.113.${20 + index}`,
          },
          body: JSON.stringify({ path }),
        }),
      );
      expect(response.status).toBe(200);
    }
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.findRedirect).toHaveBeenCalledTimes(2);

    for (const [index, path] of [
      [0, "/watch/missing-episode"],
      [1, "/subscribe"],
      [2, "/admin/series/missing-id"],
    ] as const) {
      const response = await POST(
        new Request("http://localhost/api/seo/not-found", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": `203.0.113.${30 + index}`,
          },
          body: JSON.stringify({ path }),
        }),
      );
      expect(response.status).toBe(200);
    }
    expect(mocks.findRedirect).toHaveBeenCalledTimes(2);
    expect(mocks.upsert).toHaveBeenCalledTimes(3);
  });
});
