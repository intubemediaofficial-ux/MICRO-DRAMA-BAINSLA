import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";

const cookieState = vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/microdrama";
  process.env.SESSION_SECRET ??= "test-session-secret-123456";
  process.env.STREAM_TOKEN_SECRET ??= "test-stream-secret-123456";
  process.env.OTP_DEV_CODE ??= "123456";
  return { token: "" };
});
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (cookieState.token ? { value: cookieState.token } : undefined),
    set: (_name: string, value: string) => {
      cookieState.token = value;
    },
  }),
}));

import { issueSession, findOrCreateUser } from "../src/server/auth";
import { credit } from "../src/server/coins";
import { prisma } from "../src/server/db";
import { POST as unlockPost } from "../src/app/api/unlocks/route";
import { GET as playbackGet } from "../src/app/api/episodes/[id]/playback/route";
import { POST as adTokenPost } from "../src/app/api/ads/reward-token/route";
import { POST as pushTokenPost } from "../src/app/api/mobile/push-token/route";
import { POST as progressPost } from "../src/app/api/progress/route";
import { invalidateSettingsCache, setSettings } from "../src/server/settings";

const suffix = crypto.randomUUID();
let userId = "";
let episodeId = "";
let savedAdSettings: Awaited<ReturnType<typeof prisma.appSetting.findMany>> = [];

describe("protected playback and reward flows", () => {
  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { email: `routes-${suffix}@test.local`, referralCode: `RT${suffix.slice(0, 8)}` },
    });
    userId = user.id;
    savedAdSettings = await prisma.appSetting.findMany({
      where: { key: { in: ["ADS_ENABLED", "ADMOB_REWARDED_UNIT_ID"] } },
    });
    await setSettings(
      { ADS_ENABLED: true, ADMOB_REWARDED_UNIT_ID: "test-rewarded-unit" },
      userId,
    );
    await credit(userId, 20, "ADMIN_ADJUST", { type: "test", id: userId });
    const series = await prisma.series.create({
      data: {
        slug: `routes-${suffix}`,
        title: "Routes",
        synopsis: "Routes",
        posterUrl: "",
        teaserUrl: "",
        genres: [],
        tropeTags: [],
        castNames: [],
        freeEpisodeCount: 0,
        defaultCoinPrice: 10,
        isPublished: true,
      },
    });
    const episode = await prisma.episode.create({
      data: {
        seriesId: series.id,
        number: 1,
        title: "Locked",
        durationSec: 10,
        hlsPath: "episodes/routes-locked.m3u8",
        thumbnailUrl: "",
        coinPrice: 10,
        publishedAt: new Date(),
      },
    });
    episodeId = episode.id;
    await issueSession({ userId, role: "USER" });
  });
  afterAll(async () => {
    await prisma.appSetting.deleteMany({
      where: { key: { in: ["ADS_ENABLED", "ADMOB_REWARDED_UNIT_ID"] } },
    });
    if (savedAdSettings.length) await prisma.appSetting.createMany({ data: savedAdSettings });
    invalidateSettingsCache();
    await prisma.user.delete({ where: { id: userId } });
    await prisma.series.deleteMany({ where: { slug: `routes-${suffix}` } });
  });

  it("returns 403 while locked and 200 with a playback token after unlock", async () => {
    const locked = await playbackGet(new Request("http://localhost"), {
      params: Promise.resolve({ id: episodeId }),
    });
    expect(locked.status).toBe(403);
    const unlock = await unlockPost(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ episodeId, source: "coin" }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(unlock.status).toBe(200);
    const playback = await playbackGet(new Request("http://localhost"), {
      params: Promise.resolve({ id: episodeId }),
    });
    expect(playback.status).toBe(200);
    expect((await playback.json()).playbackUrl).toContain("/api/stream/");
  });

  it("rejects an ad reward token on second use", async () => {
    const tokenResponse = await adTokenPost(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ episodeId }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(tokenResponse.status).toBe(200);
    const token = (await tokenResponse.json()).token as string;
    const [, , nonce] = Buffer.from(
      token.split(".")[0],
      "base64url",
    ).toString().split(".");
    await prisma.adRewardNonce.update({
      where: { nonce },
      data: { verifiedAt: new Date() },
    });
    const first = await unlockPost(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ episodeId, source: "ad", adToken: token }),
        headers: { "content-type": "application/json" },
      }),
    );
    const second = await unlockPost(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ episodeId, source: "ad", adToken: token }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(first.status).toBe(200);
    expect(second.status).toBe(403);
  });

  it("enforces the daily ad limit before consuming a verified token", async () => {
    const episode = await prisma.episode.findUniqueOrThrow({
      where: { id: episodeId },
      select: { seriesId: true },
    });
    const current = await prisma.episodeUnlock.count({
      where: { userId, source: "AD", createdAt: { gte: new Date(new Date().setUTCHours(0, 0, 0, 0)) } },
    });
    const extra = await Promise.all(
      Array.from({ length: 10 - current }, (_, index) =>
        prisma.episode.create({
          data: {
            seriesId: episode.seriesId,
            number: 100 + index,
            title: `Limit ${index}`,
            durationSec: 10,
            hlsPath: `episodes/limit-${index}.m3u8`,
            thumbnailUrl: "",
            coinPrice: 10,
            publishedAt: new Date(),
          },
        }),
      ),
    );
    await prisma.episodeUnlock.createMany({
      data: extra.map((item) => ({ userId, episodeId: item.id, source: "AD" })),
    });
    const candidate = await prisma.episode.create({
      data: {
        seriesId: episode.seriesId,
        number: 200,
        title: "Over limit",
        durationSec: 10,
        hlsPath: "episodes/over-limit.m3u8",
        thumbnailUrl: "",
        coinPrice: 10,
        publishedAt: new Date(),
      },
    });
    const tokenResponse = await adTokenPost(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ episodeId: candidate.id }),
        headers: { "content-type": "application/json" },
      }),
    );
    const token = (await tokenResponse.json()).token as string;
    const nonce = Buffer.from(token.split(".")[0], "base64url").toString().split(".")[2];
    await prisma.adRewardNonce.update({ where: { nonce }, data: { verifiedAt: new Date() } });
    const response = await unlockPost(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ episodeId: candidate.id, source: "ad", adToken: token }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(response.status).toBe(429);
    expect((await prisma.adRewardNonce.findUniqueOrThrow({ where: { nonce } })).usedAt).toBeNull();
    await prisma.adRewardNonce.delete({ where: { nonce } });
    await prisma.episodeUnlock.deleteMany({ where: { episodeId: { in: extra.map((item) => item.id) } } });
    await prisma.episode.deleteMany({ where: { id: { in: [...extra.map((item) => item.id), candidate.id] } } });
  });

  it("unlinks a device token when it is re-registered anonymously", async () => {
    const token = `push-token-${crypto.randomUUID()}`;
    const authenticated = await pushTokenPost(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ token }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(authenticated.status).toBe(200);
    expect((await prisma.deviceToken.findUniqueOrThrow({ where: { token } })).userId).toBe(userId);
    cookieState.token = "";
    const anonymous = await pushTokenPost(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ token }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(anonymous.status).toBe(200);
    expect((await prisma.deviceToken.findUniqueOrThrow({ where: { token } })).userId).toBeNull();
    await prisma.deviceToken.delete({ where: { token } });
  });

  it("does not downgrade completed progress on a later partial save", async () => {
    await prisma.watchProgress.upsert({
      where: { userId_episodeId: { userId, episodeId } },
      create: { userId, episodeId, positionSec: 10, completed: true },
      update: { positionSec: 10, completed: true },
    });
    const response = await progressPost(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ episodeId, positionSec: 3, completed: false }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(response.status).toBe(200);
    expect((await prisma.watchProgress.findUniqueOrThrow({
      where: { userId_episodeId: { userId, episodeId } },
    })).completed).toBe(true);
  });
});

