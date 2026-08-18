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

const suffix = crypto.randomUUID();
let userId = "";
let episodeId = "";

describe("protected playback and reward flows", () => {
  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { email: `routes-${suffix}@test.local`, referralCode: `RT${suffix.slice(0, 8)}` },
    });
    userId = user.id;
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
      },
    });
    const episode = await prisma.episode.create({
      data: {
        seriesId: series.id,
        number: 1,
        title: "Locked",
        durationSec: 10,
        hlsPath: "sample.mp4",
        thumbnailUrl: "",
        coinPrice: 10,
      },
    });
    episodeId = episode.id;
    await issueSession({ userId, role: "USER" });
  });
  afterAll(async () => {
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
});

describe("signup referral and check-in continuation", () => {
  it("rejects applying a referral code twice", async () => {
    const referrer = await prisma.user.create({
      data: { email: `referrer-${suffix}@test.local`, referralCode: `RF${suffix.slice(0, 8)}` },
    });
    const identifier = `referred-${suffix}@test.local`;
    await findOrCreateUser(identifier, referrer.referralCode);
    await expect(findOrCreateUser(identifier, referrer.referralCode)).rejects.toThrow(
      "REFERRAL_ALREADY_CLAIMED",
    );
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
