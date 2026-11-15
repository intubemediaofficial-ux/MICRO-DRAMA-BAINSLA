import { describe, expect, it } from "vitest";
import {
  mergeSiteConfig,
  SEO_GLOBAL_DEFAULTS,
  SeoGlobalSchema,
  THEME_DEFAULTS,
  ThemeSchema,
} from "@/server/site-config";

describe("site configuration defaults", () => {
  it("falls back per field when stored SEO values are invalid", () => {
    const result = mergeSiteConfig(SeoGlobalSchema, SEO_GLOBAL_DEFAULTS, {
      siteName: 42,
      titleTemplates: { home: "%title% - Custom", page: 23 },
      sitemap: { posts: false, episodes: "yes" },
    });

    expect(result.siteName).toBe(SEO_GLOBAL_DEFAULTS.siteName);
    expect(result.titleTemplates.home).toBe("%title% - Custom");
    expect(result.titleTemplates.page).toBe(SEO_GLOBAL_DEFAULTS.titleTemplates.page);
    expect(result.sitemap.posts).toBe(false);
    expect(result.sitemap.episodes).toBe(SEO_GLOBAL_DEFAULTS.sitemap.episodes);
  });

  it("falls back to complete defaults for invalid JSON values", () => {
    expect(mergeSiteConfig(ThemeSchema, THEME_DEFAULTS, "not-json")).toEqual(THEME_DEFAULTS);
  });

  it("rejects invalid robots directives and strips angle brackets from CSS", () => {
    expect(SeoGlobalSchema.safeParse({
      ...SEO_GLOBAL_DEFAULTS,
      robotsExtra: "User-agent: *",
    }).success).toBe(false);
    expect(ThemeSchema.parse({
      ...THEME_DEFAULTS,
      customCss: ".banner { color: red; }<script>alert(1)</script>",
    }).customCss).not.toContain("<");
  });
});
