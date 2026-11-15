import { describe, expect, it, vi } from "vitest";
import { SEO_GLOBAL_DEFAULTS } from "@/server/site-config";

vi.mock("@/server/site-config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/site-config")>();
  return { ...actual, getSeoGlobal: vi.fn(async () => SEO_GLOBAL_DEFAULTS) };
});

import { buildMetadata } from "@/server/seo";

describe("SEO metadata", () => {
  it("uses an absolute title and canonical URL without appending a second template", async () => {
    const metadata = await buildMetadata({
      kind: "page",
      path: "/about",
      title: "About",
      seo: { title: "About Intube Drama" },
    });

    expect(metadata.title).toEqual({ absolute: "About Intube Drama" });
    expect(metadata.alternates?.canonical).toBe("https://intubedrama.com/about");
  });

  it("renders tokens in per-content SEO titles and descriptions", async () => {
    const metadata = await buildMetadata({
      kind: "page",
      path: "/about",
      title: "About",
      seo: {
        title: "%title% %sep% %sitename%",
        description: "Read %title% %sep% %sitename%",
      },
    });

    expect(metadata.title).toEqual({ absolute: "About | Intube Drama" });
    expect(metadata.description).toBe("Read About | Intube Drama");
  });

  it("sets noindex and nofollow robots directives", async () => {
    const metadata = await buildMetadata({
      kind: "search",
      path: "/search?q=drama",
      title: "Search",
      seo: { nofollow: true },
    });
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
