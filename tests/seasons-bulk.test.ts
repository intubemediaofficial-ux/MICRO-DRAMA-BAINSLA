import { describe, expect, it } from "vitest";
import { SeriesStatus } from "@prisma/client";
import { prisma } from "../src/server/db";
import {
  buildEpisodeUploadMetadata,
  canDeleteSeason,
  duplicateSkuMessage,
  episodeNumberConflictMessage,
  findEpisodeNumberCollision,
  seasonHasEpisodesMessage,
} from "../src/server/episode-validation";

describe("seasons and bulk episode safeguards", () => {
  it("backfills an unassigned episode without changing its identity or number", async () => {
    const slug = `season-backfill-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let seriesId: string | undefined;
    try {
      const series = await prisma.series.create({
        data: {
          slug,
          title: "Season Backfill Fixture",
          synopsis: "Fixture",
          posterUrl: "/fixture.jpg",
          teaserUrl: "/fixture.mp4",
          status: SeriesStatus.ONGOING,
          genres: [],
          tropeTags: [],
          castNames: [],
        },
      });
      seriesId = series.id;
      const episode = await prisma.episode.create({
        data: {
          seriesId,
          number: 17,
          title: "Fixture episode",
          durationSec: 30,
          hlsPath: "sample.mp4",
          thumbnailUrl: "/fixture.jpg",
          isFree: true,
          coinPrice: 10,
        },
      });

      const before = { id: episode.id, number: episode.number };
      const season = await prisma.season.create({
        data: { seriesId, number: 1, title: "Season 1", sortOrder: 0 },
      });
      await prisma.episode.updateMany({
        where: { seriesId, seasonId: null },
        data: { seasonId: season.id },
      });

      const after = await prisma.episode.findUniqueOrThrow({
        where: { id: episode.id },
        select: { id: true, number: true, seasonId: true },
      });
      expect(after).toEqual({ ...before, seasonId: season.id });
    } finally {
      if (seriesId) await prisma.series.delete({ where: { id: seriesId } });
    }
  });

  it("blocks season deletion while episodes remain", () => {
    expect(canDeleteSeason(0)).toBe(true);
    expect(canDeleteSeason(1)).toBe(false);
    expect(canDeleteSeason(60)).toBe(false);
  });

  it("rejects occupied episode numbers and reports duplicate SKUs clearly", () => {
    expect(findEpisodeNumberCollision([1, 2, 3], [5, 3])).toBe(3);
    expect(findEpisodeNumberCollision([1, 2, 3], [5, 6])).toBeNull();
    expect(duplicateSkuMessage("SKU-7", "Room 404 · Episode 2")).toBe(
      "SKU already used by Room 404 · Episode 2: SKU-7",
    );
    expect(episodeNumberConflictMessage(3)).toBe("Episode number 3 is already used in this series");
    expect(seasonHasEpisodesMessage()).toBe(
      "Move or delete this season's episodes before deleting the season",
    );
  });

  it("captures original filename and probed duration for uploaded episodes", () => {
    expect(
      buildEpisodeUploadMetadata({
        originalFilename: "episode-03.mp4",
        durationSec: 31,
        sku: "  ROOM-003 ",
      }),
    ).toEqual({
      originalFilename: "episode-03.mp4",
      durationSec: 31,
      sku: "ROOM-003",
    });
  });
});
