"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

type Episode = {
  id: string;
  number: number;
  title: string;
  durationSec: number;
  thumbnailUrl: string;
  isFree: boolean;
  coinPrice: number;
  watched: boolean;
  access: string;
};

export default function SeasonEpisodes({
  seasons,
  freeEpisodeCount,
}: {
  seasons: { id: string; number: number; title: string | null; episodes: Episode[] }[];
  freeEpisodeCount: number;
}) {
  const [selected, setSelected] = useState(seasons[0]?.id ?? "");
  const current = seasons.find((season) => season.id === selected) ?? seasons[0];
  if (!current) return null;
  return (
    <>
      {seasons.length > 1 && (
        <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="Seasons">
          {seasons.map((season) => (
            <button
              key={season.id}
              type="button"
              role="tab"
              aria-selected={season.id === current.id}
              onClick={() => setSelected(season.id)}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                season.id === current.id ? "bg-rose-500 text-white" : "bg-zinc-800 text-zinc-300"
              }`}
            >
              {season.title || `Season ${season.number}`}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        {current.episodes.map((ep) => (
          <Link
            key={ep.id}
            href={`/watch/${ep.id}`}
            className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 hover:border-rose-500"
          >
            <div className="relative mb-3 aspect-video overflow-hidden rounded-xl bg-zinc-800">
              <Image
                src={ep.thumbnailUrl}
                alt=""
                fill
                sizes="(max-width: 768px) 50vw, 180px"
                className="object-cover"
              />
            </div>
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span>
                S{current.number} · EP {ep.number}
              </span>
              <span className="flex items-center gap-1">
                {ep.watched && (
                  <span className="rounded-full bg-emerald-500/20 px-2 py-1 text-emerald-300">
                    WATCHED
                  </span>
                )}
                <span>
                  {ep.isFree || ep.number <= freeEpisodeCount
                    ? "FREE"
                    : ep.access === "SUBSCRIPTION"
                      ? "VIP"
                      : `🪙 ${ep.coinPrice}`}
                </span>
              </span>
            </div>
            <h3 className="mt-5 font-semibold">{ep.title}</h3>
            <p className="mt-2 text-xs text-zinc-500">{Math.ceil(ep.durationSec / 60)} min</p>
          </Link>
        ))}
      </div>
    </>
  );
}
