"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Confirm,
  AdminModal,
  Field,
  inputClass,
  Section,
  StatusChip,
  useToast,
} from "@/components/admin/admin-ui";

type Episode = {
  id: string;
  seasonId: string | null;
  number: number;
  title: string;
  durationSec: number;
  hlsPath: string;
  thumbnailUrl: string;
  publishedAt: string | Date | null;
  isFree: boolean;
  coinPrice: number;
  thumbnailSource?: string;
  processingStatus?: string;
  processingError?: string | null;
  originalFilename?: string | null;
  sku?: string | null;
  subtitles?: { id: string; lang: string; srtPath: string }[];
};
type Season = {
  id: string;
  number: number;
  title: string | null;
  sortOrder: number;
  _count?: { episodes: number };
};
type BulkUploadItem = {
  id: string;
  file: File;
  number: number;
  sku: string;
  status: "queued" | "uploading" | "processing" | "ready" | "failed";
  progress: number;
  error?: string;
};
type Cast = {
  id?: string;
  name: string;
  role: string | null;
  photo: string | null;
  sortOrder: number;
};
type SeriesData = {
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
  castMembers: Cast[];
  seasons: Season[];
  episodes: Episode[];
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
function mediaUrl(value: string) {
  if (!value || value === "pending") return "";
  if (value.startsWith("/")) return value;
  return `/api/media/${value.split("/").map(encodeURIComponent).join("/")}`;
}
async function readError(response: Response) {
  const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? "Request failed";
}

function TagInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder: string;
}) {
  const [text, setText] = useState("");
  function add() {
    const next = text.trim().replace(/,$/, "");
    if (next && !value.includes(next)) onChange([...value, next]);
    setText("");
  }
  return (
    <div className={`${inputClass} flex min-h-[45px] flex-wrap items-center gap-2`}>
      {value.map((tag) => (
        <button
          type="button"
          key={tag}
          onClick={() => onChange(value.filter((item) => item !== tag))}
          className="rounded-full bg-rose-500/15 px-2.5 py-1 text-xs text-rose-200"
        >
          #{tag} ×
        </button>
      ))}
      <input
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === ",") {
            event.preventDefault();
            add();
          }
        }}
        onBlur={add}
        placeholder={placeholder}
        className="min-w-[140px] flex-1 bg-transparent text-sm outline-none"
      />
    </div>
  );
}

