export const PLACEHOLDER_VIDEO_PATHS = ["", "sample.mp4"];

export function hasPlayableVideo(e: {
  hlsPath: string | null | undefined;
  processingStatus?: string | null;
}) {
  const path = e.hlsPath?.trim() ?? "";
  return (e.processingStatus ?? "READY") === "READY" && !PLACEHOLDER_VIDEO_PATHS.includes(path);
}
