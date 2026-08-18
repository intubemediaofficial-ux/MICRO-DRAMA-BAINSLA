import Link from "next/link";
import { getSession } from "@/server/auth";
import { formatTimeAgo, getWatchHistory } from "@/server/watch-history";
import AccountNav from "../account-nav";

export default async function WatchHistoryPage() {
  const session = await getSession();
  if (!session) {
    return (
      <div className="p-5 pb-24">
        <h1 className="text-3xl font-black">Watch History</h1>
        <p className="mt-3 text-zinc-400">Sign in to see the episodes you have watched.</p>
        <Link href="/login" className="mt-5 inline-block rounded-full bg-rose-500 px-5 py-3">
          Sign in
        </Link>
      </div>
    );
  }

  const history = await getWatchHistory(session.userId);
  return (
    <div className="p-5 pb-24">
      <Link href="/" className="text-zinc-400">
        ← Discover
      </Link>
      <h1 className="mt-7 text-3xl font-black">Watch History</h1>
      <p className="mt-2 text-sm text-zinc-400">Your most recently watched episodes.</p>
      <AccountNav />
      {history.length === 0 ? (
        <section className="mt-8 rounded-3xl bg-zinc-900 p-6">
          <h2 className="text-xl font-bold">Nothing here yet</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Start an episode and your progress will appear here.
          </p>
          <Link href="/" className="mt-5 inline-block rounded-full bg-rose-500 px-5 py-3 font-bold">
            Browse series
          </Link>
        </section>
      ) : (
        <section className="mt-8 space-y-3">
          {history.map((item) => (
            <article key={item.id} className="rounded-2xl bg-zinc-900 p-3">
              <div className="flex gap-3">
                <img
                  src={item.thumbnailUrl}
                  alt=""
                  className="h-24 w-16 shrink-0 rounded-xl object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{item.seriesTitle}</p>
                  <p className="mt-1 text-xs text-zinc-400">
                    S{item.seasonNumber} · EP {item.episodeNumber} · {item.episodeTitle}
                  </p>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-700">
                    <div
                      className="h-full rounded-full bg-rose-500"
                      style={{ width: `${item.percentage}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    {item.percentage}% watched · {formatTimeAgo(item.updatedAt)}
                  </p>
                </div>
              </div>
              {item.available ? (
                <Link
                  href={`/watch/${item.episodeId}`}
                  className="mt-3 block rounded-xl bg-rose-500 px-4 py-2 text-center text-sm font-bold"
                >
                  Continue Watching
                </Link>
              ) : (
                <p className="mt-3 rounded-xl bg-zinc-800 px-4 py-2 text-center text-sm text-zinc-400">
                  No longer available
                </p>
              )}
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