function UploadField({
  label,
  helper,
  value,
  category,
  accept,
  onChange,
}: {
  label: string;
  helper: string;
  value: string;
  category: "poster" | "teaser" | "cast";
  accept: string;
  onChange: (value: string) => void;
}) {
  const toast = useToast();
  const [progress, setProgress] = useState(0);
  const [pending, setPending] = useState(false);
  async function upload(file: File) {
    setPending(true);
    setProgress(1);
    const form = new FormData();
    form.append("file", file);
    form.append("category", category);
    try {
      const result = await new Promise<{ url: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/admin/media/upload");
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100));
        };
        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300
            ? resolve(JSON.parse(xhr.responseText))
            : reject(new Error(JSON.parse(xhr.responseText)?.error?.message ?? "Upload failed"));
        xhr.onerror = () => reject(new Error("Upload failed"));
        xhr.send(form);
      });
      onChange(result.url);
      toast(`${label} uploaded.`);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Upload failed", "error");
    } finally {
      setPending(false);
      setProgress(0);
    }
  }
  return (
    <Field label={label} helper={helper}>
      <div className="space-y-3">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Paste a URL or upload a file"
          className={inputClass}
        />
        <label className="flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-white/15 bg-zinc-950 px-4 py-4 text-sm text-zinc-400 hover:border-rose-400/60">
          <input
            type="file"
            accept={accept}
            className="sr-only"
            disabled={pending}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          {pending ? `Uploading… ${progress}%` : "Choose file to upload"}
        </label>
        {pending && (
          <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
            <div className="h-full bg-rose-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}
        {value && category === "poster" && (
          <img src={value} alt="Poster preview" className="h-40 w-28 rounded-xl object-cover" />
        )}
        {value && category === "teaser" && (
          <video src={value} controls className="max-h-56 w-full rounded-xl bg-black" />
        )}
      </div>
    </Field>
  );
}

export default function SeriesEditor({ initial }: { initial: SeriesData | null }) {
  const router = useRouter();
  const toast = useToast();
  const [id, setId] = useState(initial?.id ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(Boolean(initial?.slug));
  const [synopsis, setSynopsis] = useState(initial?.synopsis ?? "");
  const [posterUrl, setPosterUrl] = useState(initial?.posterUrl ?? "");
  const [teaserUrl, setTeaserUrl] = useState(initial?.teaserUrl ?? "");
  const [genres, setGenres] = useState(initial?.genres ?? []);
  const [tropeTags, setTropeTags] = useState(initial?.tropeTags ?? []);
  const [status, setStatus] = useState<"ONGOING" | "COMPLETED">(initial?.status ?? "ONGOING");
  const [freeEpisodeCount, setFreeEpisodeCount] = useState(initial?.freeEpisodeCount ?? 5);
  const [defaultCoinPrice, setDefaultCoinPrice] = useState(initial?.defaultCoinPrice ?? 10);
  const [isPublished, setIsPublished] = useState(initial?.isPublished ?? false);
  const [cast, setCast] = useState<Cast[]>(initial?.castMembers ?? []);
  const [episodes, setEpisodes] = useState<Episode[]>(initial?.episodes ?? []);
  const [seasons, setSeasons] = useState<Season[]>(initial?.seasons ?? []);
  const [seasonDraft, setSeasonDraft] = useState<Season | null>(null);
  const [newSeasonNumber, setNewSeasonNumber] = useState(
    Math.max(0, ...(initial?.seasons ?? []).map((season) => season.number)) + 1,
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [price, setPrice] = useState(10);
  const [saving, setSaving] = useState(false);
  const [episodeId, setEpisodeId] = useState(initial?.episodes[0]?.id ?? "");
  const [episodeDraft, setEpisodeDraft] = useState<Episode | null>(null);
  const [bulkText, setBulkText] = useState("");
  const [subtitleLang, setSubtitleLang] = useState("hi");
  const [subtitlePending, setSubtitlePending] = useState(false);
  const [episodeUploadProgress, setEpisodeUploadProgress] = useState(0);
  const [subtitleProgress, setSubtitleProgress] = useState(0);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [bulkSeasonId, setBulkSeasonId] = useState(initial?.seasons?.[0]?.id ?? "");
  const [bulkQueue, setBulkQueue] = useState<BulkUploadItem[]>([]);
  const parsedBulk = useMemo(
    () =>
      bulkText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [number, episodeTitle, episodePrice, free] = line
            .split("|")
            .map((item) => item?.trim());
          return {
            number: Number(number),
            title: episodeTitle ?? "",
            coinPrice: Number(episodePrice),
            isFree: free?.toLowerCase() === "true",
            valid: Boolean(Number(number) && episodeTitle && Number(episodePrice) > 0),
          };
        }),
    [bulkText],
  );

  async function saveSeries() {
    setSaving(true);
    const body = {
      slug: slug || slugify(title),
      title,
      synopsis,
      posterUrl,
      teaserUrl,
      genres,
      tropeTags,
      castNames: cast.map((item) => item.name),
      freeEpisodeCount,
      defaultCoinPrice,
      isPublished,
      status,
    };
    try {
      const response = await fetch("/api/admin/series", {
        method: id ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(id ? { id, data: body } : body),
      });
      if (!response.ok) throw new Error(await readError(response));
      const saved = (await response.json()) as { id: string };
      const nextId = id || saved.id;
      setId(nextId);
      const castResponse = await fetch(`/api/admin/series/${nextId}/cast`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          members: cast.map((item, index) => ({ ...item, sortOrder: index })),
        }),
      });
      if (!castResponse.ok) throw new Error(await readError(castResponse));
      toast(id ? "Series details saved." : "Series created.");
      router.replace(`/admin/series/${nextId}`);
      router.refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not save series.", "error");
    } finally {
      setSaving(false);
    }
  }
  async function saveSeason() {
    if (!seasonDraft) return;
    setPendingAction(`season-${seasonDraft.id}`);
    try {
      const response = await fetch(`/api/admin/seasons/${seasonDraft.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          number: seasonDraft.number,
          title: seasonDraft.title,
          sortOrder: seasonDraft.sortOrder,
        }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const data = (await response.json()) as { season: Season };
      setSeasons((current) =>
        current
          .map((season) => (season.id === data.season.id ? data.season : season))
          .sort((a, b) => a.sortOrder - b.sortOrder || a.number - b.number),
      );
      setSeasonDraft(null);
      toast("Season saved.");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Season save failed.", "error");
    } finally {
      setPendingAction(null);
    }
  }
  async function createSeason() {
    if (!id) return;
    setPendingAction("season-create");
    try {
      const response = await fetch("/api/admin/seasons", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          seriesId: id,
          number: newSeasonNumber,
          title: `Season ${newSeasonNumber}`,
          sortOrder: seasons.length,
        }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const data = (await response.json()) as { season: Season };
      setSeasons((current) => [...current, data.season].sort((a, b) => a.sortOrder - b.sortOrder));
      setBulkSeasonId(data.season.id);
      setNewSeasonNumber((value) => value + 1);
      toast("Season created.");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Season creation failed.", "error");
    } finally {
      setPendingAction(null);
    }
  }
  async function deleteSeason(season: Season) {
    if (!window.confirm("Delete this empty season? Episodes must be moved first.")) return;
    setPendingAction(`season-delete-${season.id}`);
    try {
      const response = await fetch(`/api/admin/seasons/${season.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await readError(response));
      setSeasons((current) => current.filter((item) => item.id !== season.id));
      if (bulkSeasonId === season.id) setBulkSeasonId(seasons.find((item) => item.id !== season.id)?.id ?? "");
      toast("Season deleted.");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Season deletion failed.", "error");
    } finally {
      setPendingAction(null);
    }
  }
  function selectEpisode(item: Episode) {
    setEpisodeId(item.id);
    setEpisodeDraft({ ...item, subtitles: item.subtitles ?? [] });
  }
  async function episodeAction(
    url: string,
    method: string,
    body: unknown,
    message: string,
    actionKey = "episode",
  ) {
    setPendingAction(actionKey);
    try {
      const response = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        toast(await readError(response), "error");
        return null;
      }
      toast(message);
      return (await response.json()) as { episode?: Episode; episodes?: Episode[] };
    } finally {
      setPendingAction(null);
    }
  }
  async function bulk(body: Record<string, unknown>, message: string) {
    if (!selected.length) return toast("Select at least one episode.", "info");
    const result = await episodeAction(
      "/api/admin/episodes/bulk",
      "PATCH",
      { ...body, episodeIds: selected },
      message,
      "bulk",
    );
    if (result?.episodes) {
      setEpisodes((current) =>
        current.map((item) => result.episodes?.find((next) => next.id === item.id) ?? item),
      );
      setSelected([]);
    }
  }
  async function renumberSelected() {
    if (!selected.length) return toast("Select episodes to renumber.", "error");
    const chosen = episodes
      .filter((item) => selected.includes(item.id))
      .sort((a, b) => a.number - b.number);
    const start = chosen[0]?.number ?? 1;
    const result = await episodeAction(
      "/api/admin/episodes/bulk",
      "PATCH",
      {
        episodeIds: selected,
        numbers: chosen.map((item, index) => ({ id: item.id, number: start + index })),
      },
      `${chosen.length} episodes renumbered.`,
      "bulk",
    );
    if (result?.episodes) {
      setEpisodes((current) =>
        current
          .map((item) => result.episodes?.find((next) => next.id === item.id) ?? item)
          .sort((a, b) => a.number - b.number),
      );
      setSelected([]);
    }
  }
  async function deleteEpisode(item: Episode) {
    const key = `delete-${item.id}`;
    setPendingAction(key);
    try {
      const response = await fetch(`/api/admin/episodes/${item.id}`, { method: "DELETE" });
      if (!response.ok) {
        toast(await readError(response), "error");
        return;
      }
      setEpisodes((current) => current.filter((episode) => episode.id !== item.id));
      toast(`Episode ${item.number} deleted.`);
    } finally {
      setPendingAction(null);
    }
  }
  async function saveEpisode() {
    if (!episodeDraft) return;
    const result = await episodeAction(
      `/api/admin/episodes/${episodeDraft.id}`,
      "PATCH",
      {
        title: episodeDraft.title,
        number: episodeDraft.number,
        seasonId: episodeDraft.seasonId,
        durationSec: episodeDraft.durationSec,
        hlsPath: episodeDraft.hlsPath,
        thumbnailUrl: episodeDraft.thumbnailUrl,
        isFree: episodeDraft.isFree,
        coinPrice: episodeDraft.coinPrice,
        publishedAt: episodeDraft.publishedAt,
        originalFilename: episodeDraft.originalFilename,
        sku: episodeDraft.sku,
      },
      "Episode saved.",
    );
    if (result?.episode)
      setEpisodes((current) =>
        current.map((item) => (item.id === result.episode?.id ? result.episode : item)),
      );
  }
  async function uploadEpisode(file: File) {
    if (!episodeDraft) return;
    const form = new FormData();
    form.append("file", file);
    setEpisodeUploadProgress(1);
    try {
      const data = await new Promise<{
        episode: Episode;
        processing?: { status: string; error?: string };
      }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `/api/admin/episodes/${episodeDraft.id}/upload`);
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable)
            setEpisodeUploadProgress(Math.round((event.loaded / event.total) * 100));
        };
        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300
            ? resolve(JSON.parse(xhr.responseText))
            : reject(
                new Error(JSON.parse(xhr.responseText)?.error?.message ?? "Video upload failed"),
              );
        xhr.onerror = () => reject(new Error("Video upload failed"));
        xhr.send(form);
      });
      setEpisodeDraft(data.episode);
      setEpisodes((current) =>
        current.map((item) => (item.id === data.episode.id ? data.episode : item)),
      );
      toast(
        data.processing?.status === "FAILED"
          ? `Video uploaded but processing failed: ${data.processing.error ?? "try again"}`
          : "Episode video uploaded and processed.",
        data.processing?.status === "FAILED" ? "error" : "success",
      );
    } catch (error) {
      toast(error instanceof Error ? error.message : "Video upload failed", "error");
    } finally {
      setEpisodeUploadProgress(0);
    }
  }
  async function uploadSubtitle(file: File) {
    if (!episodeDraft) return;
    setSubtitlePending(true);
    setSubtitleProgress(1);
    const form = new FormData();
    form.append("file", file);
    form.append("lang", subtitleLang);
    try {
      const data = await new Promise<{ subtitle: NonNullable<Episode["subtitles"]>[number] }>(
        (resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", `/api/admin/episodes/${episodeDraft.id}/subtitles`);
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable)
              setSubtitleProgress(Math.round((event.loaded / event.total) * 100));
          };
          xhr.onload = () =>
            xhr.status >= 200 && xhr.status < 300
              ? resolve(JSON.parse(xhr.responseText))
              : reject(
                  new Error(
                    JSON.parse(xhr.responseText)?.error?.message ?? "Subtitle upload failed",
                  ),
                );
          xhr.onerror = () => reject(new Error("Subtitle upload failed"));
          xhr.send(form);
        },
      );
      setEpisodeDraft((current) =>
        current
          ? {
              ...current,
              subtitles: [
                ...(current.subtitles ?? []).filter((item) => item.lang !== data.subtitle.lang),
                data.subtitle,
              ],
            }
          : current,
      );
      toast(`${subtitleLang} subtitles uploaded.`);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Subtitle upload failed", "error");
    } finally {
      setSubtitlePending(false);
      setSubtitleProgress(0);
    }
  }
  async function deleteSubtitle(subtitle: NonNullable<Episode["subtitles"]>[number]) {
    const key = `subtitle-delete-${subtitle.id}`;
    setPendingAction(key);
    try {
      const response = await fetch(`/api/admin/episodes/${episodeDraft?.id}/subtitles`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lang: subtitle.lang }),
      });
      if (!response.ok) {
        toast(await readError(response), "error");
        return;
      }
      setEpisodeDraft((current) =>
        current
          ? {
              ...current,
              subtitles: (current.subtitles ?? []).filter((item) => item.id !== subtitle.id),
            }
          : current,
      );
      toast(`${subtitle.lang} subtitles deleted.`);
    } finally {
      setPendingAction(null);
    }
  }
  async function addBulk() {
    if (!id || parsedBulk.some((item) => !item.valid))
      return toast("Fix the bulk episode preview before adding.", "error");
    setPendingAction("bulk-add");
    try {
      const response = await fetch("/api/admin/episodes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          seriesId: id,
          seasonId: bulkSeasonId || undefined,
          episodes: parsedBulk.map(({ valid: _valid, ...item }) => item),
        }),
      });
      if (!response.ok) {
        toast(await readError(response), "error");
        return;
      }
      const data = (await response.json()) as { episodes: Episode[] };
      setEpisodes((current) => [...current, ...data.episodes].sort((a, b) => a.number - b.number));
      setBulkText("");
      toast(`${data.episodes.length} episodes added.`);
    } finally {
      setPendingAction(null);
    }
  }
  function addBulkFiles(files: FileList | null) {
    if (!files) return;
    const selectedSeason = seasons.find((season) => season.id === bulkSeasonId) ?? seasons[0];
    if (!selectedSeason) {
      toast("Create a season before uploading episodes.", "error");
      return;
    }
    const lastNumber = episodes
      .filter((episode) => episode.seasonId === selectedSeason.id)
      .reduce((max, episode) => Math.max(max, episode.number), 0);
    const additions = Array.from(files).map((file, index) => ({
      id: `${Date.now()}-${index}-${file.name}`,
      file,
      number: lastNumber + index + 1,
      sku: "",
      status: "queued" as const,
      progress: 0,
    }));
    setBulkQueue((current) => [...current, ...additions]);
  }
  function updateBulkItem(id: string, patch: Partial<BulkUploadItem>) {
    setBulkQueue((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }
  async function uploadBulkItem(item: BulkUploadItem) {
    if (!id || !bulkSeasonId) return;
    updateBulkItem(item.id, { status: "uploading", progress: 1, error: undefined });
    try {
      const createResponse = await fetch("/api/admin/episodes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          seriesId: id,
          seasonId: bulkSeasonId,
          episodes: [{
            number: item.number,
            title: item.file.name.replace(/\.[^.]+$/, ""),
            coinPrice: defaultCoinPrice,
            isFree: false,
            originalFilename: item.file.name,
            sku: item.sku || null,
          }],
        }),
      });
      if (!createResponse.ok) throw new Error(await readError(createResponse));
      const created = (await createResponse.json()) as { episodes: Episode[] };
      const episode = created.episodes[0];
      setEpisodes((current) => [...current, episode].sort((a, b) => a.number - b.number));
      updateBulkItem(item.id, { status: "processing", progress: 25 });
      const form = new FormData();
      form.append("file", item.file);
      const uploadResponse = await new Promise<{ episode: Episode; processing?: { status: string; error?: string } }>(
        (resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", `/api/admin/episodes/${episode.id}/upload`);
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable)
              updateBulkItem(item.id, { progress: Math.max(25, Math.round((event.loaded / event.total) * 75) + 25) });
          };
          xhr.onload = () =>
            xhr.status >= 200 && xhr.status < 300
              ? resolve(JSON.parse(xhr.responseText))
              : reject(new Error(JSON.parse(xhr.responseText)?.error?.message ?? "Video upload failed"));
          xhr.onerror = () => reject(new Error("Video upload failed"));
          xhr.send(form);
        },
      );
      setEpisodes((current) =>
        current.map((episodeItem) => (episodeItem.id === uploadResponse.episode.id ? uploadResponse.episode : episodeItem)),
      );
      if (uploadResponse.processing?.status === "FAILED")
        throw new Error(uploadResponse.processing.error ?? "Video processing failed");
      updateBulkItem(item.id, { status: "ready", progress: 100 });
    } catch (error) {
      updateBulkItem(item.id, {
        status: "failed",
        error: error instanceof Error ? error.message : "Upload failed",
      });
    }
  }
  async function runBulkQueue(retryOnly = false) {
    const pending = bulkQueue.filter((item) =>
      retryOnly ? item.status === "failed" : item.status === "queued",
    );
    let cursor = 0;
    async function worker() {
      while (cursor < pending.length) {
        const item = pending[cursor++];
        await uploadBulkItem(item);
      }
    }
    await Promise.all([worker(), worker(), worker()]);
  }
  return (
    <div className="mt-6 space-y-6">
      <Section
        title="Details"
        description="Clear metadata helps viewers discover and understand the series."
      >
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Title" helper="The name viewers will see.">
            <input
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                if (!slugEdited) setSlug(slugify(event.target.value));
              }}
              className={inputClass}
            />
          </Field>
          <Field label="Slug" helper="Editable URL-safe identifier; it must be unique.">
            <input
              value={slug}
              onChange={(event) => {
                setSlugEdited(true);
                setSlug(event.target.value);
              }}
              className={inputClass}
            />
          </Field>
          <Field label="Synopsis" helper="A short description shown on the series page.">
            <textarea
              value={synopsis}
              onChange={(event) => setSynopsis(event.target.value)}
              rows={4}
              className={inputClass}
            />
          </Field>
          <div className="space-y-5">
            <Field label="Status" helper="Ongoing keeps the story marked as active.">
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as "ONGOING" | "COMPLETED")}
                className={inputClass}
              >
                <option value="ONGOING">Ongoing</option>
                <option value="COMPLETED">Completed</option>
              </select>
            </Field>
            <Field
              label="Free episode count"
              helper="Default number of opening episodes available without coins."
            >
              <input
                type="number"
                min="0"
                value={freeEpisodeCount}
                onChange={(event) => setFreeEpisodeCount(Number(event.target.value))}
                className={inputClass}
              />
            </Field>
          </div>
          <Field label="Genres" helper="Press Enter after each genre.">
            <TagInput value={genres} onChange={setGenres} placeholder="romance, thriller…" />
          </Field>
          <Field
            label="Trope tags"
            helper="Search-friendly story themes. Press Enter after each tag."
          >
            <TagInput value={tropeTags} onChange={setTropeTags} placeholder="enemies to lovers…" />
          </Field>
          <Field
            label="Default coin price"
            helper="Price used when a new episode does not specify its own."
          >
            <input
              type="number"
              min="1"
              value={defaultCoinPrice}
              onChange={(event) => setDefaultCoinPrice(Number(event.target.value))}
              className={inputClass}
            />
          </Field>
          <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-zinc-950 p-4">
            <input
              type="checkbox"
              checked={isPublished}
              onChange={(event) => setIsPublished(event.target.checked)}
              className="h-4 w-4 accent-rose-500"
            />
            <span>
              <b className="block text-sm">Published</b>
              <small className="text-xs text-zinc-500">
                Make this series visible on the public catalogue.
              </small>
            </span>
          </label>
        </div>
        <div className="mt-5 flex justify-end">
          <Button onClick={() => void saveSeries()} pending={saving}>
            {id ? "Save details" : "Create series"}
          </Button>
        </div>
      </Section>
      <Section
        title="Media"
        description="Upload files from your computer or paste an existing URL."
      >
        <div className="grid gap-5 md:grid-cols-2">
          <UploadField
            label="Poster"
            helper="Portrait artwork shown in lists and on the series page."
            value={posterUrl}
            category="poster"
            accept="image/*"
            onChange={setPosterUrl}
          />
          <UploadField
            label="Teaser"
            helper="Short preview video shown before viewers start the series."
            value={teaserUrl}
            category="teaser"
            accept="video/*"
            onChange={setTeaserUrl}
          />
        </div>
      </Section>
      <Section
        title="Cast"
        description="Structured cast is shown publicly; legacy cast names stay synchronized for compatibility."
        actions={
          <Button
            variant="secondary"
            onClick={() =>
              setCast((current) => [
                ...current,
                { name: "", role: "", photo: null, sortOrder: current.length },
              ])
            }
          >
            + Add cast member
          </Button>
        }
      >
        <div className="space-y-3">
          {cast.map((member, index) => (
            <div
              key={`${member.id ?? "new"}-${index}`}
              className="grid gap-3 rounded-xl border border-white/10 bg-zinc-950 p-3 md:grid-cols-[1fr_1fr_1fr_auto]"
            >
              <input
                aria-label="Artist name"
                value={member.name}
                onChange={(event) =>
                  setCast((current) =>
                    current.map((item, i) =>
                      i === index ? { ...item, name: event.target.value } : item,
                    ),
                  )
                }
                placeholder="Artist name"
                className={inputClass}
              />
              <input
                aria-label="Role or character"
                value={member.role ?? ""}
                onChange={(event) =>
                  setCast((current) =>
                    current.map((item, i) =>
                      i === index ? { ...item, role: event.target.value } : item,
                    ),
                  )
                }
                placeholder="Role / character"
                className={inputClass}
              />
              <UploadField
                label="Photo"
                helper="Optional cast portrait."
                value={member.photo ?? ""}
                category="cast"
                accept="image/*"
                onChange={(value) =>
                  setCast((current) =>
                    current.map((item, i) => (i === index ? { ...item, photo: value } : item)),
                  )
                }
              />
              <Button
                variant="destructive"
                onClick={() => setCast((current) => current.filter((_, i) => i !== index))}
              >
                Remove
              </Button>
            </div>
          ))}
          {!cast.length && (
            <p className="text-sm text-zinc-500">
              No structured cast yet. Add a member to show names and roles publicly.
            </p>
          )}
        </div>
        {id && (
          <div className="mt-4 flex justify-end">
            <Button variant="secondary" onClick={() => void saveSeries()}>
              Save cast and details
            </Button>
          </div>
        )}
      </Section>
      {id && (
        <Section
          title="Seasons"
          description="Episodes stay numbered across the series; seasons are a grouping and management layer."
          actions={
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                value={newSeasonNumber}
                onChange={(event) => setNewSeasonNumber(Number(event.target.value))}
                aria-label="New season number"
                className={`${inputClass} w-24`}
              />
              <Button variant="secondary" pending={pendingAction === "season-create"} onClick={() => void createSeason()}>
                + Add season
              </Button>
            </div>
          }
        >
          <div className="space-y-2">
            {seasons.map((season) => (
              <div key={season.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-zinc-950 p-3">
                <div>
                  <p className="font-semibold">S{season.number} · {season.title || `Season ${season.number}`}</p>
                  <p className="text-xs text-zinc-500">{season._count?.episodes ?? episodes.filter((episode) => episode.seasonId === season.id).length} episodes</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setSeasonDraft({ ...season })}>Edit</Button>
                  <Button
                    variant="destructive"
                    pending={pendingAction === `season-delete-${season.id}`}
                    onClick={() => void deleteSeason(season)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
            {!seasons.length && <p className="text-sm text-zinc-500">No seasons yet.</p>}
          </div>
        </Section>
      )}
      {id && (
        <Section
          title="Episodes"
          description="The chips make access and publishing state visible immediately."
        >
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-zinc-950 p-3">
            <b className="mr-2 text-sm">{selected.length} selected</b>
            <input
              type="number"
              min="1"
              value={price}
              onChange={(event) => setPrice(Number(event.target.value))}
              aria-label="Bulk price"
              className={`${inputClass} w-28`}
            />
            <Button
              variant="secondary"
              pending={pendingAction === "bulk"}
              onClick={() =>
                void bulk(
                  { coinPrice: price },
                  `${selected.length} episodes priced at ${price} coins.`,
                )
              }
            >
              Set price
            </Button>
            <Button
              variant="secondary"
              pending={pendingAction === "bulk"}
              onClick={() =>
                void bulk({ isFree: true }, `${selected.length} episodes marked free.`)
              }
            >
              Mark free
            </Button>
            <Button
              variant="secondary"
              pending={pendingAction === "bulk"}
              onClick={() =>
                void bulk({ isFree: false }, `${selected.length} episodes marked VIP.`)
              }
            >
              Mark VIP
            </Button>
            <Button
              variant="secondary"
              pending={pendingAction === "bulk"}
              onClick={() =>
                void bulk(
                  { publishedAt: new Date().toISOString() },
                  `${selected.length} episodes published.`,
                )
              }
            >
              Publish
            </Button>
            <Button
              variant="secondary"
              pending={pendingAction === "bulk"}
              onClick={() =>
                void bulk({ publishedAt: null }, `${selected.length} episodes unpublished.`)
              }
            >
              Unpublish
            </Button>
            <Button
              variant="secondary"
              pending={pendingAction === "bulk"}
              onClick={() => void renumberSelected()}
            >
              Renumber {selected.length}
            </Button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="bg-zinc-950 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="p-3">
                    <input
                      type="checkbox"
                      aria-label="Select all episodes"
                      checked={Boolean(episodes.length && selected.length === episodes.length)}
                      onChange={(event) =>
                        setSelected(event.target.checked ? episodes.map((item) => item.id) : [])
                      }
                    />
                  </th>
                  <th className="p-3">No.</th>
                  <th className="p-3">Episode</th>
                  <th className="p-3">Duration</th>
                  <th className="p-3">Price</th>
                  <th className="p-3">Access</th>
                  <th className="p-3">Publishing</th>
                  <th className="p-3">Media</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {episodes.map((item) => (
                  <tr key={item.id} className="border-t border-white/10">
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={selected.includes(item.id)}
                        onChange={(event) =>
                          setSelected((current) =>
                            event.target.checked
                              ? [...current, item.id]
                              : current.filter((idValue) => idValue !== item.id),
                          )
                        }
                      />
                    </td>
                    <td className="p-3 font-bold">
                      <span className="block">S{seasons.find((season) => season.id === item.seasonId)?.number ?? 1} · EP {item.number}</span>
                      {item.originalFilename && <span className="text-xs font-normal text-zinc-500">{item.originalFilename}</span>}
                    </td>
                    <td className="p-3">
                      <button
                        type="button"
                        onClick={() => selectEpisode(item)}
                        className="text-left font-semibold hover:text-rose-300"
                      >
                        {item.title}
                      </button>
                    </td>
                    <td className="p-3 text-zinc-400">
                      {Math.floor(item.durationSec / 60)}m {item.durationSec % 60}s
                    </td>
                    <td className="p-3">🪙 {item.coinPrice}</td>
                    <td className="p-3">
                      <StatusChip tone={item.isFree ? "success" : "warning"}>
                        {item.isFree ? "Free" : "VIP"}
                      </StatusChip>
                    </td>
                    <td className="p-3">
                      <StatusChip tone={item.publishedAt ? "success" : "neutral"}>
                        {item.publishedAt ? "Published" : "Draft"}
                      </StatusChip>
                    </td>
                    <td className="p-3">
                      <StatusChip
                        tone={
                          item.processingStatus === "FAILED"
                            ? "danger"
                            : item.processingStatus === "PROCESSING"
                              ? "warning"
                              : "success"
                        }
                      >
                        {item.processingStatus === "FAILED"
                          ? "Processing failed"
                          : item.processingStatus === "PROCESSING"
                            ? "Processing"
                            : item.thumbnailSource === "CUSTOM"
                              ? "Custom media"
                              : "Ready"}
                      </StatusChip>
                    </td>
                    <td className="p-3">
                      <div className="flex gap-2">
                        <Button variant="secondary" onClick={() => selectEpisode(item)}>
                          Edit
                        </Button>
                        <Confirm
                          message="Delete this episode? Paid history blocks deletion."
                          onConfirm={() => void deleteEpisode(item)}
                        >
                          Delete
                        </Confirm>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-5 rounded-xl border border-dashed border-white/15 p-4">
            <h3 className="font-bold">Bulk add episodes</h3>
            <p className="mt-1 text-xs text-zinc-500">
              One per line: number|title|price|free — example: 61|A new secret|12|false
            </p>
            <textarea
              value={bulkText}
              onChange={(event) => setBulkText(event.target.value)}
              rows={4}
              placeholder="61|A new secret|12|false"
              className={`${inputClass} mt-3 font-mono`}
            />
            {parsedBulk.length > 0 && (
              <div className="mt-3 space-y-1 text-xs">
                {parsedBulk.map((item, index) => (
                  <p
                    key={`${item.number}-${index}`}
                    className={item.valid ? "text-emerald-300" : "text-rose-300"}
                  >
                    {item.valid ? "✓" : "!"} {item.number} · {item.title} · 🪙 {item.coinPrice} ·{" "}
                    {item.isFree ? "Free" : "VIP"}
                  </p>
                ))}
              </div>
            )}
            <div className="mt-3 flex justify-end">
              <Button onClick={() => void addBulk()}>Add previewed episodes</Button>
            </div>
          </div>
          <div className="mt-5 rounded-xl border border-rose-400/20 bg-rose-950/10 p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="font-bold">Bulk video upload</h3>
                <p className="mt-1 text-xs text-zinc-500">
                  Upload up to several files at once. Three files process concurrently; each file keeps its own result.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <select
                  value={bulkSeasonId}
                  onChange={(event) => setBulkSeasonId(event.target.value)}
                  aria-label="Bulk upload season"
                  className={`${inputClass} w-44`}
                >
                  {seasons.map((season) => (
                    <option key={season.id} value={season.id}>
                      S{season.number} · {season.title || `Season ${season.number}`}
                    </option>
                  ))}
                </select>
                <label className="cursor-pointer rounded-xl bg-rose-500 px-4 py-2.5 text-sm font-bold">
                  Choose videos
                  <input
                    type="file"
                    multiple
                    accept="video/*"
                    className="sr-only"
                    onChange={(event) => {
                      addBulkFiles(event.target.files);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
              </div>
            </div>
            {bulkQueue.length > 0 && (
              <div className="mt-4 space-y-2">
                {bulkQueue.map((item) => (
                  <div key={item.id} className="grid gap-2 rounded-xl border border-white/10 bg-zinc-950 p-3 md:grid-cols-[1.4fr_90px_1fr_120px] md:items-center">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{item.file.name}</p>
                      <p className="text-xs text-zinc-500">{item.file.size.toLocaleString()} bytes</p>
                    </div>
                    <label className="text-xs text-zinc-400">
                      EP #
                      <input
                        type="number"
                        min="1"
                        value={item.number}
                        disabled={item.status !== "queued" && item.status !== "failed"}
                        onChange={(event) => updateBulkItem(item.id, { number: Number(event.target.value) })}
                        className={`${inputClass} mt-1`}
                      />
                    </label>
                    <label className="text-xs text-zinc-400">
                      SKU
                      <input
                        value={item.sku}
                        disabled={item.status !== "queued" && item.status !== "failed"}
                        onChange={(event) => updateBulkItem(item.id, { sku: event.target.value })}
                        placeholder="Optional unique SKU"
                        className={`${inputClass} mt-1`}
                      />
                    </label>
                    <div>
                      <StatusChip tone={item.status === "failed" ? "danger" : item.status === "ready" ? "success" : "warning"}>
                        {item.status}
                      </StatusChip>
                      {item.status === "failed" && (
                        <button type="button" className="ml-2 text-xs text-rose-300 underline" onClick={() => void uploadBulkItem(item)}>
                          Retry
                        </button>
                      )}
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                        <div className="h-full bg-rose-500 transition-all" style={{ width: `${item.progress}%` }} />
                      </div>
                      {item.error && <p className="mt-1 text-xs text-rose-300">{item.error}</p>}
                    </div>
                  </div>
                ))}
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setBulkQueue([])}>Clear queue</Button>
                  <Button onClick={() => void runBulkQueue()}>Start queued uploads</Button>
                  <Button variant="secondary" onClick={() => void runBulkQueue(true)}>Retry failed</Button>
                </div>
              </div>
            )}
          </div>
          {episodeDraft && (
            <AdminModal
              open
              title={`Edit episode S${seasons.find((season) => season.id === episodeDraft.seasonId)?.number ?? 1} · EP ${episodeDraft.number}`}
              description="Metadata changes stay here; media and subtitle uploads remain available in this panel."
              onClose={() => setEpisodeDraft(null)}
            >
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="space-y-4">
                <Field label="Title" helper="The title shown in the episode list.">
                  <input
                    value={episodeDraft.title}
                    onChange={(event) =>
                      setEpisodeDraft({ ...episodeDraft, title: event.target.value })
                    }
                    className={inputClass}
                  />
                </Field>
                <div className="grid gap-3 sm:grid-cols-4">
                  <Field label="Season">
                    <select
                      value={episodeDraft.seasonId ?? ""}
                      onChange={(event) => setEpisodeDraft({ ...episodeDraft, seasonId: event.target.value || null })}
                      className={inputClass}
                    >
                      {seasons.map((season) => (
                        <option key={season.id} value={season.id}>S{season.number} · {season.title || `Season ${season.number}`}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Number">
                    <input
                      type="number"
                      value={episodeDraft.number}
                      onChange={(event) =>
                        setEpisodeDraft({ ...episodeDraft, number: Number(event.target.value) })
                      }
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Duration (sec)">
                    <input
                      type="number"
                      min="1"
                      value={episodeDraft.durationSec}
                      onChange={(event) =>
                        setEpisodeDraft({
                          ...episodeDraft,
                          durationSec: Number(event.target.value),
                        })
                      }
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Coin price">
                    <input
                      type="number"
                      min="1"
                      value={episodeDraft.coinPrice}
                      onChange={(event) =>
                        setEpisodeDraft({ ...episodeDraft, coinPrice: Number(event.target.value) })
                      }
                      className={inputClass}
                    />
                  </Field>
                  <Field label="SKU">
                    <input
                      value={episodeDraft.sku ?? ""}
                      onChange={(event) => setEpisodeDraft({ ...episodeDraft, sku: event.target.value || null })}
                      placeholder="Optional unique SKU"
                      className={inputClass}
                    />
                  </Field>
                </div>
                <div className="flex flex-wrap gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={episodeDraft.isFree}
                      onChange={(event) =>
                        setEpisodeDraft({ ...episodeDraft, isFree: event.target.checked })
                      }
                    />{" "}
                    Free episode
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(episodeDraft.publishedAt)}
                      onChange={(event) =>
                        setEpisodeDraft({
                          ...episodeDraft,
                          publishedAt: event.target.checked ? new Date().toISOString() : null,
                        })
                      }
                    />{" "}
                    Published
                  </label>
                </div>
                <Button onClick={() => void saveEpisode()}>Save episode</Button>
              </div>
              <div className="space-y-4">
                <Field
                  label="Video upload"
                  helper="Upload-first workflow; the raw path is kept below for advanced cases."
                >
                  <input
                    type="file"
                    accept="video/*"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void uploadEpisode(file);
                    }}
                    className={`${inputClass} file:mr-3 file:rounded-lg file:border-0 file:bg-rose-500 file:px-3 file:py-2 file:text-white`}
                  />
                  {episodeDraft.hlsPath !== "pending" && (
                    <video
                      controls
                      src={mediaUrl(episodeDraft.hlsPath)}
                      className="mt-3 max-h-52 w-full rounded-xl bg-black"
                    />
                  )}
                </Field>
                <details>
                  <summary className="cursor-pointer text-sm text-zinc-400">
                    Advanced media paths
                  </summary>
                  <div className="mt-3 space-y-3">
                    <Field
                      label="Video path"
                      helper="Only use this when an external processor has already created the path."
                    >
                      <input
                        value={episodeDraft.hlsPath}
                        onChange={(event) =>
                          setEpisodeDraft({ ...episodeDraft, hlsPath: event.target.value })
                        }
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Thumbnail URL">
                      <input
                        value={episodeDraft.thumbnailUrl}
                        onChange={(event) =>
                          setEpisodeDraft({ ...episodeDraft, thumbnailUrl: event.target.value })
                        }
                        className={inputClass}
                      />
                    </Field>
                  </div>
                </details>
                <Field label="Subtitles" helper="Upload one SRT track per language.">
                  <div className="flex gap-2">
                    <input
                      value={subtitleLang}
                      onChange={(event) => setSubtitleLang(event.target.value)}
                      placeholder="Language code"
                      className={`${inputClass} w-32`}
                    />
                    <input
                      type="file"
                      accept=".srt,text/plain"
                      disabled={subtitlePending}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void uploadSubtitle(file);
                      }}
                      className={inputClass}
                    />
                  </div>
                  <ul className="mt-3 space-y-2">
                    {(episodeDraft.subtitles ?? []).map((subtitle) => (
                      <li
                        key={subtitle.id}
                        className="flex items-center justify-between rounded-lg bg-zinc-900 px-3 py-2 text-sm"
                      >
                        <span>{subtitle.lang}</span>
                        <Confirm
                          pending={pendingAction === `subtitle-delete-${subtitle.id}`}
                          message={`Delete ${subtitle.lang} subtitles?`}
                          onConfirm={() => void deleteSubtitle(subtitle)}
                        >
                          Delete
                        </Confirm>
                      </li>
                    ))}
                  </ul>
                </Field>
              </div>
            </div>
            </AdminModal>
          )}
        </Section>
      )}
      {(episodeUploadProgress > 0 || subtitleProgress > 0) && (
        <div className="fixed bottom-5 left-5 z-50 rounded-xl border border-white/10 bg-zinc-900 px-4 py-3 text-sm shadow-2xl">
          {episodeUploadProgress > 0
            ? `Uploading episode video… ${episodeUploadProgress}%`
            : `Uploading subtitles… ${subtitleProgress}%`}
        </div>
      )}
    </div>
  );
}
