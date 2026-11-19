import { describe, expect, it } from "vitest";
import { analyzeSeo, readingMinutes, seoPreviewPath } from "@/lib/seo-analysis";

const body = `
  <h2>room 404 stories</h2>
  <p>${"Room 404 is a suspenseful drama. ".repeat(110)}</p>
  <a href="/series/room-404">Explore the series</a>
  <a href="https://example.com">Read more</a>
  <img src="/poster.jpg" alt="Room 404 poster">
`;

describe("SEO analysis", () => {
  it("builds the preview URL path for each content kind", () => {
    expect(seoPreviewPath("page", "about")).toBe("/about");
    expect(seoPreviewPath("post", "editor-tips")).toBe("/blog/editor-tips");
    expect(seoPreviewPath("series", "room-404")).toBe("/series/room-404");
    expect(seoPreviewPath("episode", "episode-id")).toBe("/watch/episode-id");
  });

  it("checks keywords, content length, links, and images", () => {
    const result = analyzeSeo({
      kind: "post",
      title: "Room 404",
      seoTitle: "Room 404 Stories and Secrets | Intube Drama",
      description: `Room 404 is a suspenseful drama. ${"Discover every twist. ".repeat(6)}`,
      slug: "room-404-stories",
      html: body,
      focusKeyword: "room 404",
    });

    expect(result.score).toBeGreaterThan(50);
    expect(result.checks.find((check) => check.id === "keyword-title")?.status).toBe("pass");
    expect(result.checks.find((check) => check.id === "internal-link")?.status).toBe("pass");
    expect(result.checks.find((check) => check.id === "external-link")?.status).toBe("pass");
    expect(result.checks.find((check) => check.id === "post-image")?.status).toBe("pass");
  });

  it("raises the score when a focus keyword is added", () => {
    const base = {
      kind: "page" as const,
      title: "Story",
      seoTitle: "Story page | Intube Drama",
      description: "A short story from Intube Drama.",
      slug: "story",
      html: "<p>A short story.</p>",
    };
    const withoutKeyword = analyzeSeo(base);
    const withKeyword = analyzeSeo({ ...base, focusKeyword: "story" });
    expect(withKeyword.score).toBeGreaterThan(withoutKeyword.score);
  });

  it("skips content checks for series and calculates reading time at 200 words per minute", () => {
    const series = analyzeSeo({
      kind: "series",
      title: "Room 404",
      description: "A suspenseful drama series.",
      slug: "room-404",
      html: "<p>Short synopsis.</p>",
      focusKeyword: "room 404",
    });
    expect(series.checks.some((check) => check.id === "word-count")).toBe(false);
    expect(readingMinutes(`<p>${"word ".repeat(401)}</p>`)).toBe(3);
    expect(readingMinutes("<p>Short text</p>")).toBe(1);
  });
});
