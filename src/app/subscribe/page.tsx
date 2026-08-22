import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { getSession } from "@/server/auth";
import { resolveCurrency } from "@/server/currency";
import { prisma } from "@/server/db";
import { resolveEpisodeEntitlement } from "@/server/entitlements";
import { getSubscriptionOffer, hasUsedTrial } from "@/server/subscriptions";
import SubscribeActions from "./subscribe-actions";

export default async function SubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ episode?: string }>;
}) {
  const { episode: episodeQuery } = await searchParams;
  const parsedEpisode = z.string().min(1).safeParse(episodeQuery);
  if (!parsedEpisode.success) notFound();
  const episodeId = parsedEpisode.data;
  const episode = await prisma.episode.findUnique({
    where: { id: episodeId },
    include: { series: true, season: true },
  });
  if (!episode) notFound();
  const session = await getSession();
  const entitlement = await resolveEpisodeEntitlement(session?.userId ?? null, episode.id);
  if (entitlement.entitled) redirect(`/watch/${episode.id}`);

  const offer = await getSubscriptionOffer(
    "VIP_ANNUAL",
    resolveCurrency(new Headers(await headers())),
  );
  const trialAlreadyUsed = session ? await hasUsedTrial(session.userId) : false;
  const money = (minor: number, currency: string) =>
    new Intl.NumberFormat("en", { style: "currency", currency }).format(minor / 100);
  const trialLabel = offer ? money(offer.price.trialAmountMinor, offer.price.currency) : null;
  const annualLabel = offer ? `${money(offer.price.amountMinor, offer.price.currency)}/year` : null;
  const returnTo = `/subscribe?episode=${encodeURIComponent(episode.id)}`;

  return (
    <div className="min-h-screen bg-zinc-950 p-5 pb-24">
      <Link href={`/series/${episode.series.slug}`} className="text-zinc-400">
        ← {episode.series.title}
      </Link>
      <main className="mx-auto mt-10 max-w-xl rounded-3xl border border-zinc-800 bg-zinc-900 p-6 sm:p-8">
        <p className="text-xs font-bold uppercase tracking-widest text-amber-300">
          {episode.series.title} · S{episode.season?.number ?? 1} · EP {episode.number}
        </p>
        <h1 className="mt-3 text-3xl font-black">Subscribe to continue watching</h1>
        <p className="mt-4 text-zinc-300">
          Episodes 1–{episode.series.freeEpisodeCount} are free. Get a subscription to unlock every
          episode of {episode.series.title}.
        </p>
        {!session ? (
          <Link
            href={`/login?returnTo=${encodeURIComponent(returnTo)}`}
            className="mt-6 block rounded-2xl bg-rose-500 px-5 py-4 text-center font-bold"
          >
            Sign in to continue
          </Link>
        ) : (
          <SubscribeActions
            episodeId={episode.id}
            offer={
              offer
                ? {
                    currency: offer.price.currency,
                    amountMinor: offer.price.amountMinor,
                    trialAmountMinor: offer.price.trialAmountMinor,
                    trialDays: offer.plan.trialDays,
                  }
                : null
            }
            trialAlreadyUsed={trialAlreadyUsed}
            coinPrice={episode.coinPrice}
            trialLabel={trialLabel}
            annualLabel={annualLabel}
          />
        )}
        <Link href="/account/subscription" className="mt-6 block text-center text-sm text-zinc-400">
          Manage subscription
        </Link>
      </main>
    </div>
  );
}
