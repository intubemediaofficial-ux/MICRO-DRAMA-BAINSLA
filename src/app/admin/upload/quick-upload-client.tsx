"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Field,
  inputClass,
  StatusChip,
  useToast,
} from "@/components/admin/admin-ui";
import {
  getEpisodeUploadStates,
  isVideoFile,
  planEpisodeNumbers,
  pollEpisodeProcessing,
  pollEpisodeProcessingBatch,
  uploadEpisodeVideo,
  type EpisodeUploadState,
} from "@/lib/admin-upload";

type SeriesOption = {
  id: string;
  title: string;
  defaultCoinPrice: number;
  freeEpisodeCount: number;
  isPublished: boolean;
  genres: string[];
};

type UploadStatus = "queued" | "uploading" | "processing" | "ready" | "failed";

type UploadItem = {
  id: string;
  file: File;
  number: number;
  title: string;
  titleEdited: boolean;
  isFree: boolean;
  isFreeEdited: boolean;
  status: UploadStatus;
  progress: number;
  seriesId?: string;
  episodeId?: string;
  episode?: EpisodeUploadState;
  error?: string;
};

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function responseError(response: Response) {
  const body = await response.json().catch(() => null);
  return body?.error?.message ?? "The request could not be completed.";
}

function statusLabel(item: UploadItem, seriesIsPublished: boolean) {
  if (item.status === "uploading") return `Uploading ${item.progress}%`;
  if (item.status === "processing") return "Processing";
  if (item.status === "failed") return "Failed";
  if (item.status === "ready")
    return item.episode?.publishedAt && seriesIsPublished ? "Published" : "Ready";
  return "Queued";
}

