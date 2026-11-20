import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updateMany: vi.fn(),
  verifySignature: vi.fn(),
  verifyToken: vi.fn(),
  getSettings: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  prisma: { adRewardNonce: { updateMany: mocks.updateMany } },
}));

vi.mock("@/server/admob-ssv", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/admob-ssv")>();
  return { ...actual, verifyAdmobSignature: mocks.verifySignature };
});

vi.mock("@/server/tokens", () => ({ verifyAdToken: mocks.verifyToken }));
vi.mock("@/server/settings", () => ({ getSettings: mocks.getSettings }));

import { GET } from "@/app/api/ads/admob-ssv/route";

function callback(adUnit: string) {
  return new Request(
    `http://localhost/api/ads/admob-ssv?ad_unit=${encodeURIComponent(adUnit)}&custom_data=token&signature=sig&key_id=1`,
  );
}

describe("AdMob SSV ad-unit validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifySignature.mockResolvedValue(true);
    mocks.verifyToken.mockReturnValue({ nonce: "nonce", userId: "user", episodeId: "episode" });
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.getSettings.mockResolvedValue({
      ADMOB_REWARDED_UNIT_ID: "ca-app-pub-1234567890123456/9876543210",
    });
  });

  it("accepts the configured unit suffix and full ID", async () => {
    const suffixResponse = await GET(callback("9876543210"));
    expect(suffixResponse.status).toBe(200);

    const fullIdResponse = await GET(callback("ca-app-pub-1234567890123456/9876543210"));
    expect(fullIdResponse.status).toBe(200);
    expect(mocks.updateMany).toHaveBeenCalledTimes(2);
  });

  it("rejects mismatched units and missing configuration", async () => {
    expect((await GET(callback("wrong-unit"))).status).toBe(403);
    mocks.getSettings.mockResolvedValue({ ADMOB_REWARDED_UNIT_ID: undefined });
    expect((await GET(callback("9876543210"))).status).toBe(403);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
});
