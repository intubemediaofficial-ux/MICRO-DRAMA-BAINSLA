import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/server/auth";
import { unlockEpisode } from "@/server/coins";
import { prisma } from "@/server/db";
import { verifyAdToken } from "@/server/tokens";
import { rateLimit } from "@/server/rate-limit";
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
    if (data.source === "ad") {
      const token = data.adToken ? verifyAdToken(data.adToken) : null;
      if (!token || token.userId !== session.userId || token.episodeId !== data.episodeId)
        return NextResponse.json({ error: { message: "Invalid ad completion" } }, { status: 403 });
      const nonce = await prisma.adRewardNonce.findUnique({ where: { nonce: token.nonce } });
      if (!nonce || nonce.usedAt || nonce.expiresAt < new Date())
        return NextResponse.json(
          { error: { message: "Ad token already used or expired" } },
          { status: 403 },
        );
      const claimed = await prisma.adRewardNonce.updateMany({
        where: { nonce: token.nonce, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (!claimed.count)
        return NextResponse.json(
          { error: { message: "Ad token already used or expired" } },
          { status: 403 },
        );
      await prisma.episodeUnlock.upsert({
        where: { userId_episodeId: { userId: session.userId, episodeId: data.episodeId } },
        update: {},
        create: { userId: session.userId, episodeId: data.episodeId, source: "AD" },
      });
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
