import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/microdrama";
  process.env.SESSION_SECRET ??= "test-session-secret-123456";
  process.env.STREAM_TOKEN_SECRET ??= "test-stream-secret-123456";
  process.env.MEDIA_DIR ??= "./public/media";
  return {
    adminSession: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    enqueueEpisodeVideo: vi.fn(),
  };
});

vi.mock("@/server/admin", () => ({ adminSession: mocks.adminSession }));
vi.mock("@/server/db", () => ({
  prisma: {
    episode: {
      findUnique: mocks.findUnique,
      update: mocks.update,
    },
  },
}));
vi.mock("@/server/video-queue", () => ({
  enqueueEpisodeVideo: mocks.enqueueEpisodeVideo,
}));

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { POST as uploadEpisode } from "@/app/api/admin/episodes/[id]/upload/route";
import { env } from "@/server/config";
import {
  MAX_VIDEO_UPLOAD_BYTES,
  storage,
  UploadTooLargeError,
} from "@/server/storage";

const existingEpisode = {
  id: "episode-1",
  hlsPath: "",
  processingStatus: "READY",
  publishedAt: null,
  originalFilename: null,
  thumbnailSource: "LEGACY",
};
const priorMediaDir = env.MEDIA_DIR;
let mediaDir = "";

function rawRequest(
  headers: Record<string, string> = {},
  body: BodyInit = new Uint8Array([1, 2, 3]),
) {
  return new Request("http://localhost/api/admin/episodes/episode-1/upload?publish=1", {
    method: "POST",
    headers: {
      "content-type": "video/mp4",
      "x-filename": encodeURIComponent("EP 01.mp4"),
      ...headers,
    },
    body,
  });
}

describe("episode video upload route", () => {
  beforeAll(async () => {
    mediaDir = await fs.mkdtemp(path.join(os.tmpdir(), "micro-drama-video-upload-"));
    env.MEDIA_DIR = mediaDir;
  });

  afterAll(async () => {
    env.MEDIA_DIR = priorMediaDir;
    await fs.rm(mediaDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.adminSession.mockResolvedValue({ userId: "admin-1", role: "ADMIN" });
    mocks.findUnique.mockResolvedValue(existingEpisode);
    mocks.update.mockImplementation(
      async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({
        ...existingEpisode,
        ...data,
        id: where.id,
      }),
    );
  });

  it("streams a raw video body, queues processing, and returns 202", async () => {
    const response = await uploadEpisode(rawRequest(), {
      params: Promise.resolve({ id: existingEpisode.id }),
    });
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body.queued).toBe(true);
    expect(body.episode.processingStatus).toBe("PROCESSING");
    const sourceKey = body.episode.sourceKey as string;
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: existingEpisode.id },
        data: expect.objectContaining({
          sourceKey: expect.stringMatching(/^episodes\/episode-1-[a-z0-9]+-EP_01\.mp4$/),
          publishOnReady: true,
          processingStatus: "PROCESSING",
          processingError: null,
          originalFilename: "EP 01.mp4",
          publishedAt: null,
        }),
      }),
    );
    expect(mocks.enqueueEpisodeVideo).toHaveBeenCalledWith(existingEpisode.id);
    await expect(
      fs.readFile(path.join(mediaDir, sourceKey)),
    ).resolves.toEqual(Buffer.from([1, 2, 3]));
  });

  it("stores same-name re-uploads under distinct keys", async () => {
    const dateNow = vi
      .spyOn(Date, "now")
      .mockReturnValueOnce(1_770_000_000_000)
      .mockReturnValueOnce(1_770_000_000_001);
    try {
      for (let upload = 0; upload < 2; upload += 1) {
        const response = await uploadEpisode(rawRequest(), {
          params: Promise.resolve({ id: existingEpisode.id }),
        });
        expect(response.status).toBe(202);
      }
    } finally {
      dateNow.mockRestore();
    }

    const sourceKeys = mocks.update.mock.calls.map(([{ data }]) => data.sourceKey as string);
    expect(sourceKeys).toHaveLength(2);
    expect(sourceKeys[0]).not.toBe(sourceKeys[1]);
    expect(sourceKeys).toEqual([
      "episodes/episode-1-ml4kasqo-EP_01.mp4",
      "episodes/episode-1-ml4kasqp-EP_01.mp4",
    ]);
  });

  it("rejects an over-cap request without queueing it", async () => {
    const response = await uploadEpisode(
      rawRequest({ "content-length": String(MAX_VIDEO_UPLOAD_BYTES + 1) }),
      { params: Promise.resolve({ id: existingEpisode.id }) },
    );

    expect(response.status).toBe(413);
    expect(mocks.enqueueEpisodeVideo).not.toHaveBeenCalled();
  });

  it("maps a streaming over-cap error to 413", async () => {
    const putStream = vi
      .spyOn(storage, "putStream")
      .mockRejectedValue(new UploadTooLargeError());
    try {
      const response = await uploadEpisode(rawRequest({ "x-filename": "EP_01.mp4" }), {
        params: Promise.resolve({ id: existingEpisode.id }),
      });
      expect(response.status).toBe(413);
      expect(mocks.enqueueEpisodeVideo).not.toHaveBeenCalled();
    } finally {
      putStream.mockRestore();
    }
  });

  it("aborts an over-cap stream and removes the partial file", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.enqueue(new Uint8Array([4]));
        controller.close();
      },
    });

    await expect(storage.putStream("episodes/oversize.mp4", stream, 3)).rejects.toBeInstanceOf(
      UploadTooLargeError,
    );
    const files = await fs.readdir(path.join(mediaDir, "episodes"));
    expect(files).not.toContain("oversize.mp4");
    expect(files).not.toContain("oversize.mp4.part");
  });

  it("returns 403 for a non-admin", async () => {
    mocks.adminSession.mockRejectedValue(new Error("FORBIDDEN"));
    const response = await uploadEpisode(rawRequest(), {
      params: Promise.resolve({ id: existingEpisode.id }),
    });

    expect(response.status).toBe(403);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
});
