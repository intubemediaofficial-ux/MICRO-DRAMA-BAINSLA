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
    // Keep drop rates non-negative if late or corrected progress makes a later count rise.
    const dropPercent = previous === 0 ? 0 : Math.max(0, (previous - viewers) / previous);
    previous = viewers;
    return { episodeNumber: row.number, viewers, dropPercent };
  });
}

export async function getRevenueMetrics() {
  const activeSince = since(7);
  // ARPU is completed purchase revenue in INR divided by distinct users with completed purchases.
  const purchaseMetrics = await prisma.$queryRaw<
    { revenueMinor: bigint | null; payingUsers: bigint }[]
  >(Prisma.sql`
    SELECT
      COALESCE(SUM(cb."priceMinor"), 0) AS "revenueMinor",
      COUNT(DISTINCT p."userId") AS "payingUsers"
    FROM "Purchase" p
    INNER JOIN "CoinBundle" cb ON cb.id = p."bundleId"
    WHERE p.status = 'COMPLETED'
  `);
  // Coins spent per paying user is all negative ledger activity for users with a completed purchase.
  const spentMetrics = await prisma.$queryRaw<{ spent: bigint | null }[]>(Prisma.sql`
    SELECT COALESCE(SUM(ABS(ct.delta)), 0) AS spent
    FROM "CoinTransaction" ct
    WHERE ct.delta < 0
      AND EXISTS (
        SELECT 1
        FROM "Purchase" p
        WHERE p."userId" = ct."userId"
          AND p.status = 'COMPLETED'
      )
  `);
  // Consumption velocity is recent negative ledger activity divided by recent active users and seven days.
  const activityMetrics = await prisma.$queryRaw<
    { activeUsers: bigint; recentSpent: bigint | null }[]
  >(Prisma.sql`
    SELECT
      COUNT(DISTINCT CASE WHEN ct."createdAt" >= ${activeSince} THEN ct."userId" END) AS "activeUsers",
      COALESCE(
        SUM(CASE WHEN ct.delta < 0 AND ct."createdAt" >= ${activeSince} THEN ABS(ct.delta) ELSE 0 END),
        0
      ) AS "recentSpent"
    FROM "CoinTransaction" ct
  `);
  const revenueMinor = Number(purchaseMetrics[0]?.revenueMinor ?? 0);
  const payingUsers = Number(purchaseMetrics[0]?.payingUsers ?? 0);
  const spentByPayingUsers = Number(spentMetrics[0]?.spent ?? 0);
  const activeUsers = Number(activityMetrics[0]?.activeUsers ?? 0);
  const recentSpent = Number(activityMetrics[0]?.recentSpent ?? 0);
  return {
    revenueInr: revenueMinor / 100,
    payingUsers,
    arpuInr: payingUsers ? revenueMinor / 100 / payingUsers : 0,
    coinsSpentPerPayingUser: payingUsers ? spentByPayingUsers / payingUsers : 0,
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
