import { describe, expect, it, vi } from "vitest";
vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/microdrama";
  process.env.SESSION_SECRET ??= "test-session-secret-123456";
  process.env.STREAM_TOKEN_SECRET ??= "test-stream-secret-123456";
  process.env.MEDIA_DIR ??= "./public/media";
});
import { isPlaceholderVideo } from "../src/server/demo-media";
import { isPlaceholderThumbnail } from "../src/server/media";
import {
  parseDuration,
  selectThumbnailTimestamp,
  thumbnailPersistence,
  shouldReplaceThumbnail,
} from "../src/server/video-processor";
import { selectPlaybackMode } from "../src/lib/playback";

describe("media processing helpers", () => {
  it("chooses a frame in the requested window and clamps short clips", () => {
    expect(selectThumbnailTimestamp(120)).toBe(15);
    expect(selectThumbnailTimestamp(10)).toBe(10);
    expect(selectThumbnailTimestamp(6)).toBe(3);
    expect(selectThumbnailTimestamp(1)).toBe(0.5);
  });

  it("parses real media duration and rejects unusable probe output", () => {
    expect(parseDuration("31.4")).toBe(31);
    expect(parseDuration("N/A")).toBeNull();
    expect(parseDuration("0")).toBeNull();
  });

  it("preserves operator thumbnails over generated frames", () => {
    expect(shouldReplaceThumbnail("CUSTOM")).toBe(false);
    expect(shouldReplaceThumbnail("AUTO")).toBe(true);
    expect(shouldReplaceThumbnail(undefined)).toBe(true);
  });

  it("persists generated thumbnails only when the current one is not custom", () => {
    expect(thumbnailPersistence("CUSTOM", "/media/generated.jpg")).toEqual({});
    expect(thumbnailPersistence("AUTO", "/media/generated.jpg")).toEqual({
      thumbnailUrl: "/media/generated.jpg",
      thumbnailSource: "AUTO",
    });
  });

  it("recognizes only placeholders for non-destructive replacement", () => {
    expect(isPlaceholderVideo("sample.mp4")).toBe(true);
    expect(isPlaceholderVideo("/media/sample.mp4")).toBe(true);
    expect(isPlaceholderVideo("demo/operator.mp4")).toBe(false);
    expect(isPlaceholderThumbnail("/media/thumb-1.jpg")).toBe(true);
    expect(isPlaceholderThumbnail("/media/demo/operator.jpg")).toBe(false);
  });

  it("selects hls.js, native HLS, or MP4 without weakening fallback rules", () => {
    expect(selectPlaybackMode(true, true, false)).toBe("hls.js");
    expect(selectPlaybackMode(true, false, true)).toBe("native-hls");
    expect(selectPlaybackMode(false, false, false)).toBe("mp4");
    expect(selectPlaybackMode(true, false, false)).toBe("unsupported");
  });
});
