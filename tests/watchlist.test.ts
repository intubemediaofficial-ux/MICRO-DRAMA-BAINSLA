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
import { POST as addWatchlist } from "@/app/api/watchlist/route";
import { DELETE as removeWatchlist } from "@/app/api/watchlist/route";
import { GET as mobileWatchlist } from "@/app/api/mobile/watchlist/route";
import { GET as mobileSeries } from "@/app/api/mobile/series/[slug]/route";

const suffix = crypto.randomUUID().slice(0, 8);
let userId = "";
let publicSeriesId = "";
let draftSeriesId = "";
let publicSlug = "";

describe("watchlist", () => {
  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { email: `watchlist-${suffix}@test.local`, referralCode: `WL${suffix}` },
    });
    userId = user.id;
    publicSlug = `watchlist-public-${suffix}`;
    const [publicSeries, draftSeries] = await Promise.all([
      prisma.series.create({
        data: {
          slug: publicSlug,
          title: "Public watchlist series",
          synopsis: "Public",
          posterUrl: "/poster.jpg",
          teaserUrl: "",
          genres: [],
          tropeTags: [],
          castNames: [],
          isPublished: true,
          episodes: {
            create: {
              number: 1,
              title: "Published",
              durationSec: 60,
              hlsPath: "watchlist/public.m3u8",
              thumbnailUrl: "/poster.jpg",
              coinPrice: 1,
              publishedAt: new Date(),
            },
          },
        },
      }),
      prisma.series.create({
        data: {
          slug: `watchlist-draft-${suffix}`,
          title: "Draft-only watchlist series",
          synopsis: "Draft",
          posterUrl: "/poster.jpg",
          teaserUrl: "",
          genres: [],
          tropeTags: [],
          castNames: [],
          isPublished: true,
          episodes: {
            create: {
              number: 1,
              title: "Draft",
              durationSec: 60,
              hlsPath: "watchlist/draft.m3u8",
              thumbnailUrl: "/poster.jpg",
              coinPrice: 1,
              publishedAt: null,
            },
          },
        },
      }),
    ]);
    publicSeriesId = publicSeries.id;
    draftSeriesId = draftSeries.id;
    await prisma.watchlistItem.create({ data: { userId, seriesId: draftSeriesId } });
    await issueSession({ userId, role: "USER" });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.series.deleteMany({ where: { id: { in: [publicSeriesId, draftSeriesId] } } });
    state.token = "";
  });

  it("rejects non-public series and only returns public series cards", async () => {
    const rejected = await addWatchlist(
      new Request("http://localhost/api/watchlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ seriesId: draftSeriesId }),
      }),
    );
    expect(rejected.status).toBe(404);

    const added = await addWatchlist(
      new Request("http://localhost/api/watchlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ seriesId: publicSeriesId }),
      }),
    );
    expect(added.status).toBe(200);
    const list = await (await mobileWatchlist()).json();
    expect(list.items.map((item: { id: string }) => item.id)).toEqual([publicSeriesId]);

    const detail = await (
      await mobileSeries(new Request("http://localhost"), {
        params: Promise.resolve({ slug: publicSlug }),
      })
    ).json();
    expect(detail.inWatchlist).toBe(true);

    const removed = await removeWatchlist(
      new Request("http://localhost/api/watchlist", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ seriesId: publicSeriesId }),
      }),
    );
    expect(removed.status).toBe(200);
    expect(
      await prisma.watchlistItem.findUnique({
        where: { userId_seriesId: { userId, seriesId: publicSeriesId } },
      }),
    ).toBeNull();
  });
});
