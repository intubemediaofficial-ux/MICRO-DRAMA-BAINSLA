import Link from "next/link";
import { getSession } from "@/server/auth";
import { prisma } from "@/server/db";
import { razorpayConfigured } from "@/server/razorpay";
import CoinPackCheckout from "./coin-pack-checkout";
export default async function WalletPage() {
  const session = await getSession();
  const user = session
    ? await prisma.user.findUnique({
        where: { id: session.userId },
        include: { transactions: { orderBy: { createdAt: "desc" }, take: 8 } },
      })
    : null;
  const bundles = await prisma.coinBundle.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });
  const coinPacksEnabled = user ? await razorpayConfigured() : false;
  return (
    <div className="p-5 pb-24">
      <Link href="/" className="text-zinc-400">
        ← Discover
      </Link>
      <h1 className="mt-7 text-3xl font-black">Your wallet</h1>
      {!user ? (
        <div className="mt-8 rounded-2xl bg-zinc-900 p-5">
          <p>Sign in to manage coins and daily rewards.</p>
          <Link
            href="/login"
            className="mt-4 inline-block rounded-full bg-rose-500 px-5 py-3 font-bold"
          >
            Sign in
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-6 rounded-3xl bg-gradient-to-br from-amber-400 to-orange-600 p-6 text-zinc-950">
            <p className="text-sm font-bold uppercase">Available coins</p>
            <p className="mt-2 text-5xl font-black">🪙 {user.coinBalance}</p>
            <form action="/api/checkin" method="post">
              <button className="mt-5 rounded-full bg-zinc-950 px-5 py-3 font-bold text-white">
                Claim daily check-in
              </button>
            </form>
          </div>
          <h2 className="mt-8 text-xl font-bold">Top up</h2>
          {coinPacksEnabled ? (
            <CoinPackCheckout
              bundles={bundles.map(({ id, coins, bonusCoins, priceMinor, currency }) => ({
                id,
                coins,
                bonusCoins,
                priceMinor,
                currency,
              }))}
            />
          ) : (
            <p className="mt-3 rounded-2xl bg-zinc-900 p-4 text-sm font-semibold text-zinc-400">
              Coin packs open soon.
            </p>
          )}
          <h2 className="mt-8 text-xl font-bold">Recent activity</h2>
          <div className="mt-3 space-y-2">
            {user.transactions.map((tx) => (
              <div key={tx.id} className="flex justify-between rounded-xl bg-zinc-900 p-3 text-sm">
                <span>{tx.type.replaceAll("_", " ")}</span>
                <b className={tx.delta > 0 ? "text-emerald-400" : "text-rose-400"}>
                  {tx.delta > 0 ? "+" : ""}
                  {tx.delta}
                </b>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
