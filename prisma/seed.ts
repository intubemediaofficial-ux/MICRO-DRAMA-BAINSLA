import { PrismaClient, Role, LedgerType } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  await prisma.notificationLog.deleteMany();
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
  await prisma.coupon.create({ data: { code: "WELCOME50", coins: 50, maxRedemptions: 100 } });
  console.log(
    `Seeded admin ${admin.email}, viewer ${user.email}, ${bundles.length} bundles and 180 episodes.`,
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
