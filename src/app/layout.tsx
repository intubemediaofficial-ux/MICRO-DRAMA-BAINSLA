import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { getSession } from "@/server/auth";
import { hasActiveSubscription } from "@/server/entitlements";

export const metadata: Metadata = {
  title: "MicroDrama",
  description: "Vertical stories. One more episode.",
};
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession();
  const subscription = session ? await hasActiveSubscription(session.userId) : null;
  return (
    <html lang="en">
      <body>
        <main className="mx-auto min-h-screen max-w-6xl">{children}</main>
        <nav className="fixed bottom-0 left-1/2 z-40 flex w-full max-w-6xl -translate-x-1/2 justify-around border-t border-zinc-800 bg-zinc-950/95 p-3 text-xs text-zinc-400">
          <Link href="/">Discover</Link>
          <Link href="/search">Search</Link>
          <Link href="/wallet">Wallet</Link>
          <Link href="/account/watch-history">History</Link>
          <Link href="/account/subscription">Subscription{subscription ? " · VIP" : ""}</Link>
          <Link href="/admin">Admin</Link>
        </nav>
      </body>
    </html>
  );
}
