import { describe, expect, it } from "vitest";
import { publicContentWhere } from "@/server/publishing";

describe("public content visibility", () => {
  it("includes published content and scheduled content at or before now", () => {
    const now = new Date("2026-11-15T12:00:00.000Z");
    expect(publicContentWhere(now)).toEqual({
      OR: [
        { status: "PUBLISHED" },
        { status: "SCHEDULED", publishedAt: { lte: now } },
      ],
    });
  });
});
