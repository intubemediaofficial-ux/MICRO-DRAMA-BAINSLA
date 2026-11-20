import { NextResponse } from "next/server";
import { getSession } from "@/server/auth";
import { getHomeFeed } from "@/server/home-curation";
import { seriesCard } from "@/server/mobile";
import { continueWatching } from "@/server/watch-history";

export async function GET() {
  const session = await getSession();
  const [{ heroItems, groups }, resumeItems] = await Promise.all([
    getHomeFeed(session?.userId),
    session ? continueWatching(session.userId) : Promise.resolve([]),
  ]);
  return NextResponse.json({
    hero: heroItems.map(seriesCard),
    rails: groups
      .filter((group) => group.items.length)
      .map((group) => ({ title: group.title, items: group.items.map(seriesCard) })),
    continueWatching: resumeItems,
  });
}
