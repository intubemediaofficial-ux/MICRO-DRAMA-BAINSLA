"use client";

import { useState } from "react";

type Episode = { id: string; number: number; title: string; isFree: boolean; coinPrice: number };
type Series = {
  id: string;
  slug: string;
  title: string;
  synopsis: string;
  posterUrl: string;
  teaserUrl: string;
  genres: string[];
  tropeTags: string[];
  castNames: string[];
  freeEpisodeCount: number;
  defaultCoinPrice: number;
  isPublished: boolean;
  status: "ONGOING" | "COMPLETED";
  episodes: Episode[];
};
type Banner = { id: string; title: string; imageUrl: string };

export default function AdminCmsClient({
  series,
  banners,
}: {
  series: Series[];
  banners: Banner[];
}) {
  const [selected, setSelected] = useState(series[0]?.id ?? "");
  const [episodeId, setEpisodeId] = useState(series[0]?.episodes[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const current = series.find((item) => item.id === selected) ?? series[0];
  async function post(url: string, body: unknown) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setMessage(
      response.ok ? "Saved." : ((await response.json()).error?.message ?? "Request failed"),
    );
    return response.ok;
  }
  async function patch(url: string, body: unknown) {
    const response = await fetch(url, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setMessage(
      response.ok ? "Saved." : ((await response.json()).error?.message ?? "Request failed"),
    );
  }
  const comma = (value: string) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  return (
    <div className="mt-6 space-y-8">
      <p className="text-sm text-emerald-400">{message}</p>
      <section className="rounded-2xl bg-zinc-900 p-5">
        <h2 className="text-xl font-bold">Edit series</h2>
        <select
          value={selected}
          onChange={(event) => {
            setSelected(event.target.value);
            setEpisodeId(
              series.find((item) => item.id === event.target.value)?.episodes[0]?.id ?? "",
            );
          }}
          className="mt-4 w-full rounded-xl bg-zinc-800 p-3"
        >
          {series.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>
        {current && (
          <form
            key={current.id}
            className="mt-4 grid gap-3 md:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void patch("/api/admin/series", {
                id: current.id,
                data: {
                  title: String(form.get("title")),
                  synopsis: String(form.get("synopsis")),
                  genres: comma(String(form.get("genres"))),
                  tropeTags: comma(String(form.get("tropeTags"))),
                  castNames: comma(String(form.get("castNames"))),
                  freeEpisodeCount: Number(form.get("freeEpisodeCount")),
                  defaultCoinPrice: Number(form.get("defaultCoinPrice")),
                  isPublished: form.get("isPublished") === "on",
                },
              });
            }}
          >
            <input
              name="title"
              defaultValue={current.title}
              className="rounded-xl bg-zinc-800 p-3"
              placeholder="Title"
            />
            <input
              name="synopsis"
              defaultValue={current.synopsis}
              className="rounded-xl bg-zinc-800 p-3"
              placeholder="Synopsis"
            />
            <input
              name="genres"
              defaultValue={current.genres.join(", ")}
              className="rounded-xl bg-zinc-800 p-3"
              placeholder="Genres"
            />
            <input
              name="tropeTags"
              defaultValue={current.tropeTags.join(", ")}
              className="rounded-xl bg-zinc-800 p-3"
              placeholder="Trope tags"
            />
            <input
              name="castNames"
              defaultValue={current.castNames.join(", ")}
              className="rounded-xl bg-zinc-800 p-3"
              placeholder="Cast names"
            />
            <input
              name="freeEpisodeCount"
              type="number"
              defaultValue={current.freeEpisodeCount}
              className="rounded-xl bg-zinc-800 p-3"
              placeholder="Free episodes"
            />
            <input
              name="defaultCoinPrice"
              type="number"
              defaultValue={current.defaultCoinPrice}
              className="rounded-xl bg-zinc-800 p-3"
              placeholder="Default price"
            />
            <label className="flex items-center gap-2 p-3">
              <input name="isPublished" type="checkbox" defaultChecked={current.isPublished} />{" "}
              Published
            </label>
            <button className="rounded-xl bg-rose-500 p-3 font-bold">Save series</button>
          </form>
        )}
      </section>
      <section className="rounded-2xl bg-zinc-900 p-5">
        <h2 className="text-xl font-bold">Create series</h2>
        <form
          className="mt-4 grid gap-3 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void post("/api/admin/series", {
              slug: String(form.get("slug")),
              title: String(form.get("title")),
              synopsis: String(form.get("synopsis")),
              posterUrl: "/media/poster-0.jpg",
              teaserUrl: "/media/sample.mp4",
              genres: comma(String(form.get("genres"))),
              tropeTags: comma(String(form.get("tropeTags"))),
              castNames: comma(String(form.get("castNames"))),
              freeEpisodeCount: Number(form.get("freeEpisodeCount")),
              defaultCoinPrice: Number(form.get("defaultCoinPrice")),
              isPublished: false,
            });
          }}
        >
          {["slug", "title", "synopsis", "genres", "tropeTags", "castNames"].map((name) => (
            <input
              key={name}
              name={name}
              required
              className="rounded-xl bg-zinc-800 p-3"
              placeholder={name}
            />
          ))}
          <input
            name="freeEpisodeCount"
            type="number"
            defaultValue="5"
            className="rounded-xl bg-zinc-800 p-3"
          />
          <input
            name="defaultCoinPrice"
            type="number"
            defaultValue="10"
            className="rounded-xl bg-zinc-800 p-3"
          />
          <button className="rounded-xl bg-rose-500 p-3 font-bold">Create series</button>
        </form>
      </section>
      {current && (
        <section className="rounded-2xl bg-zinc-900 p-5">
          <h2 className="text-xl font-bold">Episodes & uploads</h2>
          <select
            value={episodeId}
            onChange={(event) => setEpisodeId(event.target.value)}
            className="mt-4 w-full rounded-xl bg-zinc-800 p-3"
          >
            {current.episodes.map((episode) => (
              <option key={episode.id} value={episode.id}>
                EP {episode.number} — {episode.title}
              </option>
            ))}
          </select>
          <form
            key={episodeId}
            className="mt-3 grid gap-3 md:grid-cols-3"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void patch(`/api/admin/episodes/${episodeId}`, {
                isFree: form.get("isFree") === "on",
                coinPrice: Number(form.get("coinPrice")),
              });
            }}
          >
            <input
              name="coinPrice"
              type="number"
              defaultValue={
                current.episodes.find((item) => item.id === episodeId)?.coinPrice ??
                current.defaultCoinPrice
              }
              className="rounded-xl bg-zinc-800 p-3"
            />
            <label className="flex items-center gap-2 p-3">
              <input
                name="isFree"
                type="checkbox"
                defaultChecked={current.episodes.find((item) => item.id === episodeId)?.isFree}
              />{" "}
              Free override
            </label>
            <button className="rounded-xl bg-zinc-800 p-3 font-bold">Save episode</button>
          </form>
          <form
            className="mt-3 flex flex-wrap gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void fetch(`/api/admin/episodes/${episodeId}/upload`, {
                method: "POST",
                body: form,
              }).then((response) =>
                setMessage(response.ok ? "Video uploaded." : "Video upload failed"),
              );
            }}
          >
            <input
              name="file"
              type="file"
              accept="video/*"
              className="min-w-0 flex-1 rounded-xl bg-zinc-800 p-3"
            />
            <button className="rounded-xl bg-zinc-800 px-4 font-bold">Upload video</button>
          </form>
          <form
            className="mt-3 flex flex-wrap gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void fetch(`/api/admin/episodes/${episodeId}/subtitles`, {
                method: "POST",
                body: form,
              }).then((response) =>
                setMessage(response.ok ? "Subtitle uploaded." : "Subtitle upload failed"),
              );
            }}
          >
            <input name="lang" defaultValue="en" className="w-20 rounded-xl bg-zinc-800 p-3" />
            <input
              name="file"
              type="file"
              accept=".srt"
              className="min-w-0 flex-1 rounded-xl bg-zinc-800 p-3"
            />
            <button className="rounded-xl bg-zinc-800 px-4 font-bold">Upload SRT</button>
          </form>
          <textarea
            className="mt-5 min-h-24 w-full rounded-xl bg-zinc-800 p-3"
            placeholder={"Bulk lines: number|title|price|free\n61|A new secret|12|false"}
            id="bulk-episodes"
          />
          <button
            className="mt-3 rounded-xl bg-rose-500 px-4 py-3 font-bold"
            onClick={() => {
              const value = (document.getElementById("bulk-episodes") as HTMLTextAreaElement).value;
              const episodes = value
                .split("\n")
                .filter(Boolean)
                .map((line) => {
                  const [number, title, coinPrice, isFree] = line.split("|");
                  return {
                    number: Number(number),
                    title,
                    coinPrice: Number(coinPrice),
                    isFree: isFree === "true",
                    durationSec: 90,
                    hlsPath: "sample.mp4",
                    thumbnailUrl: "/media/thumb-0.jpg",
                  };
                });
              void post("/api/admin/episodes/bulk", { seriesId: current.id, episodes });
            }}
          >
            Bulk add
          </button>
        </section>
      )}
      <section className="rounded-2xl bg-zinc-900 p-5">
        <h2 className="text-xl font-bold">Banners, coupons & cliffhangers</h2>
        <p className="mt-2 text-sm text-zinc-500">
          {banners.length} banners currently configured. Campaign sends are dry-run by default.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <button
            className="rounded-xl bg-zinc-800 p-3"
            onClick={() =>
              void post("/api/admin/banners", {
                title: "Flash sale",
                imageUrl: "/media/poster-0.jpg",
                targetSeriesId: current?.id ?? null,
                sortOrder: banners.length,
              })
            }
          >
            Create flash-sale banner
          </button>
          <button
            className="rounded-xl bg-zinc-800 p-3"
            onClick={() =>
              void post("/api/admin/coupons", {
                code: `ADMIN${Date.now()}`,
                coins: 50,
                maxRedemptions: 100,
              })
            }
          >
            Create 50-coin coupon
          </button>
          <button
            className="rounded-xl bg-zinc-800 p-3"
            onClick={() =>
              void post("/api/admin/push/cliffhanger", {
                seriesId: current?.id,
                staleDays: 2,
                dryRun: true,
              })
            }
          >
            Run cliffhanger dry-run
          </button>
        </div>
      </section>
    </div>
  );
}
