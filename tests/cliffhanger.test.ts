import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  adminSession: vi.fn(),
  series: vi.fn(),
  progress: vi.fn(),
  log: vi.fn(),
  transaction: vi.fn(),
  tokens: vi.fn(),
  isFcmConfigured: vi.fn(),
  sendFcmNotifications: vi.fn(),
}));

vi.mock("@/server/admin", () => ({ adminSession: mocks.adminSession }));
vi.mock("@/server/db", () => ({
  prisma: {
    series: { findUniqueOrThrow: mocks.series },
    watchProgress: { findMany: mocks.progress },
    notificationLog: { create: mocks.log },
    deviceToken: { findMany: mocks.tokens },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/server/fcm", () => ({
  isFcmConfigured: mocks.isFcmConfigured,
  sendFcmNotifications: mocks.sendFcmNotifications,
}));

import { POST } from "@/app/api/admin/push/cliffhanger/route";

describe("cliffhanger dry run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.adminSession.mockResolvedValue({ userId: "admin" });
    mocks.series.mockResolvedValue({ title: "Series", slug: "series", episodes: [{ number: 1 }, { number: 2 }] });
    mocks.progress.mockResolvedValue([{ userId: "user", episode: { number: 1 } }]);
    mocks.log.mockResolvedValue({ id: "log" });
    mocks.transaction.mockImplementation((operations) => Promise.all(operations));
    mocks.isFcmConfigured.mockResolvedValue(true);
    mocks.tokens.mockResolvedValue([{ token: "device-token" }]);
    mocks.sendFcmNotifications.mockResolvedValue({ configured: true, sent: 1, failed: 0 });
  });

  it("does not send real notifications during a dry run", async () => {
    const response = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ seriesId: "series", dryRun: true }),
    }));
    expect(response.status).toBe(200);
    expect(mocks.sendFcmNotifications).not.toHaveBeenCalled();
    expect(mocks.tokens).not.toHaveBeenCalled();
    expect(mocks.log).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ dryRun: true }),
    }));
  });
});
