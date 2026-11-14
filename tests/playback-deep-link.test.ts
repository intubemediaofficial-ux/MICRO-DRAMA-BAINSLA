import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  findPublicEpisode: vi.fn(),
  resolveEpisodeEntitlement: vi.fn(),
  resolveCurrency: vi.fn(),
  getSubscriptionOffers: vi.fn(),
  hasUsedTrial: vi.fn(),
}));

vi.mock("@/server/auth", () => ({ getSession: mocks.getSession }));
vi.mock("@/server/publishing", () => ({ findPublicEpisode: mocks.findPublicEpisode }));
vi.mock("@/server/entitlements", () => ({ resolveEpisodeEntitlement: mocks.resolveEpisodeEntitlement }));
vi.mock("@/server/currency", () => ({ resolveCurrency: mocks.resolveCurrency }));
vi.mock("@/server/subscriptions", () => ({
  getSubscriptionOffers: mocks.getSubscriptionOffers,
  hasUsedTrial: mocks.hasUsedTrial,
}));
vi.mock("@/server/db", () => ({ prisma: { user: { findUniqueOrThrow: vi.fn() } } }));

import { GET } from "@/app/api/episodes/[id]/playback/route";

describe("playback deep links", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ userId: "user-1" });
    mocks.findPublicEpisode.mockResolvedValue({
      id: "episode-1",
      series: { slug: "sample-series" },
      coinPrice: 10,
      hlsPath: "sample.mp4",
      subtitles: [],
    });
    mocks.resolveEpisodeEntitlement.mockResolvedValue({ entitled: false });
    mocks.resolveCurrency.mockResolvedValue("USD");
    mocks.getSubscriptionOffers.mockResolvedValue([]);
    mocks.hasUsedTrial.mockResolvedValue(false);
  });

  it("includes the series slug when an episode is locked", async () => {
    const response = await GET(new Request("http://localhost/api/episodes/episode-1/playback"), {
      params: Promise.resolve({ id: "episode-1" }),
    });
    expect(response.status).toBe(403);
    expect((await response.json()).seriesSlug).toBe("sample-series");
  });
});
