import { describe, expect, it } from "vitest";
import { sanitizeContentHtml } from "@/server/sanitize-html";

describe("CMS HTML sanitization", () => {
  it("removes scripts, event handlers, and javascript links", () => {
    const html = sanitizeContentHtml(
      '<script>alert(1)</script><p onclick="alert(1)">Text</p><a href="javascript:alert(1)">link</a>',
    );
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("<p>Text</p>");
  });

  it("keeps editor tables, justified text, safe YouTube embeds, and CMS columns", () => {
    const html = sanitizeContentHtml(
      '<p style="text-align: justify">Text</p><u>Underlined</u><table><tr><td colspan="2">Cell</td></tr></table><div data-type="columns" class="cms-columns cms-columns-2"><div class="cms-column">A</div></div><iframe src="https://www.youtube-nocookie.com/embed/abc" allowfullscreen></iframe>',
    );
    expect(html).toContain("text-align:justify");
    expect(html).toContain("<u>Underlined</u>");
    expect(html).toContain('colspan="2"');
    expect(html).toContain("cms-columns-2");
    expect(html).toContain("youtube-nocookie.com/embed/abc");
  });

  it("removes non-YouTube iframe hosts and hardens target-blank links", () => {
    const html = sanitizeContentHtml(
      '<iframe src="https://evil.example/embed/x"></iframe><a href="https://example.com" target="_blank">link</a>',
    );
    expect(html).not.toContain("evil.example");
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("removes protocol-relative image sources", () => {
    const html = sanitizeContentHtml('<img src="//evil.com/x.png" alt="remote image">');

    expect(html).not.toContain('src="//evil.com/x.png"');
    expect(html).not.toContain("evil.com");
  });

  it("preserves RGB colors while stripping unsafe style declarations", () => {
    const html = sanitizeContentHtml(
      '<p style="color: rgb(37, 99, 235); background-color: rgba(37, 99, 235, 0.5)">Safe</p><p style="color: rgb(1,2,3);background:url(x);font-family:expression(alert(1))">Unsafe</p>',
    );

    expect(html).toMatch(/color:rgb\(37,\s*99,\s*235\)/);
    expect(html).toMatch(/background-color:rgba\(37,\s*99,\s*235,\s*0\.5\)/);
    expect(html).toContain("rgb(1,2,3)");
    expect(html).not.toContain("background:url");
    expect(html).not.toContain("expression");
  });
});
