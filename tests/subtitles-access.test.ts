import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  findPublicEpisode: vi.fn(),
  resolveEpisodeEntitlement: vi.fn(),
}));

vi.mock("@/server/auth", () => ({ getSession: mocks.getSession }));
vi.mock("@/server/publishing", () => ({ findPublicEpisode: mocks.findPublicEpisode }));
vi.mock("@/server/entitlements", () => ({ resolveEpisodeEntitlement: mocks.resolveEpisodeEntitlement }));
vi.mock("@/server/config", () => ({ env: { MEDIA_DIR: "/media" } }));
vi.mock("@/server/db", () => ({ prisma: { subtitle: { findUnique: vi.fn() } } }));

import { GET } from "@/app/api/episodes/[id]/subtitles/[lang]/route";

describe("subtitle authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue(null);
    mocks.findPublicEpisode.mockResolvedValue({ id: "episode-1" });
    mocks.resolveEpisodeEntitlement.mockResolvedValue({ entitled: false });
  });

  it("does not serve subtitles for a locked episode", async () => {
    const response = await GET(new Request("http://localhost/api/episodes/episode-1/subtitles/en"), {
      params: Promise.resolve({ id: "episode-1", lang: "en" }),
    });
    expect(response.status).toBe(403);
  });
});
