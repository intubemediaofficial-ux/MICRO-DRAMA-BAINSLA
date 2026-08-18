import { NextResponse } from "next/server";
import { getSession } from "@/server/auth";
import { prisma } from "@/server/db";
import { createStreamToken, watermark } from "@/server/tokens";
import { resolveEpisodeEntitlement } from "@/server/entitlements";
import { resolveCurrency } from "@/server/currency";
import { getSubscriptionOffer, hasUsedTrial } from "@/server/subscriptions";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });
  const { id } = await params;
  const episode = await prisma.episode.findUnique({
    where: { id },
    include: { series: true, subtitles: { select: { lang: true } } },
  });
  if (!episode) return NextResponse.json({ error: { message: "Not found" } }, { status: 404 });
  const entitlement = await resolveEpisodeEntitlement(session.userId, id);
  if (!entitlement.entitled) {
    const offer = await getSubscriptionOffer("VIP_ANNUAL", resolveCurrency(_request.headers));
    const trialAlreadyUsed = await hasUsedTrial(session.userId);
    return NextResponse.json(
      {
        locked: true,
        coinPrice: episode.coinPrice,
        subscriptionOffer: offer
          ? {
              currency: offer.price.currency,
              amountMinor: offer.price.amountMinor,
              trialAmountMinor: offer.price.trialAmountMinor,
              trialDays: offer.plan.trialDays,
            }
          : null,
        trialAlreadyUsed,
      },
      { status: 403 },
    );
  }
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.userId },
    select: { phone: true },
  });
  const token = createStreamToken(session.userId, id);
  return NextResponse.json({
    playbackUrl: `/api/stream/${token}`,
    isHls: episode.hlsPath.endsWith(".m3u8"),
    watermark: watermark(user.phone, session.userId),
    subtitles: episode.subtitles.map((subtitle) => ({
      lang: subtitle.lang,
      url: `/api/episodes/${id}/subtitles/${subtitle.lang}`,
    })),
    expiresIn: 300,
    entitlement: entitlement.reason,
  });
}
