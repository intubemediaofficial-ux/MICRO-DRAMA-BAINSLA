import Link from "next/link";
import { getSession } from "@/server/auth";
import SeriesEditor from "../series-editor";

export default async function NewSeriesPage() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN")
    return <div className="p-8"><h1 className="text-3xl font-black">Admin access required</h1><Link href={`/login?returnTo=${encodeURIComponent("/admin/series/new")}`} className="mt-5 inline-block rounded-full bg-rose-500 px-5 py-3">Sign in</Link></div>;
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/admin/series" className="text-sm text-zinc-400 hover:text-white">
            ← Series library
          </Link>
          <h1 className="mt-5 text-3xl font-black">Create a series</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Start with the basics, then add media and episodes.
          </p>
        </div>
        <Link
          href="/admin/upload"
          className="rounded-xl border border-white/10 bg-zinc-800 px-4 py-2.5 text-sm font-bold text-zinc-100 transition hover:bg-zinc-700"
        >
          Quick upload
        </Link>
      </div>
      <SeriesEditor initial={null} />
    </div>
  );
}
