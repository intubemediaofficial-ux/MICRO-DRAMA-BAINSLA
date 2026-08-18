import Link from "next/link";
import { Fragment } from "react";
import { getSession } from "@/server/auth";
import { getAnalytics } from "@/server/analytics";
import { prisma } from "@/server/db";

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ seriesId?: string }>;
}) {
  const params = await searchParams;
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-black">Admin access required</h1>
        <Link href="/login" className="mt-5 inline-block rounded-full bg-rose-500 px-5 py-3">
          Sign in
        </Link>
      </div>
    );
  }
  const [series, analytics] = await Promise.all([
    prisma.series.findMany({
      where: { isPublished: true },
      select: { id: true, title: true },
      orderBy: { title: "asc" },
    }),
    getAnalytics(params.seriesId),
  ]);
  return (
    <div className="p-5 pb-24">
      <Link href="/admin" className="text-zinc-400">
        ← CMS
      </Link>
      <h1 className="mt-7 text-3xl font-black">Analytics</h1>
      <p className="mt-2 text-zinc-400">
        Computed from progress, unlock, purchase, and ledger rows.
      </p>
      <form className="mt-5 flex max-w-md gap-2">
        <select
          name="seriesId"
          defaultValue={analytics.seriesId ?? ""}
          className="flex-1 rounded-xl bg-zinc-900 p-3"
        >
          {series.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>
        <button className="rounded-xl bg-rose-500 px-4 font-bold">Refresh</button>
      </form>
      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <Metric
          label="Revenue / ARPU"
          value={`₹${analytics.revenue.revenueInr.toFixed(2)} / ₹${analytics.revenue.arpuInr.toFixed(2)}`}
        />
        <Metric
          label="Coins / paying user"
          value={analytics.revenue.coinsSpentPerPayingUser.toFixed(2)}
        />
        <Metric
          label="Consumption / active user / day"
          value={analytics.revenue.coinConsumptionVelocityPerActiveUserPerDay.toFixed(2)}
        />
      </div>
      <section className="mt-8 rounded-2xl bg-zinc-900 p-5">
        <h2 className="text-xl font-bold">Episode funnel</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Distinct viewers with WatchProgress, and drop versus the previous episode.
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
          <b>Episode</b>
          <b>Viewers</b>
          <b>Drop</b>
          {analytics.funnel.map((row) => (
            <Fragment key={row.episodeNumber}>
              <span key={`n${row.episodeNumber}`}>{row.episodeNumber}</span>
              <span key={`v${row.episodeNumber}`}>{row.viewers}</span>
              <span key={`d${row.episodeNumber}`}>{(row.dropPercent * 100).toFixed(1)}%</span>
            </Fragment>
          ))}
        </div>
      </section>
      <div className="mt-5 grid gap-5 md:grid-cols-3">
        <AnalyticsList
          title="Top genres by unlocks"
          rows={analytics.topGenres.map((row) => `${row.genre}: ${row.unlocks}`)}
        />
        <AnalyticsList
          title="Provider success"
          rows={analytics.providerSuccess.map(
            (row) =>
              `${row.provider}: ${(row.successRate * 100).toFixed(0)}% (${row.completed}/${row.total})`,
          )}
        />
        <AnalyticsList title="Paying users" rows={[String(analytics.revenue.payingUsers)]} />
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-zinc-900 p-5">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-3 text-2xl font-black">{value}</p>
    </div>
  );
}

function AnalyticsList({ title, rows }: { title: string; rows: string[] }) {
  return (
    <div className="rounded-2xl bg-zinc-900 p-5">
      <h2 className="font-bold">{title}</h2>
      <ul className="mt-3 space-y-2 text-sm text-zinc-300">
        {rows.map((row) => (
          <li key={row}>{row}</li>
        ))}
      </ul>
    </div>
  );
}
