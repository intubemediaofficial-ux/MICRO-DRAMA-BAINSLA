import { beforeAll, afterAll, describe, expect, it } from "vitest";

import { prisma } from "../src/server/db";
import { getDiscovery, getWatchedEpisodeIds } from "../src/server/discovery";

const suffix = crypto.randomUUID();
let userId = "";
let coldUserId = "";
let trendUserId = "";
let seriesIds: string[] = [];
let sourceEpisodeId = "";

describe("personalized discovery", () => {
  beforeAll(async () => {
    const [user, coldUser, trendUser] = await Promise.all([
      prisma.user.create({
        data: { email: `for-you-${suffix}@test.local`, referralCode: `FY${suffix.slice(0, 8)}` },
      }),
      prisma.user.create({
        data: { email: `cold-${suffix}@test.local`, referralCode: `CL${suffix.slice(0, 8)}` },
      }),
      prisma.user.create({
        data: { email: `trend-${suffix}@test.local`, referralCode: `TR${suffix.slice(0, 8)}` },
      }),
    ]);
    userId = user.id;
    coldUserId = coldUser.id;
    trendUserId = trendUser.id;
    const source = await prisma.series.create({
      data: {
        slug: `for-you-source-${suffix}`,
        title: "Affinity Source",
        synopsis: "Source",
        posterUrl: "",
        teaserUrl: "",
        genres: ["romance"],
        tropeTags: ["slow-burn"],
        castNames: [],
        isPublished: true,
        episodes: {
          create: {
            number: 1,
            title: "Source episode",
            durationSec: 60,
            hlsPath: "sample.mp4",
            thumbnailUrl: "",
            isFree: true,
            coinPrice: 1,
            publishedAt: new Date(),
          },
        },
      },
      include: { episodes: true },
    });
    const target = await prisma.series.create({
      data: {
        slug: `for-you-target-${suffix}`,
        title: "Affinity Target",
        synopsis: "Target",
        posterUrl: "",
        teaserUrl: "",
        genres: ["romance"],
        tropeTags: ["second-chance"],
        castNames: [],
        isPublished: true,
        episodes: {
          create: {
            number: 1,
            title: "Target episode",
            durationSec: 60,
            hlsPath: "sample.mp4",
            thumbnailUrl: "",
            isFree: true,
            coinPrice: 1,
            publishedAt: new Date(),
          },
        },
      },
      include: { episodes: true },
    });
    seriesIds = [source.id, target.id];
    sourceEpisodeId = source.episodes[0].id;
    await prisma.watchProgress.create({
      data: { userId, episodeId: sourceEpisodeId, positionSec: 20 },
    });
    await prisma.episodeUnlock.create({
      data: { userId: trendUserId, episodeId: target.episodes[0].id, source: "COIN" },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [userId, coldUserId, trendUserId] } } });
    await prisma.series.deleteMany({ where: { id: { in: seriesIds } } });
    await prisma.$disconnect();
  });

  it("ranks For You deterministically from watch affinity", async () => {
    const first = await getDiscovery(userId);
    const second = await getDiscovery(userId);
    expect(first.forYou.map((item) => item.id)).toEqual(second.forYou.map((item) => item.id));
    expect(first.forYou.map((item) => item.id)).toContain(seriesIds[1]);
  });

  it("falls back to trending for a cold-start user", async () => {
    const discovery = await getDiscovery(coldUserId);
    expect(discovery.forYou.map((item) => item.id)).toEqual(
      discovery.trending.map((item) => item.id),
    );
  });

  it("derives Watched from existing progress rows", async () => {
    const watched = await getWatchedEpisodeIds(userId, [sourceEpisodeId]);
    expect(watched.has(sourceEpisodeId)).toBe(true);
    expect((await getWatchedEpisodeIds(coldUserId, [sourceEpisodeId])).has(sourceEpisodeId)).toBe(
      false,
    );
  });
});
