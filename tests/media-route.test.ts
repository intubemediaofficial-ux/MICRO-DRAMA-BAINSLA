import { describe, expect, it, vi } from "vitest";
vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/microdrama";
  process.env.SESSION_SECRET ??= "test-session-secret-123456";
  process.env.STREAM_TOKEN_SECRET ??= "test-stream-secret-123456";
  process.env.MEDIA_DIR ??= "./public/media";
});

import { rewriteHlsManifest } from "../src/server/hls";
import { serveMediaFile } from "../src/server/media";

describe("media delivery", () => {
  it("serves media ranges with accurate content metadata", async () => {
    const response = await serveMediaFile(
      new Request("http://localhost/api/media/sample.mp4", {
        headers: { range: "bytes=0-9" },
      }),
      "sample.mp4",
    );
    expect(response.status).toBe(206);
    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect(response.headers.get("content-range")).toMatch(/^bytes 0-9\//);
    expect((await response.arrayBuffer()).byteLength).toBe(10);
  });

  it("rewrites relative HLS segments to token-preserving URLs", () => {
    const manifest = "#EXTM3U\n#EXTINF:6,\nsegment-000.ts\n#EXT-X-ENDLIST";
    const rewritten = rewriteHlsManifest(manifest, "token", "demo/room-hls/index.m3u8");
    expect(rewritten).toContain("/api/stream/token?path=demo%2Froom-hls%2Fsegment-000.ts");
  });
});
