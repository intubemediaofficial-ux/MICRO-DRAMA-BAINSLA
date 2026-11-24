import Image from "next/image";
import Link from "next/link";
import { getSession } from "@/server/auth";
import { prisma } from "@/server/db";
import { seriesCard } from "@/server/mobile";
import { publicEpisodeWhere, publicSeriesWhere } from "@/server/publishing";
import AccountNav from "../account-nav";

export default async function MyListPage() {
  const session = await getSession();
  if (!session)
    return (
      <div className="p-5 pb-24">
        <h1 className="text-3xl font-black">My List</h1>
        <p className="mt-3 text-zinc-400">Sign in to save series to your list.</p>
        <Link href={`/login?returnTo=${encodeURIComponent("/account/my-list")}`} className="mt-5 inline-block rounded-full bg-rose-500 px-5 py-3">
          Sign in
        </Link>
      </div>
    );
  const rows = await prisma.watchlistItem.findMany({
    where: { userId: session.userId, series: publicSeriesWhere },
    orderBy: { createdAt: "desc" },
    include: {
      series: {
        include: { episodes: { where: publicEpisodeWhere, orderBy: { number: "asc" }, take: 1 } },
      },
    },
  });
  return (
    <div className="p-5 pb-24">
      <Link href="/" className="text-zinc-400">← Discover</Link>
      <h1 className="mt-7 text-3xl font-black">My List</h1>
      <AccountNav />
      {rows.length ? (
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {rows.map(({ series }) => {
            const card = seriesCard(series);
            return (
              <Link
                href={`/series/${card.slug}`}
                key={card.id}
                className="rounded-2xl bg-zinc-900 p-3"
              >
                <div className="relative aspect-[3/4] overflow-hidden rounded-xl">
                  <Image src={card.posterUrl} alt="" fill sizes="50vw" className="object-cover" />
                </div>
                <h2 className="mt-3 font-bold">{card.title}</h2>
              </Link>
            );
          })}
        </div>
      ) : (
        <p className="mt-6 rounded-2xl bg-zinc-900 p-5 text-sm text-zinc-400">
          Series you save will appear here.
        </p>
      )}
    </div>
  );
}
