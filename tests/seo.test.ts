import { describe, expect, it } from "vitest";
import { renderTitleTemplate, SeoFieldsSchema } from "@/lib/seo";

describe("SEO fields and title templates", () => {
  it("renders supported variables and removes empty separators", () => {
    expect(renderTitleTemplate("%title% %sep% %sitename%", {
      title: "A Story",
      sep: "|",
      sitename: "Intube Drama",
    })).toBe("A Story | Intube Drama");
    expect(renderTitleTemplate("%title% %sep% %sitename%", {
      title: "",
      sep: "|",
      sitename: "Intube Drama",
    })).toBe("Intube Drama");
    expect(renderTitleTemplate("%series% · Episode %episode% %sep% %sitename%", {
      series: "Room 404",
      episode: 2,
      sep: "|",
      sitename: "Intube Drama",
    })).toBe("Room 404 · Episode 2 | Intube Drama");
  });

  it("validates supported SEO fields and canonical URLs", () => {
    expect(SeoFieldsSchema.safeParse({
      title: "A title",
      canonical: "/stories/a-title",
      keywords: ["drama"],
      schemaType: "Article",
    }).success).toBe(true);
    expect(SeoFieldsSchema.safeParse({ canonical: "http://example.com/page" }).success).toBe(false);
    expect(SeoFieldsSchema.safeParse({ keywords: Array.from({ length: 21 }, (_, index) => `${index}`) }).success)
      .toBe(false);
  });
});
