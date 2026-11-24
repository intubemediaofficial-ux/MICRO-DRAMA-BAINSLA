import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const cookieState = vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/microdrama";
  process.env.SESSION_SECRET ??= "test-session-secret-123456";
  process.env.STREAM_TOKEN_SECRET ??= "test-stream-secret-123456";
  return { token: "" };
});
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (cookieState.token ? { value: cookieState.token } : undefined),
    set: (_name: string, value: string) => {
      cookieState.token = value;
    },
    delete: () => {
      cookieState.token = "";
    },
  }),
}));

import { hasPlayableVideo } from "../src/lib/publishing";
import { issueSession } from "../src/server/auth";
import { getHomeFeed } from "../src/server/home-curation";
import { getSeriesDetail } from "../src/server/series-detail";
import { prisma } from "../src/server/db";
import {
  GET as listAdminEpisodes,
  POST as createEpisodes,
} from "../src/app/api/admin/episodes/route";
import { PATCH as patchEpisode } from "../src/app/api/admin/episodes/[id]/route";
import { PATCH as bulkPatchEpisodes } from "../src/app/api/admin/episodes/bulk/route";
import {
  PATCH as patchSeries,
  POST as createSeries,
} from "../src/app/api/admin/series/route";
import { GET as playbackGet } from "../src/app/api/episodes/[id]/playback/route";

const suffix = crypto.randomUUID().slice(0, 8);
let adminId = "";
let seriesIds: string[] = [];

async function makeSeries(key: string, isPublished = false) {
  const series = await prisma.series.create({
    data: {
      slug: `publishing-${suffix}-${key}`,
      title: `Publishing ${key}`,
      synopsis: "Publishing test fixture",
      posterUrl: "/poster.jpg",
      teaserUrl: "",
      genres: [],
      tropeTags: [],
      castNames: [],
      freeEpisodeCount: 1,
      defaultCoinPrice: 10,
      isPublished,
    },
  });
  seriesIds.push(series.id);
  const season = await prisma.season.create({
    data: { seriesId: series.id, number: 1, title: "Season 1" },
  });
  return { series, season };
}

async function makeEpisode(
  seriesId: string,
  seasonId: string,
  number: number,
  data: {
    hlsPath?: string;
    publishedAt?: Date | null;
    processingStatus?: "READY" | "PROCESSING" | "FAILED";
  } = {},
) {
  return prisma.episode.create({
    data: {
      seriesId,
      seasonId,
      number,
      title: `Episode ${number}`,
      durationSec: 30,
      hlsPath: data.hlsPath ?? "",
      thumbnailUrl: "/poster.jpg",
      coinPrice: 10,
      isFree: false,
      publishedAt: data.publishedAt ?? null,
      ...(data.processingStatus ? { processingStatus: data.processingStatus } : {}),
    },
  });
}

