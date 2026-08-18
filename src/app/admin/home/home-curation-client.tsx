"use client";

import { useMemo, useState } from "react";
import { Button, Section, StatusChip, useToast } from "@/components/admin/admin-ui";

type Series = { id: string; slug: string; title: string; posterUrl: string };
type Item = { id?: string; railKey: RailKey; position: number; seriesId?: string | null; bannerUrl?: string | null };
type RailKey = "hero-1" | "hero-2" | "hero-3" | "for-you" | "trending" | "new-releases";
const rails: { key: RailKey; title: string; helper: string }[] = [
  { key: "hero-1", title: "Hero slide 1", helper: "First story in the full-screen hero." },
  { key: "hero-2", title: "Hero slide 2", helper: "Second story in the full-screen hero." },
  { key: "hero-3", title: "Hero slide 3", helper: "Third story in the full-screen hero." },
  { key: "for-you", title: "For You", helper: "Personalized rail with a curated fallback." },
  { key: "trending", title: "Trending Today", helper: "Stories that should be prominent today." },
  { key: "new-releases", title: "New Releases", helper: "Fresh episodes and new series." },
];

export default function HomeCurationClient({
  series,
  initialItems,
  banners,
}: {
  series: Series[];
  initialItems: Item[];
  banners: string[];
}) {
  const toast = useToast();
  const [items, setItems] = useState(initialItems);
  const [pending, setPending] = useState(false);
  const [bannerUrl, setBannerUrl] = useState(banners[0] ?? "");
  const grouped = useMemo(
    () => new Map(rails.map((rail) => [rail.key, items.filter((item) => item.railKey === rail.key).sort((a, b) => a.position - b.position)])),
    [items],
  );
  function updateRail(railKey: RailKey, next: Item[]) {
    setItems((current) => [
      ...current.filter((item) => item.railKey !== railKey),
      ...next.map((item, position) => ({ ...item, railKey, position })),
    ]);
  }
  function addSeries(railKey: RailKey, seriesId: string) {
    if (!seriesId) return;
    const current = grouped.get(railKey) ?? [];
    if (current.some((item) => item.seriesId === seriesId)) return toast("That story is already in this rail.", "error");
    updateRail(railKey, [...current, { railKey, position: current.length, seriesId }]);
  }
  async function save() {
    setPending(true);
    try {
      const response = await fetch("/api/admin/home", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: items.map(({ id: _id, ...item }) => item) }),
      });
      const body = (await response.json().catch(() => null)) as Item[] | { error?: { message?: string } } | null;
      if (!response.ok) throw new Error((body as { error?: { message?: string } })?.error?.message ?? "Unable to save home curation");
      setItems(body as Item[]);
      toast("Home curation saved.");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to save home curation", "error");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="mt-6 space-y-6">
      {rails.map((rail) => {
        const current = grouped.get(rail.key) ?? [];
        return (
          <Section key={rail.key} title={rail.title} description={rail.helper}>
            <div className="space-y-3">
              {current.map((item, index) => {
                const selected = series.find((entry) => entry.id === item.seriesId);
                return (
                  <div key={`${rail.key}-${index}`} className="flex items-center gap-3 rounded-xl border border-white/10 bg-zinc-950 p-3">
                    {selected && <img src={selected.posterUrl} alt="" className="h-16 w-11 rounded object-cover" />}
                    {item.bannerUrl && <img src={item.bannerUrl} alt="" className="h-16 w-28 rounded object-cover" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{selected?.title ?? item.bannerUrl ?? "Promo banner"}</p>
                      <StatusChip tone="neutral">Position {index + 1}</StatusChip>
                    </div>
                    <Button variant="secondary" onClick={() => updateRail(rail.key, current.filter((_, itemIndex) => itemIndex !== index))}>Remove</Button>
                    <Button variant="secondary" disabled={index === 0} onClick={() => {
                      const next = [...current];
                      [next[index - 1], next[index]] = [next[index], next[index - 1]];
                      updateRail(rail.key, next);
                    }}>↑</Button>
                    <Button variant="secondary" disabled={index === current.length - 1} onClick={() => {
                      const next = [...current];
                      [next[index], next[index + 1]] = [next[index + 1], next[index]];
                      updateRail(rail.key, next);
                    }}>↓</Button>
                  </div>
                );
              })}
              <div className="flex flex-wrap gap-2">
                <select className="rounded-lg border border-white/10 bg-zinc-950 px-3 py-2" defaultValue="" onChange={(event) => {
                  addSeries(rail.key, event.target.value);
                  event.currentTarget.value = "";
                }}>
                  <option value="">Add a series…</option>
                  {series.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}
                </select>
                {rail.key.startsWith("hero-") && (
                  <select className="rounded-lg border border-white/10 bg-zinc-950 px-3 py-2" value={bannerUrl} onChange={(event) => setBannerUrl(event.target.value)}>
                    {banners.map((url) => <option key={url} value={url}>{url.split("/").pop()}</option>)}
                  </select>
                )}
                {rail.key.startsWith("hero-") && (
                  <Button variant="secondary" onClick={() => updateRail(rail.key, [...current, { railKey: rail.key, position: current.length, bannerUrl }])}>Add promo banner</Button>
                )}
              </div>
            </div>
          </Section>
        );
      })}
      <Button pending={pending} onClick={() => void save()}>Save home layout</Button>
    </div>
  );
}
