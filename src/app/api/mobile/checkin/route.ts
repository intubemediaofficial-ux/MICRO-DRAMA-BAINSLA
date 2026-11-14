import { NextResponse } from "next/server";
import { getSession } from "@/server/auth";
import { claimDailyCheckin, getDailyCheckinStatus } from "@/server/coins";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });
  return NextResponse.json(await getDailyCheckinStatus(session.userId));
}

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });
  try {
    const result = await claimDailyCheckin(session.userId);
    if (result.alreadyCheckedIn)
      return NextResponse.json({ error: { message: "Already checked in today" } }, { status: 409 });
    return NextResponse.json({
      coinsAwarded: result.coinsAwarded,
      streak: result.checkin.streak,
      balance: result.balance,
    });
  } catch {
    return NextResponse.json({ error: { message: "Check-in failed" } }, { status: 400 });
  }
}
