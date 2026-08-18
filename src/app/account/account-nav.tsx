import Link from "next/link";

export default function AccountNav() {
  return (
    <nav className="mt-5 flex flex-wrap gap-2 text-sm">
      <Link href="/account/watch-history" className="rounded-full bg-zinc-800 px-4 py-2">
        Watch History
      </Link>
      <Link href="/account/subscription" className="rounded-full bg-zinc-800 px-4 py-2">
        My Subscription
      </Link>
    </nav>
  );
}
