"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function BottomNav({
  isAdmin,
  isVip,
  siteName,
}: {
  isAdmin: boolean;
  isVip: boolean;
  siteName: string;
}) {
  const pathname = usePathname();
  if (pathname.startsWith("/admin")) return null;
  return (
    <nav aria-label={`${siteName} navigation`} className="fixed bottom-0 left-1/2 z-40 flex w-full max-w-6xl -translate-x-1/2 justify-around border-t border-zinc-800 bg-zinc-950/95 p-3 text-xs text-zinc-400">
      <Link href="/" aria-label={`${siteName} home`}>Discover</Link>
      <Link href="/search">Search</Link>
      <Link href="/wallet">Wallet</Link>
      <Link href="/account/watch-history">History</Link>
      <Link href="/account/subscription">Subscription{isVip ? " · VIP" : ""}</Link>
      {isAdmin && <Link href="/admin">Admin</Link>}
    </nav>
  );
}
