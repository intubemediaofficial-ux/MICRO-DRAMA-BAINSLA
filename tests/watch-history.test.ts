import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "../src/server/db";
import {
  collapseLatestProgress,
  getWatchHistory,
  progressPercentage,
  resumePosition,
} from "../src/server/watch-history";

const suffix = crypto.randomUUID();
let firstUserId = "";
let secondUserId = "";
let seriesId = "";
let firstEpisodeId = "";
let secondEpisodeId = "";

describe("watch history", () => {
  beforeAll(async () => {
    const [firstUser, secondUser] = await Promise.all([
      prisma.user.create({
        data: {
          email: `history-first-${suffix}@test.local`,
          referralCode: `HF${suffix.slice(0, 8)}`,
        },
      }),
      prisma.user.create({
        data: {
          email: `history-second-${suffix}@test.local`,
          referralCode: `HS${suffix.slice(0, 8)}`,
        },
      }),
    ]);
    firstUserId = firstUser.id;
    secondUserId = secondUser.id;
    const series = await prisma.series.create({
      data: {
        slug: `watch-history-${suffix}`,
        title: "Watch History Fixture",
        synopsis: "Fixture",
        posterUrl: "/fixture.jpg",
        teaserUrl: "",
        genres: [],
        tropeTags: [],
        castNames: [],
        isPublished: true,
        seasons: { create: { number: 1, title: "Season 1" } },
        episodes: {
          create: [
            {
              number: 1,
              title: "First episode",
              durationSec: 100,
              hlsPath: "sample.mp4",
              thumbnailUrl: "/fixture.jpg",
              coinPrice: 1,
              publishedAt: new Date(),
            },
            {
              number: 2,
              title: "Second episode",
              durationSec: 200,
              hlsPath: "sample.mp4",
              thumbnailUrl: "/fixture.jpg",
              coinPrice: 1,
              publishedAt: new Date(),
            },
          ],
        },
      },
      include: { episodes: true },
    });
    seriesId = series.id;
    firstEpisodeId = series.episodes.find((episode) => episode.number === 1)?.id ?? "";
    secondEpisodeId = series.episodes.find((episode) => episode.number === 2)?.id ?? "";
    const older = new Date(Date.now() - 60_000);
    const newer = new Date(Date.now() - 10_000);
    await prisma.watchProgress.createMany({
      data: [
        { userId: firstUserId, episodeId: firstEpisodeId, positionSec: 25, updatedAt: older },
        { userId: firstUserId, episodeId: secondEpisodeId, positionSec: 100, updatedAt: newer },
        { userId: secondUserId, episodeId: firstEpisodeId, positionSec: 90, updatedAt: newer },
      ],
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [firstUserId, secondUserId] } } });
    await prisma.series.delete({ where: { id: seriesId } });
  });

  it("keeps history isolated to the session user and orders it most recently watched first", async () => {
    const firstHistory = await getWatchHistory(firstUserId);
    const secondHistory = await getWatchHistory(secondUserId);

    expect(firstHistory.map((item) => item.episodeId)).toEqual([secondEpisodeId, firstEpisodeId]);
    expect(firstHistory.every((item) => item.positionSec !== 90)).toBe(true);
    expect(secondHistory.map((item) => item.episodeId)).toEqual([firstEpisodeId]);
    expect(secondHistory[0]?.positionSec).toBe(90);
  });

  it("collapses legacy duplicate progress rows to the latest row", () => {
    const older = new Date("2026-01-01T00:00:00.000Z");
    const newer = new Date("2026-01-02T00:00:00.000Z");
    const rows = [
      {
        id: "old",
        userId: firstUserId,
        episodeId: "episode-1",
        positionSec: 10,
        completed: false,
        updatedAt: older,
      },
      {
        id: "new",
        userId: firstUserId,
        episodeId: "episode-1",
        positionSec: 80,
        completed: false,
        updatedAt: newer,
      },
    ];

    expect(collapseLatestProgress(rows)).toEqual([rows[1]]);
  });

  it("derives bounded progress and restarts finished episodes from the beginning", () => {
    expect(progressPercentage(25, 100)).toBe(25);
    expect(progressPercentage(120, 100)).toBe(100);
    expect(progressPercentage(50, 100, true)).toBe(100);
    expect(progressPercentage(0, 0)).toBe(0);
    expect(resumePosition(25, 100)).toBe(25);
    expect(resumePosition(100, 100)).toBe(0);
    expect(resumePosition(120, 100)).toBe(0);
    expect(resumePosition(50, 100, true)).toBe(0);
  });
});
