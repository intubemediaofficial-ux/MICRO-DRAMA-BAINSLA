import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  consumeReferralCode: vi.fn(),
  findOrCreateUser: vi.fn(),
  issueSession: vi.fn(),
  verifyGoogleIdToken: vi.fn(),
  rateLimit: vi.fn(),
  getSettings: vi.fn(),
}));

vi.mock("@/server/auth", () => ({
  consumeReferralCode: mocks.consumeReferralCode,
  findOrCreateUser: mocks.findOrCreateUser,
  issueSession: mocks.issueSession,
}));
vi.mock("@/server/google-auth", () => ({ verifyGoogleIdToken: mocks.verifyGoogleIdToken }));
vi.mock("@/server/rate-limit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("@/server/settings", () => ({ getSettings: mocks.getSettings }));

import { POST } from "@/app/api/auth/google/route";

describe("Google sign-in route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockReturnValue(true);
    mocks.getSettings.mockResolvedValue({ GOOGLE_OAUTH_WEB_CLIENT_ID: "web-client" });
    mocks.verifyGoogleIdToken.mockResolvedValue({ email: "person@example.test", name: "Person" });
    mocks.consumeReferralCode.mockResolvedValue("REF123");
    mocks.findOrCreateUser.mockResolvedValue({ id: "user-id", role: "USER" });
    mocks.issueSession.mockResolvedValue(undefined);
  });

  it("passes an explicit referral code through to account creation", async () => {
    const response = await POST(new Request("http://localhost/api/auth/google", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken: "google-token", referralCode: "  REF123  " }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.consumeReferralCode).toHaveBeenCalledWith("REF123");
    expect(mocks.findOrCreateUser).toHaveBeenCalledWith("person@example.test", "REF123", "Person");
  });
});
