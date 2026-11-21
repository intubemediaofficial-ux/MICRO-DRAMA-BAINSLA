import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getTheme: vi.fn() }));

vi.mock("@/server/site-config", () => ({ getTheme: mocks.getTheme }));

import { GET } from "@/app/favicon.ico/route";

describe("favicon route", () => {
  it("redirects to the configured theme favicon", async () => {
    mocks.getTheme.mockResolvedValue({ faviconUrl: "https://cdn.example.test/brand.ico" });

    const response = await GET();

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://cdn.example.test/brand.ico");
  });

  it("falls back to the SVG icon when no theme favicon is configured", async () => {
    mocks.getTheme.mockResolvedValue({ faviconUrl: undefined });

    const response = await GET();

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("/icon.svg");
  });
});
