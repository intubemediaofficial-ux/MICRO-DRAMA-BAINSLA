import { describe, expect, it } from "vitest";
import { buildRobotsMetadata, buildRobotsText } from "@/lib/robots";

describe("robots output", () => {
  it("shares the sitemap and directive builder for metadata and text previews", () => {
    const config = { robotsExtra: "Allow: /public\nDisallow: /private" };
    const text = buildRobotsText(config);
    const metadata = buildRobotsMetadata(config);

    expect(text).toContain("Allow: /public");
    expect(text).toContain("Disallow: /private");
    expect(text).toContain("Sitemap: https://intubedrama.com/sitemap.xml");
    expect(metadata.rules).toEqual({
      userAgent: "*",
      allow: ["/", "/public"],
      disallow: ["/admin", "/api/", "/account", "/wallet", "/private"],
    });
    expect(metadata.sitemap).toBe("https://intubedrama.com/sitemap.xml");
  });
});
