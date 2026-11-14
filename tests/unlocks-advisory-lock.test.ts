import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  unlockEpisode: vi.fn(),
  executeRaw: vi.fn(),
  count: vi.fn(),
  nonceFind: vi.fn(),
  nonceUpdate: vi.fn(),
  upsert: vi.fn(),
  transaction: vi.fn(),
  verifyAdToken: vi.fn(),
  rateLimit: vi.fn(),
  findPublicEpisode: vi.fn(),
  order: [] as string[],
}));

vi.mock("@/server/auth", () => ({ getSession: mocks.getSession }));
vi.mock("@/server/coins", () => ({ unlockEpisode: mocks.unlockEpisode }));
vi.mock("@/server/db", () => ({
  prisma: {
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/server/tokens", () => ({ verifyAdToken: mocks.verifyAdToken }));
vi.mock("@/server/rate-limit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("@/server/publishing", () => ({ findPublicEpisode: mocks.findPublicEpisode }));

import { POST } from "@/app/api/unlocks/route";

describe("ad unlock concurrency guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.order = [];
    mocks.getSession.mockResolvedValue({ userId: "user-1" });
    mocks.rateLimit.mockReturnValue(true);
    mocks.findPublicEpisode.mockResolvedValue({ id: "episode-1" });
    mocks.verifyAdToken.mockReturnValue({ userId: "user-1", episodeId: "episode-1", nonce: "nonce-1" });
    mocks.executeRaw.mockImplementation(async () => {
      mocks.order.push("lock");
      return 0;
    });
    mocks.count.mockImplementation(async () => {
      mocks.order.push("count");
      return 10;
    });
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        $executeRaw: mocks.executeRaw,
        episodeUnlock: { count: mocks.count, upsert: mocks.upsert },
        adRewardNonce: { findUnique: mocks.nonceFind, updateMany: mocks.nonceUpdate },
      }),
    );
  });

  it("checks the daily limit after taking the user lock inside the transaction", async () => {
    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ episodeId: "episode-1", source: "ad", adToken: "ad-token" }),
      }),
    );

    expect(response.status).toBe(429);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.order).toEqual(["lock", "count"]);
    expect(mocks.executeRaw.mock.calls[0][0].join("")).toContain("pg_advisory_xact_lock");
    expect(mocks.nonceFind).not.toHaveBeenCalled();
    expect(mocks.nonceUpdate).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
