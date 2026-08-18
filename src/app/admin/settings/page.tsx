import Link from "next/link";
import { getSession } from "@/server/auth";

export default async function AdminSettingsPage() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN")
    return <div className="p-8"><h1 className="text-3xl font-black">Admin access required</h1><Link href="/login" className="mt-5 inline-block rounded-full bg-rose-500 px-5 py-3">Sign in</Link></div>;
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-rose-400">Workspace</p>
      <h1 className="mt-2 text-3xl font-black">Settings</h1>
      <p className="mt-2 text-sm text-zinc-400">Operational controls for the admin workspace.</p>
      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-zinc-900 p-5">
          <h2 className="font-bold">Subscription automation</h2>
          <p className="mt-2 text-sm text-zinc-400">Reminder and dunning controls are managed alongside subscription metrics.</p>
          <Link href="/admin/subscriptions" className="mt-4 inline-block rounded-xl bg-rose-500 px-4 py-2.5 text-sm font-bold">Open subscriptions →</Link>
        </section>
        <section className="rounded-2xl border border-white/10 bg-zinc-900 p-5">
          <h2 className="font-bold">Public storefront</h2>
          <p className="mt-2 text-sm text-zinc-400">Open the live catalogue to confirm what viewers see.</p>
          <Link href="/" className="mt-4 inline-block rounded-xl border border-white/10 bg-zinc-800 px-4 py-2.5 text-sm font-bold">View site →</Link>
        </section>
      </div>
    </div>
  );
}
