import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/microdrama";
  process.env.SESSION_SECRET ??= "test-session-secret-123456";
  process.env.STREAM_TOKEN_SECRET ??= "test-stream-secret-123456";
  process.env.MEDIA_DIR ??= "./public/media";
  return {
    getSettings: vi.fn(),
    seriesFindUnique: vi.fn(),
    episodeFindMany: vi.fn(),
    storagePut: vi.fn(),
    storageUrl: vi.fn(),
    extractFrames: vi.fn(),
    adminSession: vi.fn(),
  };
});

vi.mock("@/server/settings", () => ({ getSettings: mocks.getSettings }));
vi.mock("@/server/db", () => ({
  prisma: {
    series: { findUnique: mocks.seriesFindUnique },
    episode: { findMany: mocks.episodeFindMany },
  },
}));
vi.mock("@/server/storage", () => ({
  storage: { put: mocks.storagePut, url: mocks.storageUrl },
}));
vi.mock("@/server/muse-frames", () => ({ extractFrames: mocks.extractFrames }));
vi.mock("@/server/admin", () => ({ adminSession: mocks.adminSession }));

import {
  generatePoster,
  museConfig,
  parseMuseSuggestion,
  selectMuseEpisodes,
  suggestSeriesDetails,
} from "@/server/muse";
import { POST as suggestRoute } from "@/app/api/admin/muse/series/[id]/suggest/route";
import { POST as museTestRoute } from "@/app/api/admin/settings/muse-test/route";

function suggestion(overrides: Record<string, unknown> = {}) {
  return {
    title: "A Secret Promise",
    synopsis: "Two strangers meet. Their lives change together.",
    genres: ["Romance", "Drama", "Mystery"],
    tropeTags: ["Secret identity", "Second chance", "Rivals"],
    seo: {
      title: "A Secret Promise | Intube Drama",
      description: "A romance filled with secrets and unexpected choices.",
      focusKeyword: "romantic micro drama",
      keywords: ["romance", "secrets", "micro drama"],
    },
    posterPrompt: "A cinematic portrait of two leads facing opposite directions",
    episodeTitles: [
      { number: 1, title: "The Unexpected Meeting" },
      { number: 2, title: "A Secret Revealed" },
    ],
    ...overrides,
  };
}

