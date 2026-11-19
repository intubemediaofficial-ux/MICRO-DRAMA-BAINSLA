import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/server/auth";
import { prisma } from "@/server/db";
import { createAdToken } from "@/server/tokens";
import { findPublicEpisode } from "@/server/publishing";
import { getSettings } from "@/server/settings";
const input = z.object({ episodeId: z.string().min(1) });
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });
  try {
    const settings = await getSettings();
    if (!settings.ADS_ENABLED || !settings.ADMOB_REWARDED_UNIT_ID)
      return NextResponse.json({ error: { message: "Rewarded ads are unavailable" } }, { status: 503 });
    const { episodeId } = input.parse(await request.json());
    if (!(await findPublicEpisode(episodeId)))
      return NextResponse.json({ error: { message: "Not found" } }, { status: 404 });
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const unlocksToday = await prisma.episodeUnlock.count({
      where: { userId: session.userId, source: "AD", createdAt: { gte: today } },
    });
    if (unlocksToday >= 10)
      return NextResponse.json({ error: { message: "Daily ad unlock limit reached" } }, { status: 429 });
    const token = createAdToken(session.userId, episodeId);
    const verified = token.split(".")[0];
    const [userId, id, nonce, exp] = Buffer.from(verified, "base64url").toString().split(".");
    await prisma.adRewardNonce.create({
      data: { nonce, userId, episodeId: id, expiresAt: new Date(Number(exp) * 1000) },
    });
    return NextResponse.json({ token, adUnitId: settings.ADMOB_REWARDED_UNIT_ID });
  } catch {
    return NextResponse.json({ error: { message: "Invalid input" } }, { status: 400 });
  }
}
