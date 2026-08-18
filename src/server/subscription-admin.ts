import { Prisma } from "@prisma/client";
import { prisma } from "./db";

export async function getSubscriptionAdminMetrics(days = 30, search?: string) {
  const since = new Date(Date.now() - days * 86_400_000);
  // Active trials count subscriptions still trialing and not past their trial end.
  const activeTrials = await prisma.subscription.count({
    where: { status: "TRIALING", trialEndsAt: { gt: new Date() } },
  });
  // Trial conversion rate is subscriptions converted to ACTIVE divided by trials started in the selected window.
  const conversionRows = await prisma.$queryRaw<{ trials: bigint; converted: bigint }[]>(
    Prisma.sql`
      SELECT
        COUNT(*) AS trials,
        COUNT(*) FILTER (WHERE s.status = 'ACTIVE' OR EXISTS (
          SELECT 1 FROM "SubscriptionEvent" se
          WHERE se."subscriptionId" = s.id AND se."reason" = 'Renewal paid'
        )) AS converted
      FROM "Subscription" s
      WHERE s."createdAt" >= ${since}
    `,
  );
  // Country revenue sums paid subscription invoices by the subscription country, preserving minor units.
  const countryRows = await prisma.$queryRaw<
    { country: string; currency: string; revenueMinor: bigint }[]
  >(Prisma.sql`
    SELECT s.country, i.currency, SUM(i."amountMinor") AS "revenueMinor"
    FROM "SubscriptionInvoice" i
    INNER JOIN "Subscription" s ON s.id = i."subscriptionId"
    WHERE i.status = 'PAID'
    GROUP BY s.country, i.currency
    ORDER BY "revenueMinor" DESC
  `);
  // Annual revenue run rate is paid annual invoice revenue divided by twelve for an MRR-like view.
  const annualRows = await prisma.$queryRaw<{ revenueMinor: bigint | null }[]>(
    Prisma.sql`
      SELECT COALESCE(SUM(i."amountMinor"), 0) AS "revenueMinor"
      FROM "SubscriptionInvoice" i
      INNER JOIN "Subscription" s ON s.id = i."subscriptionId"
      INNER JOIN "Plan" p ON p.id = s."planId"
      WHERE i.status = 'PAID' AND p.interval = 'ANNUAL'
    `,
  );
  const users = await prisma.user.findMany({
    where: search
      ? {
          OR: [
            { email: { contains: search, mode: "insensitive" } },
            { phone: { contains: search } },
            { name: { contains: search, mode: "insensitive" } },
          ],
        }
      : undefined,
    select: {
      id: true,
      email: true,
      phone: true,
      name: true,
      subscriptions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { plan: true, price: true },
      },
    },
    take: 20,
  });
  const trials = Number(conversionRows[0]?.trials ?? 0);
  const converted = Number(conversionRows[0]?.converted ?? 0);
  return {
    windowDays: days,
    activeTrials,
    trials,
    converted,
    conversionRate: trials ? converted / trials : 0,
    countryRevenue: countryRows.map((row) => ({
      country: row.country,
      currency: row.currency,
      revenueMinor: Number(row.revenueMinor),
    })),
    totalPaidInvoiceRevenueMinor: countryRows.reduce(
      (total, row) => total + Number(row.revenueMinor),
      0,
    ),
    annualRevenueRunRateMinor: Number(annualRows[0]?.revenueMinor ?? 0),
    users,
  };
}
