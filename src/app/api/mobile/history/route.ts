import { NextResponse } from "next/server";
import { getSession } from "@/server/auth";
import { getWatchHistory } from "@/server/watch-history";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });
  const items = await getWatchHistory(session.userId);
  return NextResponse.json({ items: items.filter((item) => item.available) });
}
