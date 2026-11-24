import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  episodeUpdateMany: vi.fn(),
  seriesUpdateMany: vi.fn(),
  process: vi.fn(),
  notify: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  prisma: {
    episode: {
      findUnique: mocks.findUnique,
      updateMany: mocks.episodeUpdateMany,
    },
    series: { updateMany: mocks.seriesUpdateMany },
  },
}));
vi.mock("@/server/episode-notifications", () => ({
  notifyNewPublicEpisode: mocks.notify,
}));
vi.mock("@/server/video-processor", () => ({
  FfmpegVideoProcessor: class {
    process(inputKey: string, thumbnailKey: string) {
      return mocks.process(inputKey, thumbnailKey);
    }
  },
  thumbnailPersistence: (source: string, thumbnailUrl: string) =>
    source === "CUSTOM"
      ? {}
      : { thumbnailUrl, thumbnailSource: "AUTO" },
}));

import { processEpisodeVideo } from "@/server/video-queue";

function episode(overrides: Record<string, unknown> = {}) {
  return {
    id: "episode-1",
    seriesId: "series-1",
    sourceKey: "episodes/source.mp4",
    originalFilename: "source.mp4",
    sku: null,
    thumbnailSource: "AUTO",
    hlsPath: "",
    processingStatus: "PROCESSING",
    processingError: null,
    publishOnReady: true,
    publishedAt: null,
    series: {
      id: "series-1",
      isPublished: true,
      posterUrl: "/poster.jpg",
      publishOnFirstReady: false,
    },
    ...overrides,
  };
}

describe("episode video queue processing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue(episode());
    mocks.episodeUpdateMany.mockResolvedValue({ count: 1 });
    mocks.seriesUpdateMany.mockResolvedValue({ count: 1 });
    mocks.process.mockResolvedValue({
      status: "READY",
      hlsPath: "episodes/source-hls/master.m3u8",
      thumbnailUrl: "/api/media/episodes/source.jpg",
      durationSec: 44,
    });
    mocks.notify.mockResolvedValue(undefined);
  });

  it("publishes a ready episode when publishOnReady is set", async () => {
    await processEpisodeVideo("episode-1");

    expect(mocks.episodeUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "episode-1", processingStatus: "PROCESSING" },
        data: expect.objectContaining({
          processingStatus: "READY",
          hlsPath: "episodes/source-hls/master.m3u8",
          publishedAt: expect.any(Date),
          publishOnReady: false,
        }),
      }),
    );
    expect(mocks.notify).toHaveBeenCalledWith("episode-1");
  });

  it("publishes a draft series on its first ready episode and uses its thumbnail as poster", async () => {
    mocks.findUnique.mockResolvedValue(
      episode({
        series: {
          id: "series-1",
          isPublished: false,
          posterUrl: "",
          publishOnFirstReady: true,
        },
      }),
    );

    await processEpisodeVideo("episode-1");

    expect(mocks.seriesUpdateMany).toHaveBeenNthCalledWith(1, {
      where: { id: "series-1", posterUrl: "" },
      data: { posterUrl: "/api/media/episodes/source.jpg" },
    });
    expect(mocks.seriesUpdateMany).toHaveBeenNthCalledWith(2, {
      where: { id: "series-1", publishOnFirstReady: true },
      data: { isPublished: true, publishOnFirstReady: false },
    });
    expect(mocks.notify).toHaveBeenCalledWith("episode-1");
  });

  it("keeps failed episodes unpublished and clears their publish request", async () => {
    mocks.process.mockResolvedValue({ status: "FAILED", error: "FFmpeg failed" });

    await processEpisodeVideo("episode-1");

    expect(mocks.episodeUpdateMany).toHaveBeenCalledWith({
      where: { id: "episode-1", processingStatus: "PROCESSING" },
      data: {
        processingStatus: "FAILED",
        processingError: "FFmpeg failed",
        publishedAt: null,
        publishOnReady: false,
      },
    });
    expect(mocks.seriesUpdateMany).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });
});
