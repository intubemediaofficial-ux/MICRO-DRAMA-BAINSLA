# Phase B content hierarchy

Episodes keep their existing series-scoped `number` and
`@@unique([seriesId, number])` constraint. Seasons are a grouping and
management layer, so display uses `S{season.number} · EP {episode.number}` and
later seasons continue the series-wide episode numbering. This preserves
watch-progress, unlock, and purchase references for existing episodes.

Migration `20260818180000_add_seasons_and_episode_metadata` creates Season 1
for every series with episodes and assigns existing episodes to it without
deleting, renumbering, or changing episode IDs.
