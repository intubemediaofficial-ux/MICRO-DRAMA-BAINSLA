import { generateKeyPairSync, sign } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db";
import { issueSession } from "@/server/auth";
import { createAdToken } from "@/server/tokens";
import { POST as unlock } from "@/app/api/unlocks/route";
import { clearAdmobVerifierKeyCache, verifyAdmobSignature } from "@/server/admob-ssv";

const session = vi.hoisted(() => ({ token: "" }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "microdrama_session" && session.token ? { value: session.token } : undefined,
    set: (_name: string, value: string) => {
      session.token = value;
    },
    delete: () => {
      session.token = "";
    },
  }),
}));

afterEach(() => {
  clearAdmobVerifierKeyCache();
  vi.restoreAllMocks();
});

describe("AdMob SSV signatures", () => {
  it("validates locally signed P-256 messages and rejects tampering", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const pem = publicKey.export({ format: "pem", type: "spki" }).toString();
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ keys: [{ keyId: 17, pem }] })));
    const message = "ad_network=sample&custom_data=token&key_id=17";
    const signature = sign("sha256", Buffer.from(message), {
      key: privateKey,
      dsaEncoding: "der",
    }).toString("base64url");
    expect(await verifyAdmobSignature(`${message}&signature=${signature}`, fetcher as typeof fetch)).toBe(
      true,
    );
    expect(
      await verifyAdmobSignature(
        `ad_network=other&custom_data=token&key_id=17&signature=${signature}`,
        fetcher as typeof fetch,
      ),
    ).toBe(false);
  });

  it("does not unlock an ad reward before its nonce is verified", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const user = await prisma.user.create({
      data: { email: `ssv-${suffix}@test.local`, referralCode: `SSV${suffix}` },
    });
    const series = await prisma.series.create({
      data: {
        slug: `ssv-${suffix}`,
        title: "SSV test",
        synopsis: "Test",
        posterUrl: "/poster.jpg",
        teaserUrl: "",
        genres: [],
        isPublished: true,
      },
    });
    const episode = await prisma.episode.create({
      data: {
        seriesId: series.id,
        number: 1,
        title: "Episode 1",
        durationSec: 60,
        hlsPath: "videos/ssv.m3u8",
        thumbnailUrl: "/poster.jpg",
        coinPrice: 5,
        publishedAt: new Date(),
      },
    });
    await issueSession({ userId: user.id, role: "USER" });
    const token = createAdToken(user.id, episode.id);
    const [userId, episodeId, nonce, exp] = Buffer.from(token.split(".")[0], "base64url")
      .toString()
      .split(".");
    await prisma.adRewardNonce.create({
      data: { nonce, userId, episodeId, expiresAt: new Date(Number(exp) * 1000) },
    });
    const response = await unlock(
      new Request("http://localhost/api/unlocks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ episodeId: episode.id, source: "ad", adToken: token }),
      }),
    );
    expect(response.status).toBe(403);
    expect((await response.json()).error.message).toBe("Ad not verified yet");
    await prisma.adRewardNonce.deleteMany({ where: { nonce } });
    await prisma.episode.delete({ where: { id: episode.id } });
    await prisma.series.delete({ where: { id: series.id } });
    await prisma.user.delete({ where: { id: user.id } });
    session.token = "";
  });
});
