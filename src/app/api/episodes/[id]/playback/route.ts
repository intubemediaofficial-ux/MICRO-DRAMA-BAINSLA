import { NextResponse } from "next/server";
import { getSession } from "@/server/auth";
import { prisma } from "@/server/db";
import { GUEST_USER_ID, createStreamToken, watermark } from "@/server/tokens";
import { resolveEpisodeEntitlement } from "@/server/entitlements";
import { resolveCurrency } from "@/server/currency";
import { getSubscriptionOffers, hasUsedTrial } from "@/server/subscriptions";
import { getResumePositionForEpisode } from "@/server/watch-history";
import { findPublicEpisode } from "@/server/publishing";

const STREAM_TTL_SECONDS = 1_800;
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  const { id } = await params;
  const episode = await findPublicEpisode(id);
  if (!episode) return NextResponse.json({ error: { message: "Not found" } }, { status: 404 });
  if (!session) {
    const entitlement = await resolveEpisodeEntitlement(null, id);
    if (!entitlement.entitled)
      return NextResponse.json(
        { error: { message: "Unauthorized" }, seriesSlug: episode.series.slug },
        { status: 401 },
      );
    return NextResponse.json({
      seriesSlug: episode.series.slug,
      mediaPath: episode.hlsPath,
      playbackUrl: `/api/stream/${createStreamToken(GUEST_USER_ID, id, STREAM_TTL_SECONDS)}`,
      isHls: episode.hlsPath.endsWith(".m3u8"),
      watermark: "",
      subtitles: episode.subtitles.map((subtitle) => ({
        lang: subtitle.lang,
        label: subtitle.lang,
        format: subtitle.srtPath.toLowerCase().endsWith(".vtt") ? "vtt" : "srt",
        url: `/api/episodes/${id}/subtitles/${subtitle.lang}`,
      })),
      expiresIn: STREAM_TTL_SECONDS,
      entitlement: entitlement.reason,
      resumePositionSec: 0,
    });
  }
  const entitlement = await resolveEpisodeEntitlement(session.userId, id);
  if (!entitlement.entitled) {
    const offers = await getSubscriptionOffers(await resolveCurrency(_request.headers));
    const offer = offers.find((item) => item.plan.trialDays > 0) ?? offers[0] ?? null;
    const trialAlreadyUsed = await hasUsedTrial(session.userId);
    return NextResponse.json(
      {
        locked: true,
        seriesSlug: episode.series.slug,
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
  const token = createStreamToken(session.userId, id, STREAM_TTL_SECONDS);
  const resumePositionSec = await getResumePositionForEpisode(
    session.userId,
    id,
    episode.durationSec,
  );
  return NextResponse.json({
    seriesSlug: episode.series.slug,
    mediaPath: episode.hlsPath,
    playbackUrl: `/api/stream/${token}`,
    isHls: episode.hlsPath.endsWith(".m3u8"),
    watermark: watermark(user.phone, session.userId),
      subtitles: episode.subtitles.map((subtitle) => ({
        lang: subtitle.lang,
        label: subtitle.lang,
        format: subtitle.srtPath.toLowerCase().endsWith(".vtt") ? "vtt" : "srt",
        url: `/api/episodes/${id}/subtitles/${subtitle.lang}`,
    })),
    expiresIn: STREAM_TTL_SECONDS,
    entitlement: entitlement.reason,
    resumePositionSec,
  });
}
