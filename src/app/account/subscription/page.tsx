import Link from "next/link";
import { headers } from "next/headers";
import { getSession } from "@/server/auth";
import { resolveCurrency } from "@/server/currency";
import { getSubscriptionOffer, getUserSubscription } from "@/server/subscriptions";
import SubscriptionActions from "./actions";
import PasswordChange from "./password-change";

export default async function SubscriptionPage() {
  const session = await getSession();
  if (!session)
    return (
      <div className="p-5 pb-24">
        <h1 className="text-3xl font-black">My Subscription</h1>
        <p className="mt-3 text-zinc-400">Sign in to start a VIP trial or manage billing.</p>
        <Link href="/login" className="mt-5 inline-block rounded-full bg-rose-500 px-5 py-3">
          Sign in
        </Link>
      </div>
    );
  const subscription = await getUserSubscription(session.userId);
  const currency = resolveCurrency(new Headers(await headers()));
  const offer = await getSubscriptionOffer("VIP_ANNUAL", currency);
  const money = (minor: number, code: string) =>
    new Intl.NumberFormat("en", { style: "currency", currency: code }).format(minor / 100);
  const trialRemaining =
    subscription?.status === "TRIALING"
      ? Math.max(0, subscription.trialEndsAt.getTime() - Date.now())
      : 0;
  const trialRemainingLabel =
    trialRemaining > 0
      ? trialRemaining < 86_400_000
        ? `${Math.max(1, Math.ceil(trialRemaining / 3_600_000))} hours left in your trial`
        : `${Math.ceil(trialRemaining / 86_400_000)} day${Math.ceil(trialRemaining / 86_400_000) === 1 ? "" : "s"} left in your trial`
      : null;
  return (
    <div className="p-5 pb-24">
      <Link href="/" className="text-zinc-400">
        ← Discover
      </Link>
      <h1 className="mt-7 text-3xl font-black">My Subscription</h1>
      {!subscription ? (
        <section className="mt-6 rounded-3xl bg-amber-400 p-6 text-zinc-950">
          <p className="text-sm font-bold uppercase">VIP access</p>
          <h2 className="mt-2 text-2xl font-black">Unlock Full Series</h2>
          {offer && (
            <p className="mt-2">
              Start {offer.plan.trialDays}-day trial for{" "}
              {money(offer.price.trialAmountMinor, offer.price.currency)}, then{" "}
              {money(offer.price.amountMinor, offer.price.currency)} annually.
            </p>
          )}
          <p className="mt-2 text-sm">Unlimited locked episodes, no ads and a VIP badge.</p>
          <Link
            href="/"
            className="mt-5 inline-block rounded-full bg-zinc-950 px-5 py-3 font-bold text-white"
          >
            Start trial from an episode
          </Link>
        </section>
      ) : (
        <>
          <section className="mt-6 rounded-3xl bg-zinc-900 p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-widest text-amber-300">VIP</p>
                <h2 className="mt-2 text-2xl font-black">{subscription.plan.name}</h2>
                <p className="mt-2 text-zinc-400">
                  {subscription.status} ·{" "}
                  {money(subscription.price.amountMinor, subscription.currency)} annually
                </p>
                {trialRemainingLabel && (
                  <p className="mt-2 font-semibold text-amber-300">{trialRemainingLabel}</p>
                )}
                <p className="mt-2 text-sm text-zinc-400">
                  {subscription.status === "TRIALING"
                    ? "Next billing"
                    : subscription.cancelAtPeriodEnd
                      ? "Access ends"
                      : "Renews"}{" "}
                  {(subscription.status === "TRIALING"
                    ? subscription.trialEndsAt
                    : subscription.currentPeriodEnd
                  ).toLocaleDateString()}
                </p>
              </div>
              <span className="rounded-full bg-amber-400 px-3 py-1 text-sm font-bold text-zinc-950">
                VIP
              </span>
            </div>
            <SubscriptionActions
              subscriptionId={subscription.id}
              cancelAtPeriodEnd={subscription.cancelAtPeriodEnd}
            />
          </section>
          <section className="mt-8">
            <h2 className="text-xl font-bold">Payment history</h2>
            <div className="mt-3 space-y-2">
              {subscription.invoices.map((invoice) => (
                <div
                  key={invoice.id}
                  className="flex justify-between rounded-xl bg-zinc-900 p-3 text-sm"
                >
                  <span>{invoice.kind}</span>
                  <span>
                    {money(invoice.amountMinor, invoice.currency)} · {invoice.status}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
      <PasswordChange />
    </div>
  );
}
