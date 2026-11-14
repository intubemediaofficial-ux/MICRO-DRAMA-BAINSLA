import type { Episode, Series } from "@prisma/client";

/** Compact series shape shared by the native app's lists. */
export function seriesCard(series: Series & { episodes?: Pick<Episode, "id">[] }) {
  return {
    id: series.id,
    slug: series.slug,
    title: series.title,
    synopsis: series.synopsis,
    posterUrl: series.posterUrl,
    genres: series.genres,
    firstEpisodeId: series.episodes?.[0]?.id ?? null,
  };
}
