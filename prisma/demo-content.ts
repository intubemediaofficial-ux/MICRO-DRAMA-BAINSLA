import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export type DemoCatalogueEntry = {
  slug: string;
  title: string;
  synopsis: string;
  genres: string[];
  tropeTags: string[];
  status: "ONGOING" | "COMPLETED";
  freeEpisodeCount: number;
  defaultCoinPrice: number;
  episodeCount: number;
  homeSections: string[];
  cast: { name: string; role: string }[];
};

export type DemoArtwork = {
  slug: string;
  posterUrl: string;
  thumbnailUrl: string;
  cast: { name: string; role: string; photoUrl: string }[];
};

export type SeriesSyncReport = {
  slug: string;
  title: string;
  series: "created" | "updated" | "unchanged";
  cast: "created" | "replaced" | "unchanged";
  episodesCreated: number;
  episodesLeftAlone: number;
};

export type DemoContentReport = {
  series: SeriesSyncReport[];
  rails: { railKey: string; action: "populated" | "left alone"; count: number }[];
  placeholdersUnpublished: string[];
};

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(path.join(process.cwd(), file), "utf8")) as T;
}

function sameArray(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function episodeDuration(number: number, catalogueIndex: number) {
  return 60 + ((number * 17 + catalogueIndex * 11) % 121);
}

function sameCast(
  existing: { name: string; role: string | null; photo: string | null; sortOrder: number }[],
  expected: { name: string; role: string; photo: string | null; sortOrder: number }[],
) {
  return (
    existing.length === expected.length &&
    existing.every(
      (member, index) =>
        member.name === expected[index].name &&
        member.role === expected[index].role &&
        member.photo === expected[index].photo &&
        member.sortOrder === expected[index].sortOrder,
    )
  );
}

export async function syncDemoContent(
  prisma: PrismaClient,
  catalogue: DemoCatalogueEntry[],
  manifest: DemoArtwork[],
): Promise<DemoContentReport> {
  const manifestBySlug = new Map(manifest.map((item) => [item.slug, item]));
  const seriesReports: SeriesSyncReport[] = [];
  const seriesIds = new Map<string, string>();

  for (const [catalogueIndex, item] of catalogue.entries()) {
    const artwork = manifestBySlug.get(item.slug);
    if (!artwork) {
      console.warn(`[demo-content] Skipping ${item.slug}: artwork is missing from the manifest.`);
      continue;
    }

    const report = await prisma.$transaction(async (tx) => {
      const existing = await tx.series.findUnique({
        where: { slug: item.slug },
        include: {
          castMembers: { orderBy: { sortOrder: "asc" } },
          episodes: { select: { number: true } },
        },
      });
      const expectedCast = item.cast.map((member, sortOrder) => ({
        name: member.name,
        role: member.role,
        photo: artwork.cast[sortOrder]?.photoUrl ?? null,
        sortOrder,
      }));
      const metadata = {
        title: item.title,
        synopsis: item.synopsis,
        posterUrl: artwork.posterUrl,
        genres: item.genres,
        tropeTags: item.tropeTags,
        castNames: item.cast.map((member) => member.name),
        freeEpisodeCount: item.freeEpisodeCount,
        defaultCoinPrice: item.defaultCoinPrice,
        status: item.status,
      };

      let series;
      let seriesAction: SeriesSyncReport["series"];
      if (!existing) {
        series = await tx.series.create({
          data: {
            ...metadata,
            slug: item.slug,
            teaserUrl: "/media/sample.mp4",
            isPublished: true,
          },
        });
        seriesAction = "created";
      } else {
        const metadataChanged =
          existing.title !== metadata.title ||
          existing.synopsis !== metadata.synopsis ||
          existing.posterUrl !== metadata.posterUrl ||
          !sameArray(existing.genres, metadata.genres) ||
          !sameArray(existing.tropeTags, metadata.tropeTags) ||
          !sameArray(existing.castNames, metadata.castNames) ||
          existing.freeEpisodeCount !== metadata.freeEpisodeCount ||
          existing.defaultCoinPrice !== metadata.defaultCoinPrice ||
          existing.status !== metadata.status;
        series = metadataChanged
          ? await tx.series.update({ where: { id: existing.id }, data: metadata })
          : existing;
        seriesAction = metadataChanged ? "updated" : "unchanged";
      }
      seriesIds.set(item.slug, series.id);

      const castMatches = sameCast(existing?.castMembers ?? [], expectedCast);
      let castAction: SeriesSyncReport["cast"];
      if (castMatches) {
        castAction = "unchanged";
      } else {
        if (existing) await tx.castMember.deleteMany({ where: { seriesId: series.id } });
        if (expectedCast.length) {
          await tx.castMember.createMany({
            data: expectedCast.map((member) => ({ ...member, seriesId: series.id })),
          });
        }
        castAction = existing ? "replaced" : "created";
      }

      const existingNumbers = new Set((existing?.episodes ?? []).map((episode) => episode.number));
      let episodesCreated = 0;
      for (let number = 1; number <= item.episodeCount; number += 1) {
        if (existingNumbers.has(number)) continue;
        await tx.episode.create({
          data: {
            seriesId: series.id,
            number,
            title:
              number === item.episodeCount ? "The Finale" : `${item.title} · Chapter ${number}`,
            durationSec: episodeDuration(number, catalogueIndex),
            hlsPath: "sample.mp4",
            thumbnailUrl: artwork.thumbnailUrl,
            thumbnailSource: "CATALOGUE",
            isFree: number <= item.freeEpisodeCount,
            coinPrice: item.defaultCoinPrice,
            publishedAt: new Date(Date.now() - (item.episodeCount - number) * 86_400_000),
          },
        });
        episodesCreated += 1;
      }

      return {
        slug: item.slug,
        title: item.title,
        series: seriesAction,
        cast: castAction,
        episodesCreated,
        episodesLeftAlone: existing?.episodes.length ?? 0,
      };
    });
    seriesReports.push(report);
  }

  const rails = new Map<string, string[]>();
  for (const item of catalogue) {
    const seriesId = seriesIds.get(item.slug);
    if (!seriesId) continue;
    for (const railKey of new Set(item.homeSections)) {
      rails.set(railKey, [...(rails.get(railKey) ?? []), seriesId]);
    }
  }
  const railReports: DemoContentReport["rails"] = [];
  for (const [railKey, ids] of rails) {
    const existing = await prisma.homeRailItem.count({ where: { railKey } });
    if (existing > 0) {
      railReports.push({ railKey, action: "left alone", count: existing });
      continue;
    }
    await prisma.homeRailItem.createMany({
      data: ids.map((seriesId, position) => ({ railKey, seriesId, position })),
    });
    railReports.push({ railKey, action: "populated", count: ids.length });
  }

  const catalogueSlugs = new Set(catalogue.map((item) => item.slug));
  const placeholders = await prisma.series.findMany({
    where: { posterUrl: { startsWith: "/media/poster-" } },
    select: { id: true, slug: true, posterUrl: true, isPublished: true },
  });
  const placeholdersUnpublished: string[] = [];
  for (const series of placeholders) {
    if (catalogueSlugs.has(series.slug) || !/^\/media\/poster-\d+\.jpg$/.test(series.posterUrl))
      continue;
    if (series.isPublished) {
      await prisma.series.update({ where: { id: series.id }, data: { isPublished: false } });
      placeholdersUnpublished.push(series.slug);
    }
  }

  return { series: seriesReports, rails: railReports, placeholdersUnpublished };
}

export async function main() {
  const prisma = new PrismaClient();
  try {
    const report = await syncDemoContent(
      prisma,
      readJson<DemoCatalogueEntry[]>("prisma/demo-catalogue.json"),
      readJson<DemoArtwork[]>("public/demo/manifest.json"),
    );
    for (const series of report.series) {
      console.log(
        `[demo-content] ${series.slug}: series ${series.series}, cast ${series.cast}, ` +
          `episodes created ${series.episodesCreated}, left alone ${series.episodesLeftAlone}`,
      );
    }
    for (const rail of report.rails)
      console.log(`[demo-content] rail ${rail.railKey}: ${rail.action} (${rail.count} items)`);
    for (const slug of report.placeholdersUnpublished)
      console.log(`[demo-content] unpublished legacy placeholder ${slug}`);
    return report;
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
