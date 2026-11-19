import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/settings", () => ({
  getSettings: async () => ({
    RAZORPAY_KEY_ID: "public-key-id",
    RAZORPAY_KEY_SECRET: "never-return-this-secret",
    RAZORPAY_WEBHOOK_SECRET: "never-return-this-webhook",
    PAYMENTS_ENABLED: false,
    ADS_ENABLED: true,
    ADMOB_REWARDED_UNIT_ID: "ca-app-pub/test-unit",
    GOOGLE_OAUTH_WEB_CLIENT_ID: "google-client",
    FIREBASE_ANDROID_APP_ID: "android-app",
    FIREBASE_API_KEY: "firebase-api",
    FIREBASE_PROJECT_ID: "firebase-project",
    FIREBASE_SENDER_ID: "firebase-sender",
    FIREBASE_SERVICE_ACCOUNT_JSON: '{"private_key":"never-return-this"}',
    REFERRAL_BONUS_COINS: 50,
  }),
}));

import { GET } from "@/app/api/mobile/config/route";

describe("mobile config", () => {
  it("returns public configuration without secret values and is briefly cacheable", async () => {
    const response = await GET();
    const body = await response.text();
    expect(response.headers.get("cache-control")).toContain("max-age=60");
    expect(body).not.toContain("never-return-this");
    expect(body).not.toContain("private_key");
    expect(JSON.parse(body)).toMatchObject({
      paymentsEnabled: false,
      adsEnabled: true,
      admobRewardedUnitId: "ca-app-pub/test-unit",
      googleWebClientId: "google-client",
      firebase: {
        appId: "android-app",
        apiKey: "firebase-api",
        projectId: "firebase-project",
        senderId: "firebase-sender",
      },
      referralBonusCoins: 50,
      checkinRewards: [5, 8, 12, 16, 22, 30, 50],
    });
  });
});
