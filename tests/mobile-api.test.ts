import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

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
    delete: () => {
      cookieState.token = "";
    },
  }),
}));

import { issueSession } from "../src/server/auth";
import { prisma } from "../src/server/db";
import { GET as homeGet } from "../src/app/api/mobile/home/route";
import { GET as seriesGet } from "../src/app/api/mobile/series/[slug]/route";
import { GET as meGet } from "../src/app/api/mobile/me/route";
import { GET as searchGet } from "../src/app/api/mobile/search/route";
import { POST as logoutPost } from "../src/app/api/auth/logout/route";

const suffix = crypto.randomUUID().slice(0, 8);
const slug = `mobile-${suffix}`;
let userId = "";

describe("mobile api", () => {
  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { email: `mobile-${suffix}@test.local`, referralCode: `MB${suffix}` },
    });
    userId = user.id;
    await prisma.series.create({
      data: {
        slug,
        title: `Mobile ${suffix}`,
        synopsis: "Mobile",
        posterUrl: "/p.jpg",
        teaserUrl: "",
        genres: ["Romance"],
        tropeTags: [],
        castNames: [],
        freeEpisodeCount: 1,
        defaultCoinPrice: 10,
        isPublished: true,
        episodes: {
          create: [1, 2].map((number) => ({
            number,
            title: `Ep ${number}`,
            hlsPath: "sample.mp4",
            thumbnailUrl: "",
            durationSec: 30,
            coinPrice: 10,
          })),
        },
      },
    });
  });
  afterAll(async () => {
    await prisma.episode.deleteMany({ where: { series: { slug } } });
    await prisma.series.deleteMany({ where: { slug } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  it("serves home rails, series detail with access, search and account", async () => {
    const home = await (await homeGet()).json();
    expect(Array.isArray(home.rails)).toBe(true);

    const params = { params: Promise.resolve({ slug }) };
    const detail = await (await seriesGet(new Request("http://x"), params)).json();
    const episodes = detail.seasons[0].episodes;
    expect(episodes.map((e: { access: string }) => e.access)).toEqual(["FREE", "LOCKED"]);

    const search = await (await searchGet(new Request(`http://x?q=${suffix}`))).json();
    expect(search.items[0]).toMatchObject({ slug, firstEpisodeId: episodes[0].id });

    cookieState.token = "";
    expect((await meGet(new Request("http://x"))).status).toBe(401);
    await issueSession({ userId, role: "USER" });
    const me = await (await meGet(new Request("http://x"))).json();
    expect(me).toMatchObject({ user: { id: userId }, vipActive: false, subscription: null });
    await logoutPost();
    expect(cookieState.token).toBe("");
  });
});
