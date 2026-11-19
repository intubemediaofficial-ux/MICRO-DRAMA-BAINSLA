import { prisma } from "./db";
import { getDiscovery } from "./discovery";
import { publicEpisodeWhere } from "./publishing";

export const homeRailKeys = [
  "hero-1",
  "hero-2",
  "hero-3",
  "for-you",
  "trending",
  "new-releases",
] as const;

export async function getHomeCuration() {
  return prisma.homeRailItem.findMany({
    orderBy: [{ railKey: "asc" }, { position: "asc" }],
    include: {
      series: {
        include: { episodes: { where: publicEpisodeWhere, orderBy: { number: "asc" }, take: 1 } },
      },
    },
  });
}

export async function getHomeFeed(userId?: string) {
  const [discovery, curated] = await Promise.all([getDiscovery(userId), getHomeCuration()]);
  const curatedRail = (railKey: string) =>
    curated
      .filter(
        (item) =>
          item.railKey === railKey &&
          item.series?.isPublished &&
          item.series.episodes.length > 0,
      )
      .map((item) => item.series)
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const hero = ["hero-1", "hero-2", "hero-3"].flatMap(curatedRail);
  const heroItems = hero.length ? hero : discovery.trending;
  const forYou = curatedRail("for-you");
  const trending = curatedRail("trending");
  const newReleases = curatedRail("new-releases");
  const groups = [
    { title: "For You", items: forYou.length ? forYou : discovery.forYou },
    { title: "Trending Today", items: trending.length ? trending : discovery.trending },
    { title: "New Releases", items: newReleases.length ? newReleases : discovery.newReleases },
    ...discovery.genreRows.map((row) => ({ title: `Genre: ${row.title}`, items: row.items })),
    ...discovery.tropeRows.map((row) => ({ title: `Trope: ${row.title}`, items: row.items })),
  ];
  return { heroItems, groups };
}
