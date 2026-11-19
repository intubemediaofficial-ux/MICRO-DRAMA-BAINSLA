import { describe, expect, it } from "vitest";
import { cmsSearchWhere, matchesCmsSearch } from "@/lib/cms-search";

describe("CMS admin search", () => {
  it("matches page and post titles or slugs case-insensitively", () => {
    expect(cmsSearchWhere(" Room 404 ")).toEqual({
      OR: [
        { title: { contains: "Room 404", mode: "insensitive" } },
        { slug: { contains: "Room 404", mode: "insensitive" } },
      ],
    });
    expect(matchesCmsSearch("room", "Contact", "Room 404")).toBe(true);
    expect(matchesCmsSearch("room", "contact", "privacy")).toBe(false);
    expect(cmsSearchWhere("  ")).toEqual({});
  });
});
