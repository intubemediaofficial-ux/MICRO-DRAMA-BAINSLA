import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { continueWatching } from "@/server/watch-history";

const suffix = crypto.randomUUID().slice(0, 8);
let userId = "";
let seriesIds: string[] = [];

describe("continue watching", () => {
  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `continue-${suffix}@test.local`,
        referralCode: `CW${suffix}`,
      },
    });
    userId = user.id;
    const specs = [
      {
        slug: `continue-next-${suffix}`,
        numbers: [{ number: 1, published: true }, { number: 2, published: true }],
      },
      {
        slug: `continue-draft-${suffix}`,
        numbers: [
          { number: 1, published: true },
          { number: 2, published: false },
          { number: 3, published: true },
        ],
      },
      {
        slug: `continue-ended-${suffix}`,
        numbers: [{ number: 1, published: true }],
      },
    ];
    const series = await Promise.all(
      specs.map((spec) =>
        prisma.series.create({
          data: {
            slug: spec.slug,
            title: spec.slug,
            synopsis: "Test",
            posterUrl: "/poster.jpg",
            teaserUrl: "",
            genres: [],
            tropeTags: [],
            castNames: [],
            isPublished: true,
            episodes: {
              create: spec.numbers.map(({ number, published }) => ({
                number,
                title: `Episode ${number}`,
                durationSec: 100,
                hlsPath: `continue/${spec.slug}-${number}.m3u8`,
                thumbnailUrl: "/poster.jpg",
                coinPrice: 1,
                publishedAt: published ? new Date() : null,
              })),
            },
          },
          include: { episodes: true },
        }),
      ),
    );
    seriesIds = series.map((item) => item.id);
    const progressRows = series.flatMap((item, index) => {
      const episode = item.episodes.find((entry) => entry.number === 1)!;
      const rows = [{
        userId,
        episodeId: episode.id,
        positionSec: 100,
        completed: true,
        updatedAt: new Date(Date.now() - index * 2_000 - 1_000),
      }];
      if (index === 0) {
        const second = item.episodes.find((entry) => entry.number === 2)!;
        rows.push({
          userId,
          episodeId: second.id,
          positionSec: 25,
          completed: false,
          updatedAt: new Date(),
        });
      }
      return rows;
    });
    await prisma.watchProgress.createMany({ data: progressRows });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.series.deleteMany({ where: { id: { in: seriesIds } } });
  });

  it("advances completed episodes to the next public episode and skips drafts or ended series", async () => {
    const items = await continueWatching(userId);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ episodeNumber: 2, positionSec: 25 });
    expect(items[1]).toMatchObject({ episodeNumber: 3, positionSec: 0 });
    expect(items.some((item) => item.id === seriesIds[2])).toBe(false);
  });
});
