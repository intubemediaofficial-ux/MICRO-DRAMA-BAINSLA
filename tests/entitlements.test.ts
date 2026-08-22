import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/microdrama";

import { prisma } from "../src/server/db";
import {
  resolveEpisodeEntitlement,
  resolveSeriesEpisodeEntitlements,
} from "../src/server/entitlements";

const suffix = crypto.randomUUID();
let userId = "";
let seriesId = "";
let episodeIds: string[] = [];
let planId = "";
let priceId = "";

describe("series entitlement resolver", () => {
  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `batch-entitlements-${suffix}@test.local`,
        referralCode: `BE${suffix.slice(0, 8)}`,
      },
    });
    userId = user.id;
    const plan = await prisma.plan.create({
      data: {
        code: `BATCH_VIP_${suffix.slice(0, 8)}`,
        name: "Batch VIP",
        prices: {
          create: {
            currency: "INR",
            amountMinor: 99_900,
            trialAmountMinor: 900,
            countryCodes: ["IN"],
          },
        },
      },
      include: { prices: true },
    });
    planId = plan.id;
    priceId = plan.prices[0].id;
    const series = await prisma.series.create({
      data: {
        slug: `batch-entitlements-${suffix}`,
        title: "Batch Entitlements",
        synopsis: "Test",
        posterUrl: "",
        teaserUrl: "",
        genres: [],
        tropeTags: [],
        castNames: [],
        freeEpisodeCount: 1,
      },
    });
    seriesId = series.id;
    const episodes = await Promise.all(
      [1, 2, 3, 4].map((number) =>
        prisma.episode.create({
          data: {
            seriesId,
            number,
            title: `Episode ${number}`,
            durationSec: 1,
            hlsPath: "sample.mp4",
            thumbnailUrl: "",
            isFree: false,
            coinPrice: 10,
          },
        }),
      ),
    );
    episodeIds = episodes.map((episode) => episode.id);
    await prisma.episodeUnlock.create({
      data: { userId, episodeId: episodeIds[1], source: "COIN" },
    });
    const now = new Date();
    const subscription = await prisma.subscription.create({
      data: {
        userId,
        planId,
        priceId,
        status: "ACTIVE",
        trialEndsAt: now,
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getTime() + 86_400_000),
        provider: "DEV",
        currency: "INR",
      },
    });
    await prisma.subscriptionInvoice.create({
      data: {
        subscriptionId: subscription.id,
        amountMinor: 99_900,
        currency: "INR",
        kind: "RENEWAL",
        status: "PAID",
        periodKey: `batch-${suffix}`,
      },
    });
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } });
    await prisma.series.delete({ where: { id: seriesId } });
    await prisma.plan.delete({ where: { id: planId } });
    await prisma.$disconnect();
  });

  it("matches the single-episode resolver across free, coin, subscription, and locked cases", async () => {
    const episodes = [
      { id: episodeIds[0], number: 1, isFree: false },
      { id: episodeIds[1], number: 2, isFree: false },
      { id: episodeIds[2], number: 3, isFree: false },
      { id: episodeIds[3], number: 4, isFree: false },
    ];
    await prisma.subscription.updateMany({
      where: { userId },
      data: { status: "CANCELED" },
    });
    const lockedBatch = await resolveSeriesEpisodeEntitlements(userId, episodes, 1);
    const lockedSingle = await Promise.all(
      episodeIds.map((episodeId) => resolveEpisodeEntitlement(userId, episodeId)),
    );
    expect([...lockedBatch.values()]).toEqual(lockedSingle);

    await prisma.subscription.updateMany({
      where: { userId },
      data: { status: "ACTIVE" },
    });
    const subscriptionBatch = await resolveSeriesEpisodeEntitlements(userId, episodes, 1);
    const subscriptionSingle = await Promise.all(
      episodeIds.map((episodeId) => resolveEpisodeEntitlement(userId, episodeId)),
    );
    expect([...subscriptionBatch.values()]).toEqual(subscriptionSingle);
  });
});
