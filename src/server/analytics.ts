import { Prisma, PurchaseProvider } from "@prisma/client";
import { prisma } from "./db";

const since = (days: number) => new Date(Date.now() - days * 86_400_000);

export async function getSeriesFunnel(seriesId: string) {
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
  const episodeOneViewers = Number(rows[0]?.viewers ?? 0);
  return rows.map((row) => {
    const viewers = Number(row.viewers);
    const dropPercent =
      episodeOneViewers === 0
        ? 0
        : Math.max(0, (episodeOneViewers - viewers) / episodeOneViewers);
    return { episodeNumber: row.number, viewers, dropPercent };
  });
}

export async function getEngagementMetrics() {
  const [row] = await prisma.$queryRaw<
    {
      dau: bigint;
      active7d: bigint;
      cohortUsers: bigint;
      d1EligibleUsers: bigint;
      d1Users: bigint;
      d7EligibleUsers: bigint;
      d7Users: bigint;
    }[]
  >(Prisma.sql`
    WITH activity AS (
      SELECT "userId", "day" AS day FROM "UserActivityDay"
      UNION
      SELECT "userId", "createdAt"::date AS day FROM "AnalyticsEvent" WHERE "userId" IS NOT NULL
    ), cohorts AS (
      SELECT id, "createdAt"::date AS day
      FROM "User"
      WHERE "createdAt" >= NOW() - INTERVAL '30 days'
    )
    SELECT
      (SELECT COUNT(DISTINCT "userId") FROM activity WHERE day = CURRENT_DATE) AS dau,
      (SELECT COUNT(DISTINCT "userId") FROM activity WHERE day >= CURRENT_DATE - 6) AS "active7d",
      COUNT(*) AS "cohortUsers",
      COUNT(*) FILTER (WHERE "createdAt" <= NOW() - INTERVAL '1 day') AS "d1EligibleUsers",
      COUNT(*) FILTER (WHERE "createdAt" <= NOW() - INTERVAL '1 day' AND EXISTS (
        SELECT 1 FROM activity a WHERE a."userId" = cohorts.id AND a.day = cohorts.day + 1
      )) AS "d1Users",
      COUNT(*) FILTER (WHERE "createdAt" <= NOW() - INTERVAL '7 days') AS "d7EligibleUsers",
      COUNT(*) FILTER (WHERE "createdAt" <= NOW() - INTERVAL '7 days' AND EXISTS (
        SELECT 1 FROM activity a WHERE a."userId" = cohorts.id AND a.day = cohorts.day + 7
      )) AS "d7Users"
    FROM cohorts
  `);
  const cohortUsers = Number(row?.cohortUsers ?? 0);
  const d1EligibleUsers = Number(row?.d1EligibleUsers ?? 0);
  const d1Users = Number(row?.d1Users ?? 0);
  const d7EligibleUsers = Number(row?.d7EligibleUsers ?? 0);
  const d7Users = Number(row?.d7Users ?? 0);
  return {
    dau: Number(row?.dau ?? 0),
    active7d: Number(row?.active7d ?? 0),
    cohortUsers,
    d1EligibleUsers,
    d7EligibleUsers,
    d1Retention: d1EligibleUsers ? d1Users / d1EligibleUsers : 0,
    d7Retention: d7EligibleUsers ? d7Users / d7EligibleUsers : 0,
  };
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
      COUNT(DISTINCT ct."userId") AS "activeUsers",
      COALESCE(
        SUM(CASE WHEN ct.delta < 0 THEN ABS(ct.delta) ELSE 0 END),
        0
      ) AS "recentSpent"
    FROM "CoinTransaction" ct
    WHERE ct."createdAt" >= ${activeSince}
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
  const [series, revenue, topGenres, providerSuccess, engagement] = await Promise.all([
    selectedSeries ? getSeriesFunnel(selectedSeries) : Promise.resolve([]),
    getRevenueMetrics(),
    getTopGenres(),
    getProviderSuccessRates(),
    getEngagementMetrics(),
  ]);
  return {
    seriesId: selectedSeries ?? null,
    funnel: series,
    revenue,
    topGenres,
    providerSuccess,
    engagement,
  };
}
