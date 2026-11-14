import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { verifyAdToken } from "@/server/tokens";
import { verifyAdmobSignature } from "@/server/admob-ssv";

export async function GET(request: Request) {
  const rawSearch = new URL(request.url).search;
  const params = new URLSearchParams(rawSearch);
  const customData = params.get("custom_data");
  if (!customData) return NextResponse.json({ error: "Missing custom_data" }, { status: 400 });
  if (!(await verifyAdmobSignature(rawSearch)))
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  const token = verifyAdToken(customData);
  if (!token) return NextResponse.json({ error: "Invalid reward token" }, { status: 403 });
  const now = new Date();
  const verified = await prisma.adRewardNonce.updateMany({
    where: {
      nonce: token.nonce,
      userId: token.userId,
      episodeId: token.episodeId,
      usedAt: null,
      verifiedAt: null,
      expiresAt: { gt: now },
    },
    data: { verifiedAt: now },
  });
  if (!verified.count) return NextResponse.json({ error: "Reward is expired or already used" }, { status: 403 });
  return NextResponse.json({ ok: true });
}