describe("signup referral and check-in continuation", () => {
  it("does not grant a second referral reward on existing-user login", async () => {
    const referrer = await prisma.user.create({
      data: { email: `referrer-${suffix}@test.local`, referralCode: `RF${suffix.slice(0, 8)}` },
    });
    const identifier = `referred-${suffix}@test.local`;
    const created = await findOrCreateUser(identifier, referrer.referralCode);
    const existing = await findOrCreateUser(identifier, referrer.referralCode);
    expect(existing.id).toBe(created.id);
    expect(
      await prisma.coinTransaction.count({
        where: { userId: referrer.id, type: "REFERRAL_BONUS", refId: created.id },
      }),
    ).toBe(1);
    await prisma.user.deleteMany({
      where: { email: { in: [referrer.email!, identifier] } },
    });
  });

  it("continues a streak from yesterday", async () => {
    const user = await prisma.user.create({
      data: { email: `streak-${suffix}@test.local`, referralCode: `ST${suffix.slice(0, 8)}` },
    });
    const now = new Date();
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
    await prisma.dailyCheckin.create({ data: { userId: user.id, day, streak: 1 } });
    const { dailyCheckin } = await import("../src/server/coins");
    const current = await dailyCheckin(user.id);
    expect(current.streak).toBe(2);
    await prisma.user.delete({ where: { id: user.id } });
  });
});
