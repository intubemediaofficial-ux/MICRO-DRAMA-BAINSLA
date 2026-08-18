import { PrismaClient, Role, LedgerType } from "@prisma/client";
const prisma = new PrismaClient();

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
  const palette = [
    ["Crimson Promises", "romance", "cliffhanger"],
    ["Room 404", "thriller", "mystery"],
    ["Second Chance Café", "comedy", "found-family"],
  ];
  for (let index = 0; index < palette.length; index += 1) {
    const [title, genre, trope] = palette[index];
    const slug = title.toLowerCase().replaceAll(" ", "-");
    const series = await prisma.series.create({
      data: {
        slug,
        title,
        synopsis: `Every secret has a price in ${title}.`,
        posterUrl: `/media/poster-${index}.jpg`,
        teaserUrl: "/media/sample.mp4",
        genres: [genre],
        tropeTags: [trope],
        castNames: ["Aarav Bainsla", "Mira Sen"],
        freeEpisodeCount: 7,
        defaultCoinPrice: 12,
        isPublished: true,
        status: index === 2 ? "COMPLETED" : "ONGOING",
      },
    });
    for (let number = 1; number <= 60; number += 1) {
      const episode = await prisma.episode.create({
        data: {
          seriesId: series.id,
          number,
          title: number === 60 ? "The Finale" : `The secret in scene ${number}`,
          durationSec: 90 + number,
          hlsPath: "sample.mp4",
          thumbnailUrl: `/media/thumb-${index}.jpg`,
          isFree: number <= 3,
          coinPrice: 12,
          publishedAt: new Date(Date.now() - (60 - number) * 86_400_000),
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
      data: { seriesId: series.id, title: `Cliffhanger: ${title}` },
    });
    if (index === 0)
      await prisma.banner.create({
        data: {
          title,
          imageUrl: `/media/poster-${index}.jpg`,
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
    `Seeded admin ${admin.email}, viewer ${user.email}, ${bundles.length} bundles, 180 episodes and VIP subscriptions.`,
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
