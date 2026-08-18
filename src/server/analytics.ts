import { Prisma, PurchaseProvider } from "@prisma/client";
import { prisma } from "./db";

const since = (days: number) => new Date(Date.now() - days * 86_400_000);

export async function getSeriesFunnel(seriesId: string) {
  // Funnel viewers are distinct WatchProgress users reaching each episode number; drop is versus the prior number.
  const rows = await prisma.$queryRaw<{ number: number; viewers: bigint }[]>(
    Prisma.sql`
      SELECT e."number", COUNT(DISTINCT wp."userId") AS viewers
      FROM "Episode" e
      LEFT JOIN "WatchProgress" wp ON wp."episodeId" = e.id
      WHERE e."seriesId" = ${seriesId}
      GROUP BY e."number"
      ORDER BY e."number"
    `,
  );
  let previous = 0;
  return rows.map((row) => {
    const viewers = Number(row.viewers);
    const dropPercent = previous === 0 ? 0 : Math.max(0, (previous - viewers) / previous);
    previous = viewers;
    return { episodeNumber: row.number, viewers, dropPercent };
  });
}

export async function getRevenueMetrics() {
  // ARPU is completed purchase revenue in INR divided by distinct paying users.
  const purchases = await prisma.purchase.findMany({
    where: { status: "COMPLETED" },
    select: { userId: true, bundle: { select: { priceMinor: true } } },
  });
  const revenueMinor = purchases.reduce((total, purchase) => total + purchase.bundle.priceMinor, 0);
  const payingUsers = new Set(purchases.map((purchase) => purchase.userId)).size;
  const spent = await prisma.coinTransaction.findMany({
    where: { delta: { lt: 0 } },
    select: { userId: true, delta: true, createdAt: true },
  });
  const spentByPayingUser = spent.filter((transaction) =>
    purchases.some((purchase) => purchase.userId === transaction.userId),
  );
  const activeSince = since(7);
  const activeUsers = new Set(
    (
      await prisma.coinTransaction.findMany({
        where: { createdAt: { gte: activeSince } },
        select: { userId: true },
      })
    ).map((transaction) => transaction.userId),
  ).size;
  const recentSpent = spent
    .filter((transaction) => transaction.createdAt >= activeSince)
    .reduce((total, transaction) => total + Math.abs(transaction.delta), 0);
  return {
    revenueInr: revenueMinor / 100,
    payingUsers,
    arpuInr: payingUsers ? revenueMinor / 100 / payingUsers : 0,
    coinsSpentPerPayingUser: payingUsers
      ? spentByPayingUser.reduce((total, transaction) => total + Math.abs(transaction.delta), 0) /
        payingUsers
      : 0,
    coinConsumptionVelocityPerActiveUserPerDay: activeUsers ? recentSpent / activeUsers / 7 : 0,
  };
}

export async function getTopGenres() {
  // Top genres count episode unlocks in the last seven days, attributing each unlock to its series genres.
  const unlocks = await prisma.episodeUnlock.findMany({
    where: { createdAt: { gte: since(7) } },
    select: { episode: { select: { series: { select: { genres: true } } } } },
  });
  const counts = new Map<string, number>();
  for (const unlock of unlocks) {
    for (const genre of unlock.episode.series.genres)
      counts.set(genre, (counts.get(genre) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([genre, unlocksCount]) => ({ genre, unlocks: unlocksCount }))
    .sort((a, b) => b.unlocks - a.unlocks);
}

export async function getProviderSuccessRates() {
  // Provider success rate is completed Purchase rows divided by all Purchase rows for each provider.
  const purchases = await prisma.purchase.findMany({ select: { provider: true, status: true } });
  return (Object.values(PurchaseProvider) as PurchaseProvider[]).map((provider) => {
    const rows = purchases.filter((purchase) => purchase.provider === provider);
    const completed = rows.filter((purchase) => purchase.status === "COMPLETED").length;
    return {
      provider,
      completed,
      total: rows.length,
      successRate: rows.length ? completed / rows.length : 0,
    };
  });
}

export async function getAnalytics(seriesId?: string) {
  const selectedSeries =
    seriesId ??
    (await prisma.series.findFirst({ where: { isPublished: true }, orderBy: { createdAt: "asc" } }))
      ?.id;
  const [series, revenue, topGenres, providerSuccess] = await Promise.all([
    selectedSeries ? getSeriesFunnel(selectedSeries) : Promise.resolve([]),
    getRevenueMetrics(),
    getTopGenres(),
    getProviderSuccessRates(),
  ]);
  return { seriesId: selectedSeries ?? null, funnel: series, revenue, topGenres, providerSuccess };
}
