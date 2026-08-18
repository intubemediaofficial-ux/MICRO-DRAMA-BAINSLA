import { NextResponse } from "next/server";
import { getSession } from "@/server/auth";
import { dailyCheckin } from "@/server/coins";
export async function POST() {
  const session = await getSession();
  if (!session)
    return NextResponse.redirect(
      new URL("/login", process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
    );
  try {
    const result = await dailyCheckin(session.userId);
    return NextResponse.json({ ok: true, streak: result.streak });
  } catch {
    return NextResponse.json({ error: { message: "Check-in failed" } }, { status: 400 });
  }
}
