import { NextResponse } from "next/server";
import { CHECKIN_REWARDS } from "@/server/coins";
import { razorpayConfigured } from "@/server/razorpay";
import { getSettings } from "@/server/settings";

export async function GET() {
  const [settings, paymentsEnabled] = await Promise.all([getSettings(), razorpayConfigured()]);
  const firebase =
    settings.FIREBASE_ANDROID_APP_ID &&
    settings.FIREBASE_API_KEY &&
    settings.FIREBASE_PROJECT_ID &&
    settings.FIREBASE_SENDER_ID
      ? {
          appId: settings.FIREBASE_ANDROID_APP_ID,
          apiKey: settings.FIREBASE_API_KEY,
          projectId: settings.FIREBASE_PROJECT_ID,
          senderId: settings.FIREBASE_SENDER_ID,
        }
      : null;
  return NextResponse.json(
    {
      paymentsEnabled,
      adsEnabled: Boolean(settings.ADS_ENABLED && settings.ADMOB_REWARDED_UNIT_ID),
      admobRewardedUnitId: settings.ADMOB_REWARDED_UNIT_ID ?? null,
      googleWebClientId: settings.GOOGLE_OAUTH_WEB_CLIENT_ID ?? null,
      firebase,
      referralBonusCoins: settings.REFERRAL_BONUS_COINS,
      checkinRewards: CHECKIN_REWARDS,
    },
    { headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } },
  );
}