function museTextResponse(text: string) {
  return new Response(
    JSON.stringify({
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text }],
        },
      ],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSettings.mockResolvedValue({
    MUSE_API_KEY: "test-muse-key",
    MUSE_TEXT_MODEL: "muse-spark-1.3",
    MUSE_IMAGE_MODEL: "muse-image-1.0",
  });
  mocks.seriesFindUnique.mockResolvedValue({
    id: "series-1",
    title: "Existing title",
    synopsis: "Existing synopsis",
    episodes: [{ number: 1 }, { number: 2 }],
  });
  mocks.episodeFindMany.mockResolvedValue([
    {
      number: 1,
      title: "Episode one",
      hlsPath: "episodes/one/master.m3u8",
      originalFilename: null,
    },
    {
      number: 2,
      title: "Episode two",
      hlsPath: "episodes/two/master.m3u8",
      originalFilename: null,
    },
  ]);
  mocks.extractFrames.mockResolvedValue(["data:image/jpeg;base64,ZmFrZQ=="]);
  mocks.storagePut.mockResolvedValue(undefined);
  mocks.storageUrl.mockImplementation((key: string) => `/api/media/${key}`);
  mocks.adminSession.mockResolvedValue({ userId: "admin-1", role: "ADMIN" });
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Muse suggestions", () => {
  it("excludes demo footage and prefers uploaded episodes", () => {
    const selected = selectMuseEpisodes([
      { number: 1, title: "Demo one", hlsPath: "sample.mp4", originalFilename: null },
      { number: 2, title: "Demo two", hlsPath: "sample.mp4", originalFilename: null },
      { number: 3, title: "Uploaded", hlsPath: "episodes/uploaded.m3u8", originalFilename: "film.mp4" },
      { number: 4, title: "Manual", hlsPath: "episodes/manual.m3u8", originalFilename: null },
    ]);

    expect(selected.map((episode) => episode.title)).toEqual(["Uploaded"]);
  });

  it("falls back to real non-uploaded episodes if there are no uploads", () => {
    const selected = selectMuseEpisodes([
      { number: 1, title: "Demo", hlsPath: "/media/sample.mp4", originalFilename: null },
      { number: 3, title: "Third", hlsPath: "episodes/third.m3u8", originalFilename: null },
      { number: 2, title: "Second", hlsPath: "episodes/second.m3u8", originalFilename: null },
    ]);

    expect(selected.map((episode) => episode.title)).toEqual(["Second", "Third"]);
  });

  it("parses a fenced JSON reply", () => {
    const parsed = parseMuseSuggestion(
      `\`\`\`json\n${JSON.stringify(suggestion())}\n\`\`\``,
      [1, 2],
    );

    expect(parsed.title).toBe("A Secret Promise");
    expect(parsed.episodeTitles).toHaveLength(2);
  });

  it("clamps an overlong title", () => {
    const parsed = parseMuseSuggestion(
      JSON.stringify(suggestion({ title: "x".repeat(200) })),
      [1, 2],
    );

    expect(parsed.title).toHaveLength(160);
  });

  it("drops episode title suggestions for unknown numbers", () => {
    const parsed = parseMuseSuggestion(
      JSON.stringify(
        suggestion({
          episodeTitles: [
            { number: 1, title: "The Unexpected Meeting" },
            { number: 99, title: "Unknown episode" },
          ],
        }),
      ),
      [1, 2],
    );

    expect(parsed.episodeTitles).toEqual([{ number: 1, title: "The Unexpected Meeting" }]);
  });

  it("throws when the API key is not configured", async () => {
    mocks.getSettings.mockResolvedValue({ MUSE_API_KEY: " " });

    await expect(museConfig()).rejects.toThrow("MUSE_NOT_CONFIGURED");
  });

  it("maps a 401 response to MUSE_KEY_REJECTED", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 401 }));

    await expect(
      suggestSeriesDetails({ seriesId: "series-1", language: "hi" }),
    ).rejects.toThrow("MUSE_KEY_REJECTED");
  });

  it("sends the existing series context and extracts the suggestion response", async () => {
    vi.mocked(fetch).mockResolvedValue(museTextResponse(JSON.stringify(suggestion())));

    const result = await suggestSeriesDetails({
      seriesId: "series-1",
      language: "en",
      hint: "Keep the tone suspenseful",
    });

    expect(result.title).toBe("A Secret Promise");
    expect(mocks.extractFrames).toHaveBeenCalledTimes(2);
    expect(mocks.extractFrames).toHaveBeenNthCalledWith(
      1,
      "episodes/one/master.m3u8",
      4,
    );
    const [url, options] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(url).toBe("https://api.meta.ai/v1/responses");
    const requestBody = JSON.parse(String(options?.body));
    const content = requestBody.input[0].content as { type: string; text?: string }[];
    expect(content[0]?.text).toContain("Existing series title: Existing title");
    expect(content[0]?.text).toContain("Keep the tone suspenseful");
    expect(content.some((item) => item.type === "input_image")).toBe(true);
  });

  it("stores a base64 poster under admin/poster with the detected extension", async () => {
    const webp = Buffer.alloc(12);
    webp.write("RIFF", 0, "ascii");
    webp.write("WEBP", 8, "ascii");
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ data: [{ b64_json: webp.toString("base64") }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const poster = await generatePoster({
      prompt: "A dramatic encounter in the rain",
      seriesId: "series-1",
    });

    expect(poster.key).toMatch(/^admin\/poster\/muse-[\w-]+\.webp$/);
    expect(poster.url).toBe(`/api/media/${poster.key}`);
    expect(mocks.storagePut).toHaveBeenCalledWith(poster.key, webp);
  });

  it("rejects non-image poster bytes", async () => {
    const bytes = Buffer.from("not an image");
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ data: [{ b64_json: bytes.toString("base64") }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(generatePoster({ prompt: "A dramatic poster" })).rejects.toThrow(
      "MUSE_BAD_RESPONSE",
    );
    expect(mocks.storagePut).not.toHaveBeenCalled();
  });

  it("returns 401 from the suggest route without an admin session", async () => {
    mocks.adminSession.mockRejectedValue(new Error("UNAUTHENTICATED"));

    const response = await suggestRoute(
      new Request("http://localhost/api/admin/muse/series/series-1/suggest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ language: "hi" }),
      }),
      { params: Promise.resolve({ id: "series-1" }) },
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: { message: "UNAUTHENTICATED" } });
  });

  it("tests the saved key with GET /models without returning provider data", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: "private-model-detail" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const response = await museTestRoute();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ ok: true, message: "Muse API key is valid." });
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe("https://api.meta.ai/v1/models");
    expect(JSON.stringify(body)).not.toContain("private-model-detail");
  });
});