export default function QuickUploadClient({
  series,
  initialSeriesId,
}: {
  series: SeriesOption[];
  initialSeriesId: string;
}) {
  const toast = useToast();
  const initialSeries = series.find((item) => item.id === initialSeriesId);
  const [mode, setMode] = useState<"new" | "existing">(initialSeries ? "existing" : "new");
  const [selectedSeriesId, setSelectedSeriesId] = useState(initialSeries?.id ?? "");
  const [createdSeriesId, setCreatedSeriesId] = useState("");
  const [title, setTitle] = useState("");
  const [freeEpisodeCount, setFreeEpisodeCount] = useState(initialSeries?.freeEpisodeCount ?? 5);
  const [coinPrice, setCoinPrice] = useState(initialSeries?.defaultCoinPrice ?? 10);
  const [genresText, setGenresText] = useState(initialSeries?.genres.join(", ") ?? "");
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [publishEach, setPublishEach] = useState(true);
  const [publishSeriesFirst, setPublishSeriesFirst] = useState(!initialSeries);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [existingNumbers, setExistingNumbers] = useState<number[]>([]);
  const [loadingNumbers, setLoadingNumbers] = useState(false);
  const [running, setRunning] = useState(false);
  const [batchComplete, setBatchComplete] = useState(false);
  const [seriesIsPublished, setSeriesIsPublished] = useState(initialSeries?.isPublished ?? false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const videoPicker = useRef<HTMLInputElement>(null);
  const folderPicker = useRef<HTMLInputElement>(null);
  const selectedSeries = series.find((item) => item.id === selectedSeriesId);
  const activeSeriesId = createdSeriesId || (mode === "existing" ? selectedSeriesId : "");
  const activeSeriesLink = activeSeriesId ? `/admin/series/${activeSeriesId}` : "";

  useEffect(() => {
    if (mode === "new") {
      setFreeEpisodeCount(5);
      setCoinPrice(10);
      setGenresText("");
      setPublishSeriesFirst(true);
      setSeriesIsPublished(false);
      return;
    }
    setPublishSeriesFirst(false);
    if (selectedSeries) {
      setFreeEpisodeCount(selectedSeries.freeEpisodeCount);
      setCoinPrice(selectedSeries.defaultCoinPrice);
      setGenresText(selectedSeries.genres.join(", "));
      setSeriesIsPublished(selectedSeries.isPublished);
    }
  }, [mode, selectedSeries]);

  useEffect(() => {
    setItems((current) =>
      current.map((item) =>
        item.status === "queued" && !item.isFreeEdited
          ? { ...item, isFree: item.number <= freeEpisodeCount }
          : item,
      ),
    );
  }, [freeEpisodeCount]);

  useEffect(() => {
    if (mode !== "existing" || !selectedSeriesId || createdSeriesId) {
      setExistingNumbers([]);
      setLoadingNumbers(false);
      return;
    }
    let cancelled = false;
    setLoadingNumbers(true);
    void getEpisodeUploadStates(selectedSeriesId)
      .then((episodes) => {
        if (!cancelled) setExistingNumbers(episodes.map((episode) => episode.number));
      })
      .catch((error) => {
        if (!cancelled)
          toast(error instanceof Error ? error.message : "Could not load existing episodes.", "error");
      })
      .finally(() => {
        if (!cancelled) setLoadingNumbers(false);
      });
    return () => {
      cancelled = true;
    };
  }, [createdSeriesId, mode, selectedSeriesId, toast]);

  useEffect(() => {
    if (!items.some((item) => item.status === "uploading")) return;
    const message =
      "Once every file shows Processing you can close this page; the server finishes and publishes automatically.";
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = message;
      return message;
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [items]);

  const freeEpisodeCountLabel = useMemo(() => Math.max(0, freeEpisodeCount), [freeEpisodeCount]);

  function updateItem(id: string, patch: Partial<UploadItem>) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function addFiles(fileList: FileList | null) {
    if (!fileList) return;
    if (mode === "existing" && loadingNumbers) {
      toast("Wait for the selected series' episodes to load first.", "info");
      return;
    }
    const files = Array.from(fileList).filter(isVideoFile);
    if (!files.length) return;
    if (files.length !== fileList.length) toast("Non-video files were ignored.", "info");
    setItems((current) => {
      const usedNumbers = [...existingNumbers, ...current.map((item) => item.number)];
      const additions = planEpisodeNumbers(files, usedNumbers).map(({ file, number }) => ({
        id: `${Date.now()}-${Math.random()}-${file.name}`,
        file,
        number,
        title: `Episode ${number}`,
        titleEdited: false,
        isFree: number <= freeEpisodeCountLabel,
        isFreeEdited: false,
        status: "queued" as const,
        progress: 0,
      }));
      return [...current, ...additions];
    });
    setBatchComplete(false);
  }

  async function uploadPoster() {
    if (!posterFile) return "";
    const form = new FormData();
    form.append("file", posterFile);
    form.append("category", "poster");
    const response = await fetch("/api/admin/media/upload", { method: "POST", body: form });
    if (!response.ok) throw new Error(await responseError(response));
    const result = (await response.json()) as { url: string };
    return result.url;
  }

  async function createTargetSeries() {
    if (mode === "existing") {
      if (!selectedSeries) throw new Error("Choose an existing series first.");
      const posterUrl = await uploadPoster();
      const publishFirst =
        !selectedSeries.isPublished && publishSeriesFirst;
      const response = await fetch("/api/admin/series", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: selectedSeries.id,
          data: {
            publishOnFirstReady: publishFirst,
            freeEpisodeCount,
            defaultCoinPrice: coinPrice,
            genres: genresText
              .split(",")
              .map((genre) => genre.trim())
              .filter(Boolean),
            ...(posterUrl ? { posterUrl } : {}),
          },
        }),
      });
      if (!response.ok) throw new Error(await responseError(response));
      return {
        id: selectedSeries.id,
        isPublished: selectedSeries.isPublished,
        publishFirst,
      };
    }

    if (createdSeriesId) return { id: createdSeriesId, isPublished: false, publishFirst: publishSeriesFirst };
    if (!title.trim()) throw new Error("Series title is required.");
    const posterUrl = await uploadPoster();
    const response = await fetch("/api/admin/series", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        synopsis: "",
        posterUrl,
        teaserUrl: "",
        genres: genresText
          .split(",")
          .map((genre) => genre.trim())
          .filter(Boolean),
        freeEpisodeCount,
        defaultCoinPrice: coinPrice,
        status: "ONGOING",
        publishOnFirstReady: publishSeriesFirst,
      }),
    });
    if (!response.ok) throw new Error(await responseError(response));
    const created = (await response.json()) as { id: string };
    setCreatedSeriesId(created.id);
    setSeriesIsPublished(false);
    return { id: created.id, isPublished: false, publishFirst: publishSeriesFirst };
  }

  async function uploadAll() {
    const pendingItems = items.filter((item) => item.status === "queued");
    if (!pendingItems.length) return toast("Choose video files before uploading.", "error");
    if (mode === "existing" && loadingNumbers)
      return toast("Wait for the selected series' episodes to load first.", "info");
    setRunning(true);
    setBatchComplete(false);
    try {
      const used = new Set(existingNumbers);
      for (const item of pendingItems) {
        if (!Number.isInteger(item.number) || item.number < 1)
          throw new Error("Episode numbers must be positive whole numbers.");
        if (used.has(item.number))
          throw new Error(`Episode number ${item.number} is already used in this series.`);
        used.add(item.number);
      }
      const target = await createTargetSeries();
      const createResponse = await fetch("/api/admin/episodes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          seriesId: target.id,
          episodes: pendingItems.map((item) => ({
            number: item.number,
            title: item.title.trim() || `Episode ${item.number}`,
            coinPrice,
            isFree: item.isFree,
            hlsPath: "",
            publishedAt: null,
            originalFilename: item.file.name,
          })),
        }),
      });
      if (!createResponse.ok) throw new Error(await responseError(createResponse));
      const created = (await createResponse.json()) as { episodes: EpisodeUploadState[] };
      const targets = pendingItems.map((item, index) => ({
        ...item,
        seriesId: target.id,
        episodeId: created.episodes[index].id,
        episode: created.episodes[index],
      }));
      setItems((current) =>
        current.map((item) => {
          const createdItem = targets.find((targetItem) => targetItem.id === item.id);
          return createdItem
            ? {
                ...item,
                seriesId: createdItem.seriesId,
                episodeId: createdItem.episodeId,
                episode: createdItem.episode,
              }
            : item;
        }),
      );

      const uploadTargets = [...targets];
      let cursor = 0;
      const uploadedEpisodeIds = new Set<string>();
      async function worker() {
        while (cursor < uploadTargets.length) {
          const item = uploadTargets[cursor++];
          if (!item.episodeId) continue;
          updateItem(item.id, { status: "uploading", progress: 0, error: undefined });
          try {
            const episode = await uploadEpisodeVideo(item.episodeId, item.file, {
              publish: publishEach,
              onProgress: (progress) => updateItem(item.id, { progress }),
            });
            updateItem(item.id, { status: "processing", progress: 100, episode });
            uploadedEpisodeIds.add(item.episodeId);
          } catch (error) {
            updateItem(item.id, {
              status: "failed",
              error: error instanceof Error ? error.message : "Video upload failed.",
            });
          }
        }
      }
      await Promise.all([worker(), worker(), worker()]);
      if (uploadedEpisodeIds.size) {
        try {
          await pollEpisodeProcessingBatch(target.id, [...uploadedEpisodeIds], (processed) => {
            const item = uploadTargets.find(
              (uploadTarget) => uploadTarget.episodeId === processed.id,
            );
            if (!item) return;
            if (processed.publishedAt && target.publishFirst) setSeriesIsPublished(true);
            if (processed.processingStatus === "FAILED") {
              updateItem(item.id, {
                status: "failed",
                progress: 100,
                episode: processed,
                error: processed.processingError ?? "Video processing failed.",
              });
            } else if (processed.processingStatus === "READY") {
              updateItem(item.id, { status: "ready", progress: 100, episode: processed });
            } else {
              updateItem(item.id, { status: "processing", episode: processed });
            }
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Could not poll episode status.";
          for (const item of uploadTargets)
            if (item.episodeId && uploadedEpisodeIds.has(item.episodeId))
              updateItem(item.id, { status: "failed", error: message });
          toast(message, "error");
        }
      }
      setBatchComplete(true);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Bulk upload failed.", "error");
    } finally {
      setRunning(false);
    }
  }

  async function retryItem(item: UploadItem) {
    const itemSeriesId = item.seriesId ?? activeSeriesId;
    if (!item.episodeId || !itemSeriesId) return;
    setRetryingId(item.id);
    setBatchComplete(false);
    updateItem(item.id, { status: "uploading", progress: 0, error: undefined });
    try {
      const uploaded = await uploadEpisodeVideo(item.episodeId, item.file, {
        publish: publishEach,
        onProgress: (progress) => updateItem(item.id, { progress }),
      });
      updateItem(item.id, { status: "processing", progress: 100, episode: uploaded });
      const processed = await pollEpisodeProcessing(itemSeriesId, item.episodeId, (episode) => {
        if (episode.publishedAt && publishSeriesFirst) setSeriesIsPublished(true);
        updateItem(item.id, { status: "processing", episode });
      });
      if (processed.processingStatus === "FAILED")
        throw new Error(processed.processingError ?? "Video processing failed.");
      updateItem(item.id, { status: "ready", progress: 100, episode: processed });
      setBatchComplete(true);
    } catch (error) {
      updateItem(item.id, {
        status: "failed",
        error: error instanceof Error ? error.message : "Video upload failed.",
      });
    } finally {
      setRetryingId(null);
    }
  }

  function updateNumber(item: UploadItem, number: number) {
    updateItem(item.id, {
      number,
      ...(!item.titleEdited ? { title: `Episode ${number}` } : {}),
      ...(!item.isFreeEdited ? { isFree: number <= freeEpisodeCountLabel } : {}),
    });
  }

  const isUploading = items.some((item) => item.status === "uploading");
  const hasQueued = items.some((item) => item.status === "queued");
  const hasCreatedEpisodes = items.some((item) => item.episodeId);

  return (
    <div className="mt-6 space-y-6">
      <section className="rounded-2xl border border-white/10 bg-zinc-900/80 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black">Quick upload</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Create a series or add episodes, then upload videos in parallel.
            </p>
          </div>
          <Link href="/admin/series" className="text-sm font-semibold text-zinc-400 hover:text-white">
            Series library →
          </Link>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            type="button"
            variant={mode === "new" ? "primary" : "secondary"}
            disabled={running || Boolean(createdSeriesId) || hasCreatedEpisodes}
            onClick={() => setMode("new")}
          >
            New series
          </Button>
          <Button
            type="button"
            variant={mode === "existing" ? "primary" : "secondary"}
            disabled={running || Boolean(createdSeriesId) || hasCreatedEpisodes}
            onClick={() => setMode("existing")}
          >
            Existing series
          </Button>
        </div>
        {mode === "new" ? (
          <div className="mt-5 max-w-2xl">
            <Field label="Series title">
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className={inputClass}
                placeholder="Enter a series title"
              />
            </Field>
          </div>
        ) : (
          <div className="mt-5 max-w-2xl">
            <Field label="Existing series">
              <select
                value={selectedSeriesId}
                onChange={(event) => setSelectedSeriesId(event.target.value)}
                className={inputClass}
                disabled={running || Boolean(createdSeriesId) || hasCreatedEpisodes}
              >
                <option value="">Choose a series</option>
                {series.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title} {item.isPublished ? "· Published" : "· Draft"}
                  </option>
                ))}
              </select>
            </Field>
            {loadingNumbers && (
              <p className="mt-2 text-xs text-zinc-500">Loading existing episode numbers…</p>
            )}
          </div>
        )}

        <details className="mt-5 rounded-xl border border-white/10 bg-zinc-950/60 p-4">
          <summary className="cursor-pointer text-sm font-bold text-zinc-200">
            More options (defaults filled)
          </summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Free episodes">
              <input
                className={inputClass}
                type="number"
                step="1"
                min="0"
                value={freeEpisodeCount}
                onChange={(event) => {
                  const next = Math.max(0, Math.floor(Number(event.target.value)));
                  setFreeEpisodeCount(next);
                  setItems((current) =>
                    current.map((item) =>
                      item.isFreeEdited
                        ? item
                        : { ...item, isFree: item.number <= next },
                    ),
                  );
                }}
              />
            </Field>
            <Field label="Default coin price">
              <input
                className={inputClass}
                type="number"
                step="1"
                min="1"
                value={coinPrice}
                onChange={(event) =>
                  setCoinPrice(Math.max(1, Math.floor(Number(event.target.value))))
                }
              />
            </Field>
            <Field label="Poster image (optional)">
              <input
                className={inputClass}
                type="file"
                accept="image/*"
                onChange={(event) => setPosterFile(event.target.files?.[0] ?? null)}
              />
            </Field>
            <Field label="Genres (comma-separated)">
              <input
                className={inputClass}
                value={genresText}
                onChange={(event) => setGenresText(event.target.value)}
                placeholder="Drama, Romance"
              />
            </Field>
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={publishEach}
                onChange={(event) => setPublishEach(event.target.checked)}
              />
              Publish each episode when ready
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={publishSeriesFirst}
                onChange={(event) => setPublishSeriesFirst(event.target.checked)}
                disabled={mode === "existing" && selectedSeries?.isPublished}
              />
              Publish series when first episode is ready
              {mode === "existing" && selectedSeries?.isPublished && (
                <span className="text-xs text-zinc-500">(already published)</span>
              )}
            </label>
          </div>
          <p className="mt-3 text-xs text-zinc-500">
            Without a poster, the first processed episode thumbnail is used.
          </p>
        </details>
      </section>

      <section className="rounded-2xl border border-white/10 bg-zinc-900/80 p-5">
        <h2 className="text-lg font-bold">Video files</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Drop video files or choose multiple files or a folder. Non-video files are ignored.
        </p>
        <div
          className="mt-4 rounded-2xl border-2 border-dashed border-white/15 bg-zinc-950/60 p-6 text-center transition hover:border-rose-400/50"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            addFiles(event.dataTransfer.files);
          }}
        >
          <p className="font-semibold">Drop videos here</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button type="button" variant="secondary" onClick={() => videoPicker.current?.click()}>
              Choose videos
            </Button>
            <Button type="button" variant="secondary" onClick={() => folderPicker.current?.click()}>
              Choose folder
            </Button>
          </div>
          <input
            ref={videoPicker}
            className="hidden"
            type="file"
            accept="video/*"
            multiple
            onChange={(event) => {
              addFiles(event.target.files);
              event.target.value = "";
            }}
          />
          <input
            ref={(node) => {
              folderPicker.current = node;
              node?.setAttribute("webkitdirectory", "");
            }}
            className="hidden"
            type="file"
            accept="video/*"
            multiple
            onChange={(event) => {
              addFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </div>

        {items.length > 0 && (
          <div className="mt-5 overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-zinc-950 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-3">Episode #</th>
                  <th className="px-3 py-3">Title</th>
                  <th className="px-3 py-3">Free</th>
                  <th className="px-3 py-3">File size</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t border-white/10 align-top">
                    <td className="w-28 px-3 py-3">
                      <input
                        className={`${inputClass} w-24`}
                        type="number"
                        step="1"
                        min="1"
                        value={item.number}
                        disabled={running || Boolean(item.episodeId)}
                        onChange={(event) => updateNumber(item, Number(event.target.value))}
                      />
                    </td>
                    <td className="min-w-56 px-3 py-3">
                      <input
                        className={inputClass}
                        value={item.title}
                        disabled={running || Boolean(item.episodeId)}
                        onChange={(event) =>
                          updateItem(item.id, { title: event.target.value, titleEdited: true })
                        }
                      />
                      <p className="mt-1 truncate text-xs text-zinc-500">{item.file.name}</p>
                    </td>
                    <td className="px-3 py-3">
                      <input
                        aria-label={`Episode ${item.number} is free`}
                        type="checkbox"
                        checked={item.isFree}
                        disabled={running || Boolean(item.episodeId)}
                        onChange={(event) =>
                          updateItem(item.id, { isFree: event.target.checked, isFreeEdited: true })
                        }
                      />
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-zinc-400">
                      {formatBytes(item.file.size)}
                    </td>
                    <td className="px-3 py-3">
                      <StatusChip
                        tone={
                          item.status === "ready" && item.episode?.publishedAt && seriesIsPublished
                            ? "success"
                            : item.status === "failed"
                              ? "danger"
                              : item.status === "uploading" || item.status === "processing"
                                ? "warning"
                                : "neutral"
                        }
                      >
                        {statusLabel(item, seriesIsPublished)}
                      </StatusChip>
                      {item.error && <p className="mt-1 max-w-64 text-xs text-rose-300">{item.error}</p>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {item.status === "failed" && item.episodeId && (
                        <Button
                          type="button"
                          variant="secondary"
                          pending={retryingId === item.id}
                          onClick={() => void retryItem(item)}
                        >
                          Retry
                        </Button>
                      )}
                      {item.status === "queued" && !running && (
                        <button
                          type="button"
                          className="text-zinc-500 hover:text-white"
                          aria-label={`Remove ${item.file.name}`}
                          onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))}
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={() => void uploadAll()}
            pending={running}
            disabled={
              !items.length ||
              !hasQueued ||
              (mode === "new" && !title.trim() && !createdSeriesId) ||
              (mode === "existing" && !selectedSeriesId) ||
              loadingNumbers
            }
          >
            Upload all
          </Button>
          {isUploading && (
            <p className="text-xs text-zinc-400">
              Once every file shows Processing you can close this page; the server finishes and
              publishes automatically.
            </p>
          )}
        </div>
        {batchComplete && activeSeriesLink && (
          <div className="mt-5">
            <Link
              href={activeSeriesLink as Route}
              className="font-semibold text-rose-300 hover:text-rose-200"
            >
              Open the series editor →
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
