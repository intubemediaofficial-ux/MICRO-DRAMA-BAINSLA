import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/microdrama";
  process.env.SESSION_SECRET ??= "test-session-secret-123456";
  process.env.STREAM_TOKEN_SECRET ??= "test-stream-secret-123456";
  process.env.MEDIA_DIR ??= "./public/media";
  return {
    adminSession: vi.fn(),
    serveMediaFile: vi.fn(
      async (_request: Request, _key: string, cacheControl = "private, max-age=60") =>
        new Response("media", { headers: { "cache-control": cacheControl } }),
    ),
  };
});

vi.mock("@/server/admin", () => ({ adminSession: mocks.adminSession }));
vi.mock("@/server/media", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/media")>();
  return { ...actual, serveMediaFile: mocks.serveMediaFile };
});

import { GET } from "@/app/api/media/[...path]/route";

const request = new Request("http://localhost/api/media/episodes/test/master.m3u8");

describe("protected episode media route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("serves HLS manifests and segments to admins without caching", async () => {
    mocks.adminSession.mockResolvedValue({ userId: "admin", role: "ADMIN" });

    for (const path of [
      ["episodes", "test", "master.m3u8"],
      ["episodes", "test", "v0", "index.m3u8"],
      ["episodes", "test", "v0", "seg-000.ts"],
    ]) {
      const response = await GET(request, { params: Promise.resolve({ path }) });

      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    }
    expect(mocks.serveMediaFile).toHaveBeenCalledTimes(3);
  });

  it.each([
    ["guest", new Error("UNAUTHENTICATED")],
    ["normal user", new Error("FORBIDDEN")],
  ])("returns 404 for a %s", async (_requester, error) => {
    mocks.adminSession.mockRejectedValue(error);

    const response = await GET(request, {
      params: Promise.resolve({ path: ["episodes", "test", "master.m3u8"] }),
    });

    expect(response.status).toBe(404);
    expect(mocks.serveMediaFile).not.toHaveBeenCalled();
  });
});
