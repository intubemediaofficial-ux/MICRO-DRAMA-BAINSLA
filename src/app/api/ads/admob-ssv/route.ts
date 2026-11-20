import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { getSettings } from "@/server/settings";
import { verifyAdToken } from "@/server/tokens";
import { parseAdmobSsvQuery, verifyAdmobSignature } from "@/server/admob-ssv";

export async function GET(request: Request) {
  const rawSearch = new URL(request.url).search;
  const signedQuery = parseAdmobSsvQuery(rawSearch);
  if (!signedQuery) return NextResponse.json({ error: "Missing custom_data" }, { status: 400 });
  const customData = new URLSearchParams(signedQuery.message).get("custom_data");
  if (!customData) return NextResponse.json({ error: "Missing custom_data" }, { status: 400 });
  if (!(await verifyAdmobSignature(rawSearch)))
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  const settings = await getSettings();
  const rewardedUnitId = settings.ADMOB_REWARDED_UNIT_ID?.trim();
  const signedAdUnit = new URLSearchParams(signedQuery.message).get("ad_unit");
  const rewardedUnitSuffix = rewardedUnitId?.split("/").at(-1);
  if (
    !rewardedUnitId ||
    !signedAdUnit ||
    (signedAdUnit !== rewardedUnitId && signedAdUnit !== rewardedUnitSuffix)
  )
    return NextResponse.json({ error: "Invalid ad unit" }, { status: 403 });
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
