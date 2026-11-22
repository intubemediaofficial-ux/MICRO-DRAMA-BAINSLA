import { describe, expect, it, vi } from "vitest";

const storedSettings = vi.hoisted(() => new Map<string, string>());

vi.mock("@/server/db", () => ({
  prisma: {
    appSetting: {
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) => {
        const value = storedSettings.get(where.key);
        return value === undefined ? null : { value };
      }),
      upsert: vi.fn(async ({ where, create, update }: {
        where: { key: string };
        create: { value: string };
        update: { value: string };
      }) => {
        storedSettings.set(where.key, create.value ?? update.value);
      }),
    },
  },
}));

import {
  getSeoGlobal,
  getTheme,
  invalidateSiteConfigCache,
  mergeSiteConfig,
  SEO_GLOBAL_DEFAULTS,
  SeoGlobalSchema,
  saveSeoGlobal,
  saveTheme,
  resetTheme,
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

  it("stores and reads optional analytics IDs absent from the defaults", async () => {
    storedSettings.clear();
    await saveSeoGlobal({ analytics: { ga4Id: "G-EXAMPLE123" } }, "admin-test");

    expect(JSON.parse(storedSettings.get("SEO_GLOBAL")!)).toMatchObject({
      analytics: { ga4Id: "G-EXAMPLE123" },
    });
    expect(await getSeoGlobal()).toMatchObject({
      analytics: { ga4Id: "G-EXAMPLE123" },
    });
  });

  it("removes optional logo and social values when resetting the theme", async () => {
    storedSettings.clear();
    invalidateSiteConfigCache("THEME");
    await saveTheme({
      logoUrl: "/media/logo.svg",
      social: { instagram: "https://instagram.com/intube" },
    }, "admin-test");
    expect(await getTheme()).toMatchObject({
      logoUrl: "/media/logo.svg",
      social: { instagram: "https://instagram.com/intube" },
    });

    await resetTheme("admin-test");

    expect(await getTheme()).toEqual(THEME_DEFAULTS);
    expect(JSON.parse(storedSettings.get("THEME")!)).toEqual(THEME_DEFAULTS);
  });
});
