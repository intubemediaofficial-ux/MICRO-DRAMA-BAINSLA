"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { StatusChip, inputClass } from "@/components/admin/admin-ui";

type Row = {
  id: string;
  slug: string;
  title: string;
  posterUrl: string;
  status: "ONGOING" | "COMPLETED";
  isPublished: boolean;
  freeEpisodeCount: number;
  defaultCoinPrice: number;
  episodes: { isFree: boolean }[];
};

export default function SeriesListClient({ initial }: { initial: Row[] }) {
  const [query, setQuery] = useState("");
  const rows = useMemo(
    () =>
      initial.filter((item) =>
        `${item.title} ${item.slug}`.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [initial, query],
  );
  return (
    <div className="mt-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="min-w-[260px] flex-1">
          <span className="sr-only">Search series</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by title or slug"
            className={inputClass}
          />
        </label>
        <Link href="/admin/series/new" className="rounded-xl bg-rose-500 px-4 py-2.5 text-sm font-bold">
          + New series
        </Link>
      </div>
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-900">
        <div className="hidden grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-4 border-b border-white/10 px-5 py-3 text-xs font-bold uppercase tracking-wide text-zinc-500 md:grid">
          <span>Series</span>
          <span>Episodes</span>
          <span>Free episodes</span>
          <span>Price</span>
          <span>Status</span>
        </div>
        {rows.map((item) => (
          <Link
            key={item.id}
            href={`/admin/series/${item.id}`}
            className="grid gap-3 border-b border-white/10 px-4 py-4 transition last:border-0 hover:bg-white/5 md:grid-cols-[2fr_1fr_1fr_1fr_1fr] md:items-center md:gap-4 md:px-5"
          >
            <div className="flex items-center gap-3">
              <div className="relative h-16 w-12 shrink-0 overflow-hidden rounded-lg bg-zinc-800">
                <Image src={item.posterUrl} alt="" fill sizes="48px" className="object-cover" />
              </div>
              <div className="min-w-0">
                <p className="truncate font-bold">{item.title}</p>
                <p className="truncate text-xs text-zinc-500">/{item.slug}</p>
              </div>
            </div>
            <div className="text-sm text-zinc-300">
              <span className="text-xs text-zinc-500 md:hidden">Episodes · </span>
              {item.episodes.length}
            </div>
            <div className="text-sm text-zinc-300">
              <span className="text-xs text-zinc-500 md:hidden">Free · </span>
              {item.episodes.filter((episode) => episode.isFree).length || item.freeEpisodeCount}
            </div>
            <div className="text-sm text-zinc-300">
              <span className="text-xs text-zinc-500 md:hidden">Default price · </span>
              🪙 {item.defaultCoinPrice}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <StatusChip tone={item.isPublished ? "success" : "neutral"}>
                {item.isPublished ? "Published" : "Draft"}
              </StatusChip>
              <StatusChip tone={item.status === "ONGOING" ? "warning" : "neutral"}>
                {item.status === "ONGOING" ? "Ongoing" : "Completed"}
              </StatusChip>
            </div>
          </Link>
        ))}
        {!rows.length && <p className="p-8 text-center text-sm text-zinc-500">No series match that search.</p>}
      </div>
    </div>
  );
}
