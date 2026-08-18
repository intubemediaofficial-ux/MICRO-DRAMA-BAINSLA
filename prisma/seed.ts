import { PrismaClient, Role, LedgerType } from "@prisma/client";
import { readFileSync } from "node:fs";
import path from "node:path";

const prisma = new PrismaClient();
const catalogue = JSON.parse(
  readFileSync(path.join(process.cwd(), "prisma/demo-catalogue.json"), "utf8"),
) as {
  slug: string;
  title: string;
  synopsis: string;
  genres: string[];
  tropeTags: string[];
  status: "ONGOING" | "COMPLETED";
  freeEpisodeCount: number;
  defaultCoinPrice: number;
  episodeCount: number;
  homeSections: string[];
  cast: { name: string; role: string }[];
}[];
const manifest = JSON.parse(
  readFileSync(path.join(process.cwd(), "public/demo/manifest.json"), "utf8"),
) as {
  slug: string;
  posterUrl: string;
  thumbnailUrl: string;
  cast: { name: string; role: string; photoUrl: string }[];
}[];
const manifestBySlug = new Map(manifest.map((item) => [item.slug, item]));

async function main() {
  await prisma.notificationLog.deleteMany();
  await prisma.subscriptionWebhookEvent.deleteMany();
  await prisma.subscriptionInvoice.deleteMany();
  await prisma.subscriptionEvent.deleteMany();
  await prisma.subscriptionDiscountRedemption.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.subscriptionAutomation.deleteMany();
  await prisma.discountCodePlan.deleteMany();
  await prisma.discountCode.deleteMany();
  await prisma.planPrice.deleteMany();
  await prisma.plan.deleteMany();
  await prisma.pushCampaign.deleteMany();
  await prisma.couponRedemption.deleteMany();
  await prisma.coupon.deleteMany();
  await prisma.banner.deleteMany();
  await prisma.episodeLike.deleteMany();
  await prisma.watchProgress.deleteMany();
  await prisma.dailyCheckin.deleteMany();
  await prisma.purchase.deleteMany();
  await prisma.coinBundle.deleteMany();
  await prisma.coinTransaction.deleteMany();
  await prisma.episodeUnlock.deleteMany();
  await prisma.subtitle.deleteMany();
  await prisma.episode.deleteMany();
  await prisma.homeRailItem.deleteMany();
  await prisma.series.deleteMany();
  await prisma.user.deleteMany();
  const admin = await prisma.user.create({
    data: {
      email: "admin@microdrama.local",
      name: "Studio Admin",
      role: Role.ADMIN,
      referralCode: "ADMINMD",
    },
  });
  const user = await prisma.user.create({
    data: {
      email: "user@microdrama.local",
      name: "Demo Viewer",
      coinBalance: 500,
      referralCode: "VIEWERMD",
    },
  });
  const trialUser = await prisma.user.create({
    data: { email: "trial@microdrama.local", name: "Trial Viewer", referralCode: "TRIALMD" },
  });
  const canceledUser = await prisma.user.create({
    data: { email: "canceled@microdrama.local", name: "Canceled Viewer", referralCode: "CANCELMD" },
  });
  const pastDueUser = await prisma.user.create({
    data: { email: "pastdue@microdrama.local", name: "Past Due Viewer", referralCode: "PASTDUE" },
  });
  await prisma.coinTransaction.create({
    data: {
      userId: user.id,
      delta: 500,
      balanceAfter: 500,
      type: LedgerType.ADMIN_ADJUST,
      refType: "seed",
      refId: user.id,
    },
  });
  const bundles = await Promise.all(
    [
      [100, 0, 4900],
      [300, 50, 12900],
      [750, 200, 24900],
    ].map(([coins, bonusCoins, priceMinor], index) =>
      prisma.coinBundle.create({ data: { coins, bonusCoins, priceMinor, sortOrder: index } }),
    ),
  );
  const homePositions = new Map<string, number>();
  for (let index = 0; index < catalogue.length; index += 1) {
    const item = catalogue[index];
    const artwork = manifestBySlug.get(item.slug);
    if (!artwork) throw new Error(`Missing demo artwork for ${item.slug}`);
    const series = await prisma.series.create({
      data: {
        slug: item.slug,
        title: item.title,
        synopsis: item.synopsis,
        posterUrl: artwork.posterUrl,
        teaserUrl: "/media/sample.mp4",
        genres: item.genres,
        tropeTags: item.tropeTags,
        castNames: item.cast.map((member) => member.name),
        freeEpisodeCount: item.freeEpisodeCount,
        defaultCoinPrice: item.defaultCoinPrice,
        isPublished: true,
        status: item.status,
      },
    });
    await prisma.castMember.createMany({
      data: item.cast.map((member, castIndex) => ({
        seriesId: series.id,
        name: member.name,
        role: member.role,
        photo: artwork.cast[castIndex]?.photoUrl ?? null,
        sortOrder: castIndex,
      })),
    });
    for (const railKey of item.homeSections) {
      const position = homePositions.get(railKey) ?? 0;
      await prisma.homeRailItem.create({
        data: { railKey, position, seriesId: series.id },
      });
      homePositions.set(railKey, position + 1);
    }
    for (let number = 1; number <= item.episodeCount; number += 1) {
      const episode = await prisma.episode.create({
        data: {
          seriesId: series.id,
          number,
          title:
            number === item.episodeCount
              ? "The Finale"
              : `${item.title} · Chapter ${number}`,
          durationSec: 60 + ((number * 17 + index * 11) % 121),
          hlsPath: "sample.mp4",
          thumbnailUrl: artwork.thumbnailUrl,
          isFree: number <= item.freeEpisodeCount,
          coinPrice: item.defaultCoinPrice,
          publishedAt: new Date(Date.now() - (item.episodeCount - number) * 86_400_000),
        },
      });
      if (number <= 2)
        await prisma.episodeUnlock.create({
          data: { userId: user.id, episodeId: episode.id, source: "FREE" },
        });
      if (number <= 10)
        await prisma.watchProgress.create({
          data: { userId: user.id, episodeId: episode.id, positionSec: 40, completed: number < 4 },
        });
      if (number === 1)
        await prisma.episodeLike.create({ data: { userId: user.id, episodeId: episode.id } });
      if (index === 0 && number === 1)
        await prisma.subtitle.create({
          data: { episodeId: episode.id, lang: "en", srtPath: "subtitles/seed-en.srt" },
        });
    }
    await prisma.pushCampaign.create({
      data: { seriesId: series.id, title: `Cliffhanger: ${item.title}` },
    });
    await prisma.banner.create({
      data: {
        title: item.title,
        imageUrl: `/demo/banners/${["banner-tonight.jpg", "banner-trial.jpg", "banner-double-coins.jpg"][index % 3]}`,
        targetSeriesId: series.id,
        sortOrder: index,
      },
    });
  }
  const paidEpisode = await prisma.episode.findFirstOrThrow({
    where: { series: { slug: "crimson-promises" }, number: 8 },
  });
  await prisma.episodeUnlock.create({
    data: { userId: user.id, episodeId: paidEpisode.id, source: "COIN" },
  });
  await prisma.user.update({ where: { id: user.id }, data: { coinBalance: { decrement: 12 } } });
  await prisma.coinTransaction.create({
    data: {
      userId: user.id,
      delta: -12,
      balanceAfter: 488,
      type: LedgerType.EPISODE_UNLOCK,
      refType: "episode",
      refId: paidEpisode.id,
    },
  });
  const completedPurchase = await prisma.purchase.create({
    data: {
      userId: user.id,
      bundleId: bundles[0].id,
      provider: "CARD",
      providerRef: "seed-card-completed",
      status: "COMPLETED",
      coinsGranted: 100,
    },
  });
  await prisma.user.update({
    where: { id: user.id },
    data: { coinBalance: { increment: completedPurchase.coinsGranted } },
  });
  await prisma.coinTransaction.create({
    data: {
      userId: user.id,
      delta: 100,
      balanceAfter: 588,
      type: LedgerType.PURCHASE,
      refType: "purchase",
      refId: completedPurchase.id,
    },
  });
  await prisma.purchase.create({
    data: {
      userId: user.id,
      bundleId: bundles[1].id,
      provider: "GOOGLE_PLAY",
      providerRef: "seed-google-failed",
      status: "FAILED",
      coinsGranted: 0,
    },
  });
  const plan = await prisma.plan.create({
    data: {
      code: "VIP_ANNUAL",
      name: "VIP Annual",
      trialDays: 3,
      prices: {
        create: [
          { currency: "INR", amountMinor: 99_900, trialAmountMinor: 900, countryCodes: ["IN"] },
          { currency: "USD", amountMinor: 9_999, trialAmountMinor: 99, countryCodes: ["US"] },
          { currency: "EUR", amountMinor: 8_999, trialAmountMinor: 99, countryCodes: ["DE", "FR"] },
          { currency: "AED", amountMinor: 47_900, trialAmountMinor: 900, countryCodes: ["AE"] },
        ],
      },
    },
    include: { prices: true },
  });
  const priceFor = (currency: string) =>
    plan.prices.find((price) => price.currency === currency) ?? plan.prices[0];
  const now = new Date();
  const createSubscription = async (data: {
    userId: string;
    status: "TRIALING" | "ACTIVE" | "CANCELED" | "PAST_DUE";
    currency: string;
    country: string;
    trialEndsAt: Date;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    cancelAtPeriodEnd?: boolean;
  }) => {
    const price = priceFor(data.currency);
    const subscription = await prisma.subscription.create({
      data: {
        ...data,
        planId: plan.id,
        priceId: price.id,
        provider: "DEV",
        providerRef: `seed-sub-${data.userId}`,
      },
    });
    await prisma.subscriptionEvent.create({
      data: {
        subscriptionId: subscription.id,
        toStatus: data.status,
        reason: "Seeded subscription",
        actorType: "SYSTEM",
      },
    });
    await prisma.subscriptionInvoice.create({
      data: {
        subscriptionId: subscription.id,
        amountMinor: price.trialAmountMinor,
        currency: data.currency,
        kind: "TRIAL",
        status: "PAID",
        providerRef: `seed-trial-${data.userId}`,
        periodKey: "seed-trial",
        paidAt: now,
      },
    });
    return { subscription, price };
  };
  const active = await createSubscription({
    userId: user.id,
    status: "ACTIVE",
    currency: "INR",
    country: "IN",
    trialEndsAt: new Date(now.getTime() - 5 * 86_400_000),
    currentPeriodStart: new Date(now.getTime() - 2 * 86_400_000),
    currentPeriodEnd: new Date(now.getTime() + 363 * 86_400_000),
  });
  await prisma.subscriptionInvoice.create({
    data: {
      subscriptionId: active.subscription.id,
      amountMinor: active.price.amountMinor,
      currency: "INR",
      kind: "RENEWAL",
      status: "PAID",
      providerRef: "seed-active-renewal",
      periodKey: "seed-renewal",
      paidAt: now,
    },
  });
  await createSubscription({
    userId: trialUser.id,
    status: "TRIALING",
    currency: "USD",
    country: "US",
    trialEndsAt: new Date(now.getTime() + 2 * 86_400_000),
    currentPeriodStart: now,
    currentPeriodEnd: new Date(now.getTime() + 2 * 86_400_000),
  });
  const canceled = await createSubscription({
    userId: canceledUser.id,
    status: "CANCELED",
    currency: "AED",
    country: "AE",
    trialEndsAt: new Date(now.getTime() - 7 * 86_400_000),
    currentPeriodStart: new Date(now.getTime() - 2 * 86_400_000),
    currentPeriodEnd: new Date(now.getTime() + 8 * 86_400_000),
    cancelAtPeriodEnd: true,
  });
  await prisma.subscriptionInvoice.create({
    data: {
      subscriptionId: canceled.subscription.id,
      amountMinor: canceled.price.amountMinor,
      currency: "AED",
      kind: "RENEWAL",
      status: "PAID",
      providerRef: "seed-canceled-renewal",
      periodKey: "seed-canceled-renewal",
      paidAt: now,
    },
  });
  const pastDue = await createSubscription({
    userId: pastDueUser.id,
    status: "PAST_DUE",
    currency: "EUR",
    country: "DE",
    trialEndsAt: new Date(now.getTime() - 7 * 86_400_000),
    currentPeriodStart: new Date(now.getTime() - 2 * 86_400_000),
    currentPeriodEnd: new Date(now.getTime() + 2 * 86_400_000),
  });
  await prisma.subscriptionInvoice.create({
    data: {
      subscriptionId: pastDue.subscription.id,
      amountMinor: pastDue.price.amountMinor,
      currency: "EUR",
      kind: "RENEWAL",
      status: "FAILED",
      providerRef: "seed-pastdue-renewal",
      periodKey: "seed-pastdue-renewal",
    },
  });
  await prisma.subscriptionAutomation.create({
    data: { id: "default", enabled: true, reminderLeadHours: 24, gracePeriodHours: 72 },
  });
  await prisma.discountCode.create({
    data: {
      code: "FESTIVE20",
      type: "PERCENT",
      value: 20,
      maxRedemptions: 100,
      plans: { create: [{ planId: plan.id }] },
    },
  });
  await prisma.coupon.create({ data: { code: "WELCOME50", coins: 50, maxRedemptions: 100 } });
  console.log(
    `Seeded admin ${admin.email}, viewer ${user.email}, ${bundles.length} bundles, ${catalogue.reduce((total, item) => total + item.episodeCount, 0)} episodes and VIP subscriptions.`,
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
