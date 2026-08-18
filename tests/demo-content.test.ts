import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/server/db";
import { syncDemoContent, type DemoArtwork, type DemoCatalogueEntry } from "../prisma/demo-content";

const slug = `demo-sync-test-${crypto.randomUUID()}`;
const catalogue: DemoCatalogueEntry[] = [
  {
    slug,
    title: "Demo Sync Test",
    synopsis: "A sync fixture.",
    genres: ["Test"],
    tropeTags: ["idempotent"],
    status: "ONGOING",
    freeEpisodeCount: 1,
    defaultCoinPrice: 17,
    episodeCount: 3,
    homeSections: ["demo-sync-test"],
    cast: [{ name: "Test Actor", role: "Lead" }],
  },
];
const manifest: DemoArtwork[] = [
  {
    slug,
    posterUrl: "/demo/posters/demo-sync-test.jpg",
    thumbnailUrl: "/demo/thumbs/demo-sync-test.jpg",
    cast: [{ name: "Test Actor", role: "Lead", photoUrl: "/demo/cast/demo-sync-test.jpg" }],
  },
];

describe("demo content sync", () => {
  afterAll(async () => {
    const series = await prisma.series.findUnique({ where: { slug } });
    if (series) await prisma.series.delete({ where: { id: series.id } });
  });

  it("is idempotent and preserves operator episode edits", async () => {
    const first = await syncDemoContent(prisma, catalogue, manifest);
    const firstEpisodes = await prisma.episode.findMany({
      where: { series: { slug } },
      orderBy: { number: "asc" },
      select: { id: true, number: true },
    });
    expect(first.series[0]).toMatchObject({
      series: "created",
      cast: "created",
      episodesCreated: 3,
      episodesLeftAlone: 0,
    });
    expect(firstEpisodes).toHaveLength(3);

    const second = await syncDemoContent(prisma, catalogue, manifest);
    const secondEpisodes = await prisma.episode.findMany({
      where: { series: { slug } },
      orderBy: { number: "asc" },
      select: { id: true, number: true },
    });
    expect(second.series[0]).toMatchObject({
      series: "unchanged",
      cast: "unchanged",
      episodesCreated: 0,
      episodesLeftAlone: 3,
    });
    expect(second.rails[0]).toMatchObject({ action: "left alone", count: 1 });
    expect(secondEpisodes).toEqual(firstEpisodes);

    const edited = secondEpisodes[0];
    await prisma.episode.update({
      where: { id: edited.id },
      data: { coinPrice: 77, isFree: false, publishedAt: null, hlsPath: "operator-edit.mp4" },
    });
    await syncDemoContent(prisma, catalogue, manifest);
    await expect(prisma.episode.findUniqueOrThrow({ where: { id: edited.id } })).resolves.toMatchObject({
      coinPrice: 77,
      isFree: false,
      publishedAt: null,
      hlsPath: "operator-edit.mp4",
    });
  });
});
