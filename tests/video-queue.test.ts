import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  episodeUpdateMany: vi.fn(),
  seriesUpdateMany: vi.fn(),
  transaction: vi.fn(),
  process: vi.fn(),
  notify: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  prisma: {
    $transaction: mocks.transaction,
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

import { enqueueEpisodeVideo, processEpisodeVideo } from "@/server/video-queue";

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
    mocks.transaction.mockImplementation(
      async (
        callback: (tx: {
          episode: { updateMany: typeof mocks.episodeUpdateMany };
          series: { updateMany: typeof mocks.seriesUpdateMany };
        }) => Promise<unknown>,
      ) =>
        callback({
          episode: { updateMany: mocks.episodeUpdateMany },
          series: { updateMany: mocks.seriesUpdateMany },
        }),
    );
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
        where: {
          id: "episode-1",
          processingStatus: "PROCESSING",
          sourceKey: "episodes/source.mp4",
        },
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

  it("keeps an existing publication timestamp when replacing a video", async () => {
    const publishedAt = new Date("2025-02-03T04:05:06.000Z");
    mocks.findUnique.mockResolvedValue(
      episode({
        publishedAt,
        series: {
          id: "series-1",
          isPublished: false,
          posterUrl: "/poster.jpg",
          publishOnFirstReady: true,
        },
      }),
    );

    await processEpisodeVideo("episode-1");

    expect(mocks.episodeUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ publishedAt }),
      }),
    );
    expect(mocks.seriesUpdateMany).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("uses episode metadata saved while video processing is running", async () => {
    const publishedAt = new Date("2026-01-02T03:04:05.000Z");
    mocks.findUnique
      .mockResolvedValueOnce(episode({ sku: "old-sku" }))
      .mockResolvedValueOnce(
        episode({
          sku: "new-sku",
          thumbnailSource: "CUSTOM",
          publishedAt,
          publishOnReady: false,
        }),
      );

    await processEpisodeVideo("episode-1");

    expect(mocks.episodeUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "episode-1",
          processingStatus: "PROCESSING",
          sourceKey: "episodes/source.mp4",
        },
        data: expect.objectContaining({
          sku: "new-sku",
          publishedAt,
        }),
      }),
    );
    const data = mocks.episodeUpdateMany.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("thumbnailUrl");
    expect(data).not.toHaveProperty("thumbnailSource");
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("does not publish when a pending publish request has been cleared", async () => {
    mocks.findUnique.mockResolvedValue(episode({ publishOnReady: false }));

    await processEpisodeVideo("episode-1");

    expect(mocks.episodeUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ publishedAt: null, publishOnReady: false }),
      }),
    );
    expect(mocks.notify).not.toHaveBeenCalled();
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
      where: { id: "series-1", publishOnFirstReady: true },
      data: { isPublished: true, publishOnFirstReady: false },
    });
    expect(mocks.seriesUpdateMany).toHaveBeenNthCalledWith(2, {
      where: { id: "series-1", posterUrl: "" },
      data: { posterUrl: "/api/media/episodes/source.jpg" },
    });
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.transaction.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.seriesUpdateMany.mock.invocationCallOrder[0],
    );
    expect(mocks.seriesUpdateMany.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.seriesUpdateMany.mock.invocationCallOrder[1],
    );
    expect(mocks.notify).toHaveBeenCalledWith("episode-1");
  });

  it("keeps failed episodes unpublished and clears their publish request", async () => {
    mocks.process.mockResolvedValue({ status: "FAILED", error: "FFmpeg failed" });

    await processEpisodeVideo("episode-1");

    expect(mocks.episodeUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "episode-1",
        processingStatus: "PROCESSING",
        sourceKey: "episodes/source.mp4",
      },
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

  it("reprocesses a mid-run upload without writing the stale result", async () => {
    const oldSource = episode({
      sourceKey: "episodes/old.mp4",
      originalFilename: "old.mp4",
    });
    const newSource = episode({
      sourceKey: "episodes/new.mp4",
      originalFilename: "new.mp4",
    });
    mocks.findUnique
      .mockResolvedValueOnce(oldSource)
      .mockResolvedValueOnce(oldSource)
      .mockResolvedValueOnce(newSource)
      .mockResolvedValueOnce(newSource);
    let finishOldProcess!: (result: object) => void;
    const oldProcess = new Promise<object>((resolve) => {
      finishOldProcess = resolve;
    });
    mocks.process
      .mockReturnValueOnce(oldProcess)
      .mockResolvedValueOnce({
        status: "READY",
        hlsPath: "episodes/new-hls/master.m3u8",
        thumbnailUrl: "/api/media/episodes/new.jpg",
        durationSec: 50,
      });
    mocks.episodeUpdateMany.mockImplementation(
      async ({ where }: { where: { sourceKey: string } }) => ({
        count: where.sourceKey === "episodes/old.mp4" ? 0 : 1,
      }),
    );

    expect(enqueueEpisodeVideo("episode-1")).toBe(true);
    await vi.waitFor(() => expect(mocks.process).toHaveBeenCalledTimes(1));
    expect(enqueueEpisodeVideo("episode-1")).toBe(false);
    finishOldProcess({
      status: "READY",
      hlsPath: "episodes/old-hls/master.m3u8",
      thumbnailUrl: "/api/media/episodes/old.jpg",
      durationSec: 40,
    });

    await vi.waitFor(() => expect(mocks.notify).toHaveBeenCalledWith("episode-1"));

    expect(mocks.process.mock.calls.map(([key]) => key)).toEqual([
      "episodes/old.mp4",
      "episodes/new.mp4",
    ]);
    expect(mocks.episodeUpdateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          id: "episode-1",
          processingStatus: "PROCESSING",
          sourceKey: "episodes/old.mp4",
        },
      }),
    );
    expect(mocks.episodeUpdateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          id: "episode-1",
          processingStatus: "PROCESSING",
          sourceKey: "episodes/new.mp4",
        },
        data: expect.objectContaining({ hlsPath: "episodes/new-hls/master.m3u8" }),
      }),
    );
  });

  it("scopes thrown-job failure updates to the source key it started with", async () => {
    mocks.process.mockRejectedValue(new Error("FFmpeg failed"));

    enqueueEpisodeVideo("episode-1");
    await vi.waitFor(() =>
      expect(mocks.episodeUpdateMany).toHaveBeenCalledWith({
        where: {
          id: "episode-1",
          processingStatus: "PROCESSING",
          sourceKey: "episodes/source.mp4",
        },
        data: {
          processingStatus: "FAILED",
          processingError: "FFmpeg failed",
          publishOnReady: false,
          publishedAt: null,
        },
      }),
    );
  });
});
