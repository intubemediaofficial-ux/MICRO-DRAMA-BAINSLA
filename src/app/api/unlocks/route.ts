import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/server/auth";
import { unlockEpisode } from "@/server/coins";
import { prisma } from "@/server/db";
import { verifyAdToken } from "@/server/tokens";
import { rateLimit } from "@/server/rate-limit";
import { findPublicEpisode } from "@/server/publishing";
const input = z.object({
  episodeId: z.string().min(1),
  source: z.enum(["coin", "ad"]),
  adToken: z.string().optional(),
});
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });
  if (!rateLimit(`unlock:${session.userId}`, 30))
    return NextResponse.json({ error: { message: "Too many requests" } }, { status: 429 });
  try {
    const data = input.parse(await request.json());
    if (!(await findPublicEpisode(data.episodeId)))
      return NextResponse.json({ error: { message: "Not found" } }, { status: 404 });
    if (data.source === "ad") {
      const token = data.adToken ? verifyAdToken(data.adToken) : null;
      if (!token || token.userId !== session.userId || token.episodeId !== data.episodeId)
        return NextResponse.json({ error: { message: "Invalid ad completion" } }, { status: 403 });
      const failure = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('ad-unlock:' || ${session.userId}))`;
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        const unlocksToday = await tx.episodeUnlock.count({
          where: { userId: session.userId, source: "AD", createdAt: { gte: today } },
        });
        if (unlocksToday >= 10) return { status: 429, message: "Daily ad unlock limit reached" };
        const nonce = await tx.adRewardNonce.findUnique({ where: { nonce: token.nonce } });
        if (!nonce || nonce.usedAt || nonce.expiresAt < new Date())
          return { status: 403, message: "Ad token already used or expired" };
        if (!nonce.verifiedAt) return { status: 403, message: "Ad not verified yet" };
        const now = new Date();
        const claimed = await tx.adRewardNonce.updateMany({
          where: { nonce: token.nonce, usedAt: null, verifiedAt: { not: null }, expiresAt: { gt: now } },
          data: { usedAt: now },
        });
        if (!claimed.count) return { status: 403, message: "Ad token already used or expired" };
        await tx.episodeUnlock.upsert({
          where: { userId_episodeId: { userId: session.userId, episodeId: data.episodeId } },
          update: {},
          create: { userId: session.userId, episodeId: data.episodeId, source: "AD" },
        });
        return null;
      });
      if (failure)
        return NextResponse.json({ error: { message: failure.message } }, { status: failure.status });
      return NextResponse.json({ ok: true });
    }
    await unlockEpisode(session.userId, data.episodeId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unlock failed";
    return NextResponse.json(
      { error: { message } },
      { status: message === "INSUFFICIENT_COINS" ? 402 : 400 },
    );
  }
}
