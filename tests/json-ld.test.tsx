import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { JsonLd } from "@/components/json-ld";
import { breadcrumbList, schemaTypeFor } from "@/server/structured-data";

describe("structured data", () => {
  it("escapes less-than characters in JSON-LD output", () => {
    const html = renderToStaticMarkup(<JsonLd data={{ text: "</script><script>bad</script>" }} />);
    expect(html).toContain("\\u003c/script>");
    expect(html).not.toContain("</script><script>");
  });

  it("builds breadcrumbs and applies automatic schema mappings", () => {
    expect(breadcrumbList([{ name: "Home", url: "https://intubedrama.com/" }]).itemListElement[0])
      .toMatchObject({ position: 1, name: "Home" });
    expect(schemaTypeFor("post", "Auto")).toBe("BlogPosting");
    expect(schemaTypeFor("series", "None")).toBe("None");
  });
});
