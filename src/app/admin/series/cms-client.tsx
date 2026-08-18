"use client";

import { useState } from "react";

type Episode = {
  id: string;
  number: number;
  title: string;
  durationSec: number;
  hlsPath: string;
  thumbnailUrl: string;
  publishedAt: string | Date | null;
  isFree: boolean;
  coinPrice: number;
  subtitles: { lang: string }[];
};
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
                  slug: String(form.get("slug")),
                  title: String(form.get("title")),
                  synopsis: String(form.get("synopsis")),
                  posterUrl: String(form.get("posterUrl")),
                  teaserUrl: String(form.get("teaserUrl")),
                  genres: comma(String(form.get("genres"))),
                  tropeTags: comma(String(form.get("tropeTags"))),
                  castNames: comma(String(form.get("castNames"))),
                  freeEpisodeCount: Number(form.get("freeEpisodeCount")),
                  defaultCoinPrice: Number(form.get("defaultCoinPrice")),
                  isPublished: form.get("isPublished") === "on",
                  status: String(form.get("status")),
                },
              });
            }}
          >
            <input
              name="slug"
              defaultValue={current.slug}
              className="rounded-xl bg-zinc-800 p-3"
              placeholder="Slug"
            />
            <input
              name="title"
              defaultValue={current.title}
              className="rounded-xl bg-zinc-800 p-3"
              placeholder="Title"
            />
            <input
              name="posterUrl"
              defaultValue={current.posterUrl}
              className="rounded-xl bg-zinc-800 p-3"
              placeholder="Poster URL"
            />
            <input
              name="teaserUrl"
              defaultValue={current.teaserUrl}
              className="rounded-xl bg-zinc-800 p-3"
              placeholder="Teaser URL"
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
            <select
              name="status"
              defaultValue={current.status}
              className="rounded-xl bg-zinc-800 p-3"
            >
              <option value="ONGOING">Ongoing</option>
              <option value="COMPLETED">Completed</option>
            </select>
            <button className="rounded-xl bg-rose-500 p-3 font-bold">Save series</button>
            <button
              type="button"
              className="rounded-xl bg-zinc-800 p-3 font-bold text-rose-300"
              onClick={() => {
                if (!window.confirm("Delete this series? Paid history blocks deletion.")) return;
                void fetch("/api/admin/series", {
                  method: "DELETE",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ id: current.id }),
                }).then((response) =>
                  setMessage(
                    response.ok
                      ? "Series deleted."
                      : "Series has paid history or could not be deleted.",
                  ),
                );
              }}
            >
              Delete series
            </button>
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
              posterUrl: String(form.get("posterUrl")),
              teaserUrl: String(form.get("teaserUrl")),
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
            name="posterUrl"
            required
            defaultValue="/media/poster-0.jpg"
            className="rounded-xl bg-zinc-800 p-3"
            placeholder="Poster URL"
          />
          <input
            name="teaserUrl"
            required
            defaultValue="/media/sample.mp4"
            className="rounded-xl bg-zinc-800 p-3"
            placeholder="Teaser URL"
          />
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
                title: String(form.get("title")),
                number: Number(form.get("number")),
                durationSec: Number(form.get("durationSec")),
                hlsPath: String(form.get("hlsPath")),
                thumbnailUrl: String(form.get("thumbnailUrl")),
                publishedAt: form.get("publishedAt")
                  ? new Date(String(form.get("publishedAt"))).toISOString()
                  : null,
                isFree: form.get("isFree") === "on",
                coinPrice: Number(form.get("coinPrice")),
              });
            }}
          >
            <input
              name="title"
              defaultValue={current.episodes.find((item) => item.id === episodeId)?.title}
              className="rounded-xl bg-zinc-800 p-3"
              placeholder="Title"
            />
            <input
              name="number"
              type="number"
              defaultValue={current.episodes.find((item) => item.id === episodeId)?.number}
              className="rounded-xl bg-zinc-800 p-3"
              placeholder="Number"
            />
            <input
              name="durationSec"
              type="number"
              defaultValue={current.episodes.find((item) => item.id === episodeId)?.durationSec}
              className="rounded-xl bg-zinc-800 p-3"
              placeholder="Duration seconds"
            />
            <input
              name="hlsPath"
              defaultValue={current.episodes.find((item) => item.id === episodeId)?.hlsPath}
              className="rounded-xl bg-zinc-800 p-3"
              placeholder="Video path"
            />
            <input
              name="thumbnailUrl"
              defaultValue={current.episodes.find((item) => item.id === episodeId)?.thumbnailUrl}
              className="rounded-xl bg-zinc-800 p-3"
              placeholder="Thumbnail URL"
            />
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
            <input
              name="publishedAt"
              type="datetime-local"
              defaultValue={(() => {
                const value = current.episodes.find((item) => item.id === episodeId)?.publishedAt;
                return value ? new Date(value).toISOString().slice(0, 16) : "";
              })()}
              className="rounded-xl bg-zinc-800 p-3"
            />
            <button className="rounded-xl bg-zinc-800 p-3 font-bold">Save episode</button>
            <button
              type="button"
              className="rounded-xl bg-zinc-800 p-3 font-bold text-rose-300"
              onClick={() => {
                if (!window.confirm("Delete this episode? Paid history blocks deletion.")) return;
                void fetch(`/api/admin/episodes/${episodeId}`, { method: "DELETE" }).then(
                  (response) =>
                    setMessage(
                      response.ok
                        ? "Episode deleted."
                        : "Episode has paid history or could not be deleted.",
                    ),
                );
              }}
            >
              Delete episode
            </button>
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
          <div className="mt-3 flex flex-wrap gap-2">
            {(current.episodes.find((item) => item.id === episodeId)?.subtitles ?? []).map(
              (subtitle) => (
                <button
                  key={subtitle.lang}
                  type="button"
                  className="rounded bg-zinc-800 px-3 py-2 text-sm text-rose-300"
                  onClick={() => {
                    if (!window.confirm(`Delete ${subtitle.lang} subtitles?`)) return;
                    void fetch(`/api/admin/episodes/${episodeId}/subtitles`, {
                      method: "DELETE",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ lang: subtitle.lang }),
                    }).then((response) =>
                      setMessage(response.ok ? "Subtitle deleted." : "Subtitle delete failed"),
                    );
                  }}
                >
                  Delete {subtitle.lang} subtitles
                </button>
              ),
            )}
          </div>
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
          <div className="mt-5 rounded-xl bg-zinc-800 p-3">
            <p className="font-bold">Bulk update selected episodes</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {current.episodes.map((episode) => (
                <label key={episode.id} className="flex items-center gap-2 text-sm">
                  <input className="bulk-selected" type="checkbox" value={episode.id} />
                  EP {episode.number} — {episode.title}
                </label>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className="rounded bg-rose-500 px-3 py-2 font-bold"
                onClick={() => {
                  const ids = [
                    ...document.querySelectorAll<HTMLInputElement>(".bulk-selected:checked"),
                  ].map((input) => input.value);
                  const price = window.prompt("New coin price");
                  if (ids.length && price)
                    void patch("/api/admin/episodes/bulk", {
                      episodeIds: ids,
                      coinPrice: Number(price),
                    });
                }}
              >
                Set selected price
              </button>
              <button
                className="rounded bg-zinc-950 px-3 py-2 font-bold"
                onClick={() => {
                  const ids = [
                    ...document.querySelectorAll<HTMLInputElement>(".bulk-selected:checked"),
                  ].map((input) => input.value);
                  if (ids.length)
                    void patch("/api/admin/episodes/bulk", { episodeIds: ids, isFree: true });
                }}
              >
                Mark selected free
              </button>
              <button
                className="rounded bg-zinc-950 px-3 py-2 font-bold"
                onClick={() => {
                  const ids = [
                    ...document.querySelectorAll<HTMLInputElement>(".bulk-selected:checked"),
                  ].map((input) => input.value);
                  if (ids.length)
                    void patch("/api/admin/episodes/bulk", { episodeIds: ids, isFree: false });
                }}
              >
                Mark selected VIP
              </button>
              <button
                className="rounded bg-zinc-950 px-3 py-2 font-bold"
                onClick={() => {
                  const ids = [
                    ...document.querySelectorAll<HTMLInputElement>(".bulk-selected:checked"),
                  ].map((input) => input.value);
                  if (ids.length)
                    void patch("/api/admin/episodes/bulk", {
                      episodeIds: ids,
                      publishedAt: new Date().toISOString(),
                    });
                }}
              >
                Publish selected
              </button>
              <button
                className="rounded bg-zinc-950 px-3 py-2 font-bold"
                onClick={() => {
                  const ids = [
                    ...document.querySelectorAll<HTMLInputElement>(".bulk-selected:checked"),
                  ].map((input) => input.value);
                  if (ids.length)
                    void patch("/api/admin/episodes/bulk", { episodeIds: ids, publishedAt: null });
                }}
              >
                Unpublish selected
              </button>
              <button
                className="rounded bg-zinc-950 px-3 py-2 font-bold"
                onClick={() => {
                  const ids = [
                    ...document.querySelectorAll<HTMLInputElement>(".bulk-selected:checked"),
                  ].map((input) => input.value);
                  const numbers = window.prompt("New episode numbers, comma-separated");
                  if (!ids.length || !numbers) return;
                  const values = numbers.split(",").map((value) => Number(value.trim()));
                  if (
                    values.length !== ids.length ||
                    values.some((value) => !Number.isInteger(value) || value < 1)
                  ) {
                    setMessage("Provide one positive number per selected episode.");
                    return;
                  }
                  void patch("/api/admin/episodes/bulk", {
                    episodeIds: ids,
                    numbers: ids.map((id, index) => ({ id, number: values[index] })),
                  });
                }}
              >
                Renumber selected
              </button>
            </div>
          </div>
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