function jsonRequest(body: unknown, method = "POST") {
  return new Request("http://localhost", {
    method,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("video-required publishing", () => {
  let editableSeries: Awaited<ReturnType<typeof makeSeries>>;
  let noVideoEpisodeId = "";

  beforeAll(async () => {
    const admin = await prisma.user.create({
      data: {
        email: `publishing-admin-${suffix}@test.local`,
        role: "ADMIN",
        referralCode: `PA${suffix}`,
      },
    });
    adminId = admin.id;
    editableSeries = await makeSeries("editable");
    await issueSession({ userId: adminId, role: "ADMIN" });
  });

  afterAll(async () => {
    cookieState.token = "";
    await prisma.series.deleteMany({ where: { id: { in: seriesIds } } });
    await prisma.user.deleteMany({ where: { id: adminId } });
  });

  it("defaults missing episode fields from the series and series-wide maximum", async () => {
    const defaultsSeries = await makeSeries("episode-defaults");
    await prisma.series.update({
      where: { id: defaultsSeries.series.id },
      data: { freeEpisodeCount: 6 },
    });
    await makeEpisode(defaultsSeries.series.id, defaultsSeries.season.id, 2);
    await makeEpisode(defaultsSeries.series.id, defaultsSeries.season.id, 4);

    const response = await createEpisodes(
      jsonRequest({
        seriesId: defaultsSeries.series.id,
        seasonId: defaultsSeries.season.id,
        episodes: [{ number: 5, title: "Manual number" }, {}, {}],
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.episodes).toMatchObject([
      { number: 5, title: "Manual number", coinPrice: 10, isFree: true, publishedAt: null },
      { number: 6, title: "Episode 6", coinPrice: 10, isFree: true, publishedAt: null },
      { number: 7, title: "Episode 7", coinPrice: 10, isFree: false, publishedAt: null },
    ]);
  });

  it("returns episode processing fields for admin polling", async () => {
    const pollingSeries = await makeSeries("episode-polling");
    const episode = await makeEpisode(
      pollingSeries.series.id,
      pollingSeries.season.id,
      1,
      { processingStatus: "PROCESSING" },
    );
    const response = await listAdminEpisodes(
      new Request(`http://localhost/api/admin/episodes?seriesId=${pollingSeries.series.id}`),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      id: episode.id,
      number: 1,
      title: "Episode 1",
      processingStatus: "PROCESSING",
      processingError: null,
      hlsPath: "",
      thumbnailUrl: "/poster.jpg",
      durationSec: 30,
    });
    expect(body[0].publishedAt).toBeNull();
  });

  it("requires an admin session for episode status polling", async () => {
    const sessionToken = cookieState.token;
    cookieState.token = "";
    try {
      const response = await listAdminEpisodes(
        new Request("http://localhost/api/admin/episodes?seriesId=series-1"),
      );
      expect(response.status).toBe(401);
    } finally {
      cookieState.token = sessionToken;
    }
  });

  it("creates title-only series with defaults, Hindi slug fallback, and unique suffixes", async () => {
    const titleOnlyResponse = await createSeries(
      jsonRequest({ title: `Title Only ${suffix}` }),
    );
    expect(titleOnlyResponse.status).toBe(201);
    const titleOnly = await titleOnlyResponse.json();
    seriesIds.push(titleOnly.id);
    expect(titleOnly).toMatchObject({
      synopsis: "",
      posterUrl: "",
      teaserUrl: "",
      genres: [],
      tropeTags: [],
      castNames: [],
      freeEpisodeCount: 5,
      defaultCoinPrice: 10,
      status: "ONGOING",
      isPublished: false,
      publishOnFirstReady: false,
    });
    expect(titleOnly.slug).toBe(`title-only-${suffix.toLowerCase()}`);

    const hindiResponse = await createSeries(jsonRequest({ title: "कहानी", slug: "" }));
    expect(hindiResponse.status).toBe(201);
    const hindi = await hindiResponse.json();
    seriesIds.push(hindi.id);
    expect(hindi.slug).toMatch(/^series-[a-z0-9]{6}$/);

    const slug = `unique-${suffix.toLowerCase()}`;
    const firstResponse = await createSeries(jsonRequest({ title: "Unique title", slug }));
    const secondResponse = await createSeries(jsonRequest({ title: "Unique title", slug }));
    const [first, second] = await Promise.all([firstResponse.json(), secondResponse.json()]);
    seriesIds.push(first.id, second.id);
    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(201);
    expect(first.slug).toBe(slug);
    expect(second.slug).toBe(`${slug}-2`);
  });

  it("does not publish an episode created without a video", async () => {
    const response = await createEpisodes(
      jsonRequest({
        seriesId: editableSeries.series.id,
        seasonId: editableSeries.season.id,
        episodes: [
          {
            number: 1,
            title: "Missing video",
            coinPrice: 10,
            isFree: false,
            publishedAt: new Date().toISOString(),
          },
        ],
      }),
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    noVideoEpisodeId = body.episodes[0].id;
    expect(body.draftedWithoutVideo).toBe(1);
    expect(body.episodes[0].publishedAt).toBeNull();
    expect(
      (await prisma.episode.findUniqueOrThrow({ where: { id: noVideoEpisodeId } })).publishedAt,
    ).toBeNull();
  });

  it("rejects publishing without a playable video and allows a READY video", async () => {
    const rejected = await patchEpisode(
      jsonRequest({ publishedAt: new Date().toISOString() }, "PATCH"),
      { params: Promise.resolve({ id: noVideoEpisodeId }) },
    );
    expect(rejected.status).toBe(400);
    expect(await rejected.json()).toEqual({
      error: { message: "Upload a video file before publishing this episode." },
    });

    const playable = await makeEpisode(editableSeries.series.id, editableSeries.season.id, 2, {
      hlsPath: "episodes/publishing-ready.m3u8",
      processingStatus: "READY",
    });
    const published = await patchEpisode(
      jsonRequest({ publishedAt: new Date().toISOString() }, "PATCH"),
      { params: Promise.resolve({ id: playable.id }) },
    );
    expect(published.status).toBe(200);
    expect((await published.json()).publishedAt).not.toBeNull();
  });

  it("publishes only playable episodes in a bulk publish", async () => {
    const missingVideo = await makeEpisode(editableSeries.series.id, editableSeries.season.id, 3);
    const playable = await makeEpisode(editableSeries.series.id, editableSeries.season.id, 4, {
      hlsPath: "episodes/publishing-bulk.m3u8",
    });
    const response = await bulkPatchEpisodes(
      jsonRequest(
        {
          episodeIds: [missingVideo.id, playable.id],
          publishedAt: new Date().toISOString(),
          isFree: true,
        },
        "PATCH",
      ),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.skippedWithoutVideo).toEqual([missingVideo.id]);
    const updated = await prisma.episode.findMany({
      where: { id: { in: [missingVideo.id, playable.id] } },
    });
    expect(updated.find((episode) => episode.id === missingVideo.id)?.publishedAt).toBeNull();
    expect(updated.find((episode) => episode.id === playable.id)?.publishedAt).not.toBeNull();
    expect(updated.every((episode) => episode.isFree)).toBe(true);
  });

  it("requires a public episode before publishing a series and creates new series as drafts", async () => {
    const empty = await makeSeries("empty");
    const rejected = await patchSeries(
      jsonRequest({ id: empty.series.id, data: { isPublished: true } }, "PATCH"),
    );
    expect(rejected.status).toBe(400);
    expect(await rejected.json()).toEqual({
      error: {
        message: "Publish at least one episode with a video file before publishing the series.",
      },
    });

    const alreadyPublished = await makeSeries("already-published", true);
    const metadataSave = await patchSeries(
      jsonRequest(
        { id: alreadyPublished.series.id, data: { title: "x", isPublished: true } },
        "PATCH",
      ),
    );
    expect(metadataSave.status).toBe(200);

    const created = await createSeries(
      jsonRequest({
        slug: `publishing-${suffix}-new`,
        title: "New draft series",
        synopsis: "",
        posterUrl: "",
        teaserUrl: "",
        genres: [],
        tropeTags: [],
        castNames: [],
        freeEpisodeCount: 0,
        defaultCoinPrice: 10,
        isPublished: true,
      }),
    );
    expect(created.status).toBe(201);
    const body = await created.json();
    expect(body.isPublished).toBe(false);
    seriesIds.push(body.id);
  });

  it("serves only published episodes with playable videos on public reads", async () => {
    const visible = await makeSeries("visible", true);
    const publicEpisode = await makeEpisode(
      visible.series.id,
      visible.season.id,
      1,
      { hlsPath: "episodes/public.m3u8", publishedAt: new Date() },
    );
    const draftEpisode = await makeEpisode(visible.series.id, visible.season.id, 2, {
      hlsPath: "episodes/draft.m3u8",
    });
    await makeEpisode(visible.series.id, visible.season.id, 3, {
      hlsPath: "sample.mp4",
      publishedAt: new Date(),
    });
    await makeEpisode(visible.series.id, visible.season.id, 4, {
      hlsPath: "episodes/failed.mp4",
      publishedAt: new Date(),
      processingStatus: "FAILED",
    });

    const detail = await getSeriesDetail(visible.series.slug, null);
    expect(detail?.series.episodes.map((episode) => episode.id)).toEqual([publicEpisode.id]);
    expect(detail?.seasonGroups[0].episodes.map((episode) => episode.id)).toEqual([
      publicEpisode.id,
    ]);

    const unpublished = await makeSeries("unpublished");
    await makeEpisode(unpublished.series.id, unpublished.season.id, 1, {
      hlsPath: "episodes/hidden-series.m3u8",
      publishedAt: new Date(),
    });
    expect(await getSeriesDetail(unpublished.series.slug, null)).toBeNull();

    const emptyPublished = await makeSeries("empty-published", true);
    await makeEpisode(emptyPublished.series.id, emptyPublished.season.id, 1, {
      hlsPath: "episodes/draft-only.m3u8",
    });
    const feed = await getHomeFeed();
    const feedSeries = [...feed.heroItems, ...feed.groups.flatMap((group) => group.items)];
    expect(feedSeries.some((series) => series.id === emptyPublished.series.id)).toBe(false);

    cookieState.token = "";
    const playback = await playbackGet(
      new Request("http://localhost"),
      { params: Promise.resolve({ id: draftEpisode.id }) },
    );
    expect(playback.status).toBe(404);
  });

  it("recognizes empty, placeholder, failed, and playable video paths", () => {
    expect(hasPlayableVideo({ hlsPath: "" })).toBe(false);
    expect(hasPlayableVideo({ hlsPath: "sample.mp4" })).toBe(false);
    expect(hasPlayableVideo({ hlsPath: "episodes/video.m3u8", processingStatus: "FAILED" })).toBe(
      false,
    );
    expect(hasPlayableVideo({ hlsPath: " episodes/video.m3u8 " })).toBe(true);
  });
});
