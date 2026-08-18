import { describe, expect, it } from "vitest";
import { prisma } from "../src/server/db";
import {
  buildEpisodeUploadMetadata,
  canDeleteSeason,
  duplicateSkuMessage,
  findEpisodeNumberCollision,
} from "../src/server/episode-validation";

describe("seasons and bulk episode safeguards", () => {
  it("backfills every existing episode into a season without changing its identity or number", async () => {
    const before = await prisma.episode.findMany({
      select: { id: true, number: true, seasonId: true },
      orderBy: { id: "asc" },
    });
    expect(before.length).toBeGreaterThan(0);
    expect(before.every((episode) => episode.seasonId)).toBe(true);
    expect(new Set(before.map((episode) => episode.id)).size).toBe(before.length);
    expect(before.every((episode) => Number.isInteger(episode.number) && episode.number > 0)).toBe(true);
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
