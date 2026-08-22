"use client";

import { useEffect, useRef } from "react";
import { deriveEpisodeRailEntries, type EpisodeRailSource } from "@/lib/episode-rail";

export default function EpisodeRail({
  episodes,
  currentEpisodeId,
  onSelect,
}: {
  episodes: EpisodeRailSource[];
  currentEpisodeId: string;
  onSelect: (episode: EpisodeRailSource) => void;
}) {
  const currentRef = useRef<HTMLButtonElement>(null);
  const entries = deriveEpisodeRailEntries(episodes, currentEpisodeId);

  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: "nearest" });
  }, [currentEpisodeId]);

  return (
    <div className="max-h-[calc(100vh-7rem)] overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950/95 p-2">
      <p className="px-3 py-2 text-xs font-bold uppercase tracking-widest text-zinc-500">
        Episodes
      </p>
      <div className="space-y-1">
        {entries.map((episode) => (
          <button
            key={episode.id}
            ref={episode.current ? currentRef : undefined}
            type="button"
            onClick={() => onSelect(episode)}
            className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition ${
              episode.current
                ? "bg-rose-500/20 text-white ring-1 ring-rose-400"
                : "text-zinc-300 hover:bg-zinc-800"
            }`}
            aria-current={episode.current ? "true" : undefined}
          >
            <span className="w-12 shrink-0 text-xs font-semibold text-zinc-500">
              S{episode.seasonNumber} · EP {episode.number}
            </span>
            <span className="min-w-0 flex-1 truncate">{episode.title}</span>
            <span className="flex shrink-0 items-center gap-1 text-xs">
              {episode.watched && <span aria-label="Watched">✓</span>}
              {episode.locked && <span aria-label="Locked">🔒</span>}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
