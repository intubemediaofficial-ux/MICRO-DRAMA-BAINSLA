import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";

const cookieState = vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/microdrama";
  process.env.SESSION_SECRET ??= "test-session-secret-123456";
  process.env.STREAM_TOKEN_SECRET ??= "test-stream-secret-123456";
  return { token: "" };
});
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (cookieState.token ? { value: cookieState.token } : undefined),
    set: (_name: string, value: string) => {
      cookieState.token = value;
    },
  }),
}));

import { issueSession } from "../src/server/auth";
import { prisma } from "../src/server/db";
import { POST as usersPost, GET as usersGet } from "../src/app/api/admin/users/route";
import { PATCH as bulkPatch } from "../src/app/api/admin/episodes/bulk/route";
import { DELETE as episodeDelete } from "../src/app/api/admin/episodes/[id]/route";
import { credit } from "../src/server/coins";

const suffix = crypto.randomUUID();
let adminId = "";
let userId = "";
let episodeIds: string[] = [];
let seriesId = "";

describe("admin full-access controls", () => {
  beforeAll(async () => {
    const admin = await prisma.user.create({
      data: {
        email: `admin-${suffix}@test.local`,
        role: "ADMIN",
        referralCode: `AD${suffix.slice(0, 8)}`,
      },
    });
    const user = await prisma.user.create({
      data: { email: `viewer-${suffix}@test.local`, referralCode: `VW${suffix.slice(0, 8)}` },
    });
    adminId = admin.id;
    userId = user.id;
    const series = await prisma.series.create({
      data: {
        slug: `admin-${suffix}`,
        title: "Admin test",
        synopsis: "Admin test",
        posterUrl: "",
        teaserUrl: "",
        genres: [],
        tropeTags: [],
        castNames: [],
        freeEpisodeCount: 0,
        defaultCoinPrice: 10,
      },
    });
    seriesId = series.id;
    const episodes = await Promise.all(
      [1, 2, 3].map((number) =>
        prisma.episode.create({
          data: {
            seriesId,
            number,
            title: `Episode ${number}`,
            durationSec: 90,
            hlsPath: "sample.mp4",
            thumbnailUrl: "",
            coinPrice: 10,
          },
        }),
      ),
    );
    episodeIds = episodes.map((episode) => episode.id);
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [adminId, userId] } } });
    await prisma.series.delete({ where: { id: seriesId } });
  });

  it("rejects a non-admin session on admin mutations", async () => {
    await issueSession({ userId, role: "USER" });
    const response = await usersPost(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ userId, delta: 10, reason: "should fail" }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(response.status).toBe(403);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).coinBalance).toBe(0);
  });

  it("adjusts coins through the ledger invariant", async () => {
    await issueSession({ userId: adminId, role: "ADMIN" });
    const response = await usersPost(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ userId, delta: 25, reason: "Customer support grant" }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(response.status).toBe(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const sum = await prisma.coinTransaction.aggregate({
      where: { userId },
      _sum: { delta: true },
    });
    const adjustment = await prisma.coinTransaction.findFirstOrThrow({
      where: { userId, type: "ADMIN_ADJUST" },
      orderBy: { createdAt: "desc" },
    });
    expect(user.coinBalance).toBe(25);
    expect(sum._sum.delta).toBe(user.coinBalance);
    expect(adjustment.reason).toBe("Customer support grant");
    expect(adjustment.refType).toBe("admin");
    expect(adjustment.refId).toBe(adminId);
  });

  it("updates exactly the selected episodes in bulk", async () => {
    const response = await bulkPatch(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ episodeIds: episodeIds.slice(0, 2), coinPrice: 27, isFree: true }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(response.status).toBe(200);
    const episodes = await prisma.episode.findMany({
      where: { id: { in: episodeIds } },
      orderBy: { number: "asc" },
    });
    expect(
      episodes.slice(0, 2).every((episode) => episode.coinPrice === 27 && episode.isFree),
    ).toBe(true);
    expect(episodes[2].coinPrice).toBe(10);
    expect(episodes[2].isFree).toBe(false);
  });

  it("blocks deletion when an episode has paid history", async () => {
    await credit(userId, 10, "ADMIN_ADJUST", { type: "test", id: userId });
    await prisma.episodeUnlock.create({
      data: { userId, episodeId: episodeIds[2], source: "COIN" },
    });
    const response = await episodeDelete(new Request("http://localhost"), {
      params: Promise.resolve({ id: episodeIds[2] }),
    });
    expect(response.status).toBe(409);
    expect(await prisma.episode.findUnique({ where: { id: episodeIds[2] } })).not.toBeNull();
  });
});
