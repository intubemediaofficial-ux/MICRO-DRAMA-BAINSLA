import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/server/db";
import { credit, dailyCheckin, InsufficientCoins, unlockEpisode } from "../src/server/coins";

const suffix = crypto.randomUUID();
let userId = "";
let episodeId = "";
let freeEpisodeId = "";

describe("coin economy", () => {
  beforeAll(async () => {
    const user = await prisma.user.create({ data: { email: `coin-${suffix}@test.local`, referralCode: `COIN${suffix.slice(0, 8)}` } });
    userId = user.id;
    await credit(userId, 20, "ADMIN_ADJUST", { type: "test", id: userId });
    const series = await prisma.series.create({ data: { slug: `coin-${suffix}`, title: "Coin Test", synopsis: "Test", posterUrl: "", teaserUrl: "", genres: [], tropeTags: [], castNames: [], freeEpisodeCount: 1, defaultCoinPrice: 10 } });
    const episodes = await Promise.all([
      prisma.episode.create({ data: { seriesId: series.id, number: 1, title: "Free", durationSec: 1, hlsPath: "sample.mp4", thumbnailUrl: "", isFree: true, coinPrice: 10 } }),
      prisma.episode.create({ data: { seriesId: series.id, number: 2, title: "Paid", durationSec: 1, hlsPath: "sample.mp4", thumbnailUrl: "", isFree: false, coinPrice: 10 } })
    ]);
    freeEpisodeId = episodes[0].id; episodeId = episodes[1].id;
  });
  afterAll(async () => { await prisma.user.delete({ where: { id: userId } }); await prisma.series.deleteMany({ where: { slug: `coin-${suffix}` } }); await prisma.$disconnect(); });
  it("rejects insufficient debit and leaves the ledger invariant intact", async () => {
    await expect(import("../src/server/coins").then(({ debit }) => debit(userId, 21, "EPISODE_UNLOCK"))).rejects.toBeInstanceOf(InsufficientCoins);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const sum = await prisma.coinTransaction.aggregate({ where: { userId }, _sum: { delta: true } });
    expect(sum._sum.delta ?? 0).toBe(user.coinBalance);
  });
  it("does not charge a free episode", async () => {
    await unlockEpisode(userId, freeEpisodeId);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.coinBalance).toBe(20);
  });
  it("charges concurrent unlocks once", async () => {
    await Promise.all([unlockEpisode(userId, episodeId), unlockEpisode(userId, episodeId)]);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const unlocks = await prisma.episodeUnlock.count({ where: { userId, episodeId } });
    expect(unlocks).toBe(1); expect(user.coinBalance).toBe(10);
  });
  it("makes daily check-in idempotent", async () => {
    const first = await dailyCheckin(userId); const second = await dailyCheckin(userId);
    expect(first.id).toBe(second.id); expect(first.streak).toBe(1);
  });
});
