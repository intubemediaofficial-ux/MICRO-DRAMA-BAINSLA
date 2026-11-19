import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/microdrama";
  process.env.SESSION_SECRET ??= "test-session-secret-123456";
  process.env.STREAM_TOKEN_SECRET ??= "test-stream-secret-123456";
});

import { isProtectedEpisodeMedia } from "../src/server/media";
import { hlsKeyFor } from "../src/server/video-processor";
import { rewriteHlsManifest } from "../src/server/hls";

describe("media delivery", () => {
  it("keeps uploaded episode videos off the public media route", () => {
    expect(isProtectedEpisodeMedia("episodes/abc-clip.mp4")).toBe(true);
    expect(isProtectedEpisodeMedia("episodes/abc-original.mov")).toBe(true);
    expect(isProtectedEpisodeMedia("episodes/abc-original.mkv")).toBe(true);
    expect(isProtectedEpisodeMedia("/media/episodes/abc-clip-hls/v0/seg-000.ts")).toBe(true);
    expect(isProtectedEpisodeMedia("x/../episodes/abc-clip.mp4")).toBe(true);
    expect(isProtectedEpisodeMedia("./episodes//abc-clip.mp4")).toBe(true);
    expect(isProtectedEpisodeMedia("episodes/abc-thumbnail.jpg")).toBe(false);
    expect(isProtectedEpisodeMedia("episodes/abc-clip.mp4.jpg")).toBe(false);
    expect(isProtectedEpisodeMedia("episodes/subtitle.vtt")).toBe(true);
    expect(isProtectedEpisodeMedia("subtitles/abc-en.srt")).toBe(false);
    expect(isProtectedEpisodeMedia("admin/teaser/x.mp4")).toBe(false);
  });

  it("derives the HLS ladder location and signs nested playlists", () => {
    expect(hlsKeyFor("episodes/abc-clip.mp4", "v1")).toBe("episodes/abc-clip-hls-v1/master.m3u8");
    const master = rewriteHlsManifest(
      "#EXTM3U\nv0/index.m3u8",
      "tok",
      "episodes/x-hls/master.m3u8",
    );
    expect(master).toContain(
      `/api/stream/tok?path=${encodeURIComponent("episodes/x-hls/v0/index.m3u8")}`,
    );
    const variant = rewriteHlsManifest(
      "#EXTM3U\nseg-000.ts",
      "tok",
      "episodes/x-hls/v0/index.m3u8",
    );
    expect(variant).toContain(encodeURIComponent("episodes/x-hls/v0/seg-000.ts"));
  });
});
