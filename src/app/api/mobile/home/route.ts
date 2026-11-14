import { NextResponse } from "next/server";
import { getSession } from "@/server/auth";
import { getHomeFeed } from "@/server/home-curation";
import { seriesCard } from "@/server/mobile";

export async function GET() {
  const session = await getSession();
  const { heroItems, groups } = await getHomeFeed(session?.userId);
  return NextResponse.json({
    hero: heroItems.map(seriesCard),
    rails: groups
      .filter((group) => group.items.length)
      .map((group) => ({ title: group.title, items: group.items.map(seriesCard) })),
  });
}
