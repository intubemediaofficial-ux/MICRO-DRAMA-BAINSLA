export type EpisodeUploadState = {
  id: string;
  number: number;
  title: string;
  processingStatus: "PROCESSING" | "READY" | "FAILED";
  processingError: string | null;
  publishedAt: string | null;
  hlsPath: string;
  thumbnailUrl: string;
  durationSec: number;
};

function naturalNameCompare(a: File, b: File) {
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
}

export function parseEpisodeNumber(filename: string) {
  const basename = filename.replaceAll("\\", "/").split("/").pop() ?? filename;
  const stem = basename.replace(/\.[^.]+$/, "");
  if (/^\d{1,4}$/.test(stem)) {
    const number = Number(stem);
    return number > 0 ? number : null;
  }
  const match = stem.match(/(?:^|[^a-z])(?:episode|ep|part|pt|e)[\s._-]*(\d{1,4})(?!\d)/i);
  if (!match) return null;
  const number = Number(match[1]);
  return number > 0 ? number : null;
}

export function planEpisodeNumbers(files: File[], usedNumbers: number[]) {
  const used = new Set(usedNumbers.filter((number) => Number.isInteger(number) && number > 0));
  let next = Math.max(0, ...used) + 1;
  return [...files].sort(naturalNameCompare).map((file) => {
    const parsed = parseEpisodeNumber(file.name);
    let number: number;
    if (parsed !== null && !used.has(parsed)) {
      number = parsed;
    } else {
      while (used.has(next)) next += 1;
      number = next;
    }
    used.add(number);
    if (number >= next) next = number + 1;
    return { file, number };
  });
}

export function isVideoFile(file: File) {
  return (
    file.type.startsWith("video/") ||
    /\.(?:mp4|mov|m4v|mkv|webm|avi|wmv|mpeg|mpg|3gp|ts)$/i.test(file.name)
  );
}

export async function uploadEpisodeVideo(
  episodeId: string,
  file: File,
  options: { publish: boolean; onProgress?: (percent: number) => void },
): Promise<EpisodeUploadState> {
  const query = options.publish ? "?publish=1" : "";
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/admin/episodes/${encodeURIComponent(episodeId)}/upload${query}`);
    xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
    xhr.setRequestHeader("x-filename", encodeURIComponent(file.name));
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable)
        options.onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      let body: { episode?: EpisodeUploadState; error?: { message?: string } } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        reject(new Error("Video upload returned an invalid response."));
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300 && body.episode) {
        resolve(body.episode);
        return;
      }
      reject(new Error(body.error?.message ?? "Video upload failed."));
    };
    xhr.onerror = () => reject(new Error("Video upload failed."));
    xhr.onabort = () => reject(new Error("Video upload was cancelled."));
    xhr.send(file);
  });
}

export async function getEpisodeUploadStates(seriesId: string) {
  const response = await fetch(`/api/admin/episodes?seriesId=${encodeURIComponent(seriesId)}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Could not refresh episode processing status.");
  }
  return (await response.json()) as EpisodeUploadState[];
}

export async function pollEpisodeProcessing(
  seriesId: string,
  episodeId: string,
  onUpdate?: (episode: EpisodeUploadState) => void,
) {
  while (true) {
    const episodes = await getEpisodeUploadStates(seriesId);
    const episode = episodes.find((item) => item.id === episodeId);
    if (!episode) throw new Error("Episode no longer exists.");
    onUpdate?.(episode);
    if (episode.processingStatus === "READY" || episode.processingStatus === "FAILED")
      return episode;
    await new Promise((resolve) => window.setTimeout(resolve, 3000));
  }
}

export async function pollEpisodeProcessingBatch(
  seriesId: string,
  episodeIds: string[],
  onUpdate?: (episode: EpisodeUploadState) => void,
) {
  const remaining = new Set(episodeIds);
  const latest = new Map<string, EpisodeUploadState>();
  while (remaining.size) {
    const episodes = await getEpisodeUploadStates(seriesId);
    const byId = new Map(episodes.map((episode) => [episode.id, episode]));
    for (const id of remaining) {
      const episode = byId.get(id);
      if (!episode) throw new Error("Episode no longer exists.");
      latest.set(id, episode);
      onUpdate?.(episode);
      if (episode.processingStatus === "READY" || episode.processingStatus === "FAILED")
        remaining.delete(id);
    }
    if (remaining.size) await new Promise((resolve) => window.setTimeout(resolve, 3000));
  }
  return episodeIds.map((id) => latest.get(id)!);
}
