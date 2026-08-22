export type EpisodeRailSource = {
  id: string;
  number: number;
  seasonNumber: number;
  title: string;
  thumbnailUrl: string;
  entitled: boolean;
  watched: boolean;
};

export type EpisodeRailEntry = EpisodeRailSource & {
  current: boolean;
  locked: boolean;
};

export function deriveEpisodeRailEntries(
  episodes: EpisodeRailSource[],
  currentEpisodeId: string,
): EpisodeRailEntry[] {
  return episodes.map((episode) => ({
    ...episode,
    current: episode.id === currentEpisodeId,
    locked: !episode.entitled,
  }));
}
