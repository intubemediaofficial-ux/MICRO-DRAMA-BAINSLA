import Link from "next/link";
import { redirect } from "next/navigation";
import AccountNav from "./account-nav";
import { getSession } from "@/server/auth";
import { prisma } from "@/server/db";
import { env } from "@/server/config";
import { getSettings } from "@/server/settings";

export default async function AccountPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const [user, settings] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: session.userId },
      select: { name: true, referralCode: true },
    }),
    getSettings(),
  ]);
  const referralLink = `${env.NEXT_PUBLIC_APP_URL}/?ref=${encodeURIComponent(user.referralCode)}`;
  return (
    <div className="p-5 pb-24">
      <Link href="/" className="text-zinc-400">← Discover</Link>
      <h1 className="mt-7 text-3xl font-black">{user.name || "My account"}</h1>
      <AccountNav />
      <section className="mt-6 rounded-2xl bg-zinc-900 p-5">
        <h2 className="text-xl font-bold">Invite friends</h2>
        <p className="mt-2 text-sm text-zinc-400">
          You and a friend each receive {settings.REFERRAL_BONUS_COINS} coins when they join.
        </p>
        <p className="mt-4 break-all rounded-xl bg-zinc-950 p-3 text-sm">{referralLink}</p>
      </section>
      <Link
        href="/account/delete"
        className="mt-6 inline-block text-sm text-zinc-400 underline hover:text-zinc-200"
      >
        Delete your account
      </Link>
    </div>
  );
}
