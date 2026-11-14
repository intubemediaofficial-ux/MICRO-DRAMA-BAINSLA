import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  recordActivity: vi.fn(),
  findPublicEpisode: vi.fn(),
  progressUpsert: vi.fn(),
  rateLimit: vi.fn(),
  seriesFindFirst: vi.fn(),
  eventsCreateMany: vi.fn(),
  claimDailyCheckin: vi.fn(),
}));

vi.mock("@/server/auth", () => ({ getSession: mocks.getSession }));
vi.mock("@/server/activity", () => ({ recordUserActivityDay: mocks.recordActivity }));
vi.mock("@/server/publishing", () => ({
  findPublicEpisode: mocks.findPublicEpisode,
  publicSeriesWhere: { isPublished: true },
}));
vi.mock("@/server/rate-limit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("@/server/coins", () => ({
  claimDailyCheckin: mocks.claimDailyCheckin,
}));
vi.mock("@/server/db", () => ({
  prisma: {
    watchProgress: { upsert: mocks.progressUpsert },
    analyticsEvent: { createMany: mocks.eventsCreateMany },
    series: { findFirst: mocks.seriesFindFirst },
  },
}));

import { POST as progressPost } from "@/app/api/progress/route";
import { POST as eventsPost } from "@/app/api/events/route";
import { POST as checkinPost } from "@/app/api/mobile/checkin/route";

describe("daily activity route tracking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ userId: "user-1" });
    mocks.recordActivity.mockRejectedValue(new Error("activity store unavailable"));
    mocks.findPublicEpisode.mockResolvedValue({ seriesId: "series-1" });
    mocks.progressUpsert.mockResolvedValue({ id: "progress-1" });
    mocks.rateLimit.mockReturnValue(true);
    mocks.seriesFindFirst.mockResolvedValue({ id: "series-1" });
    mocks.eventsCreateMany.mockResolvedValue({ count: 1 });
    mocks.claimDailyCheckin.mockResolvedValue({
      alreadyCheckedIn: false,
      coinsAwarded: 5,
      checkin: { streak: 1 },
      balance: 5,
    });
  });

  it("tracks successful progress saves without waiting for the activity write", async () => {
    const response = await progressPost(new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ episodeId: "episode-1", positionSec: 4 }),
    }));
    expect(response.status).toBe(200);
    expect(mocks.recordActivity).toHaveBeenCalledWith("user-1");
  });

  it("tracks authenticated event batches without waiting for the activity write", async () => {
    const response = await eventsPost(new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ events: [{ name: "app_open" }] }),
    }));
    expect(response.status).toBe(202);
    expect(mocks.recordActivity).toHaveBeenCalledWith("user-1");
  });

  it("tracks successful check-ins without waiting for the activity write", async () => {
    const response = await checkinPost();
    expect(response.status).toBe(200);
    expect(mocks.recordActivity).toHaveBeenCalledWith("user-1");
  });
});
