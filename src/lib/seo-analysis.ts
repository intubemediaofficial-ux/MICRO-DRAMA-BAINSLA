export type SeoContentKind = "page" | "post" | "series" | "episode";
export type SeoCheckStatus = "pass" | "warn" | "fail";

export function seoPreviewPath(kind: SeoContentKind, slug: string) {
  const segment = slug.trim().replace(/^\/+|\/+$/g, "") || "your-slug";
  if (kind === "post") return `/blog/${segment}`;
  if (kind === "series") return `/series/${segment}`;
  if (kind === "episode") return `/watch/${segment}`;
  return `/${segment}`;
}

export type SeoCheck = {
  id: string;
  label: string;
  status: SeoCheckStatus;
};

export type SeoAnalysis = {
  score: number;
  checks: SeoCheck[];
};

function plainText(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function countOccurrences(text: string, keyword: string) {
  if (!keyword) return 0;
  const haystack = text.toLocaleLowerCase();
  const needle = keyword.toLocaleLowerCase();
  let count = 0;
  let index = 0;
  while ((index = haystack.indexOf(needle, index)) !== -1) {
    count += 1;
    index += needle.length;
  }
  return count;
}

function wordCount(text: string) {
  return text.match(/\b[\p{L}\p{N}’'-]+\b/gu)?.length ?? 0;
}

function linkHrefs(html: string) {
  return Array.from(html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi))
    .map((match) => match[1]);
}

export function analyzeSeo(input: {
  kind: SeoContentKind;
  title: string;
  seoTitle?: string;
  description: string;
  slug: string;
  html: string;
  focusKeyword?: string;
}): SeoAnalysis {
  const checks: SeoCheck[] = [];
  const add = (id: string, label: string, status: SeoCheckStatus) => {
    checks.push({ id, label, status });
  };
  const keyword = input.focusKeyword?.trim() ?? "";
  const title = (input.seoTitle?.trim() || input.title).trim();
  const description = input.description.trim();
  const text = plainText(input.html);
  const words = wordCount(text);

  add("focus-keyword", "Focus keyword is set", keyword ? "pass" : "fail");

  const titleKeywordIndex = keyword ? title.toLocaleLowerCase().indexOf(keyword.toLocaleLowerCase()) : -1;
  add("keyword-title", "Focus keyword appears in the SEO title", titleKeywordIndex >= 0 ? "pass" : "fail");
  add(
    "keyword-title-position",
    "Focus keyword appears near the start of the SEO title",
    titleKeywordIndex === -1 ? "fail" : titleKeywordIndex <= Math.max(10, title.length * 0.25) ? "pass" : "warn",
  );
  add(
    "keyword-description",
    "Focus keyword appears in the description",
    keyword && description.toLocaleLowerCase().includes(keyword.toLocaleLowerCase()) ? "pass" : "fail",
  );
  add(
    "keyword-slug",
    "Focus keyword appears in the slug",
    keyword && input.slug.toLocaleLowerCase().includes(keyword.toLocaleLowerCase().replace(/\s+/g, "-"))
      ? "pass"
      : "warn",
  );

  add(
    "seo-title-length",
    "SEO title is 30–60 characters",
    title.length >= 30 && title.length <= 60 ? "pass" : title.length >= 25 && title.length <= 70 ? "warn" : "fail",
  );
  add(
    "description-length",
    "Description is 120–160 characters",
    description.length >= 120 && description.length <= 160
      ? "pass"
      : description.length >= 100 && description.length <= 180
        ? "warn"
        : "fail",
  );

  if (input.kind !== "series" && input.kind !== "episode") {
    const threshold = input.kind === "post" ? 600 : 300;
    add(
      "word-count",
      `Content has at least ${threshold} words`,
      words >= threshold ? "pass" : words >= threshold * 0.75 ? "warn" : "fail",
    );
    const keywordCount = countOccurrences(text, keyword);
    const density = words ? (keywordCount / words) * 100 : 0;
    add(
      "keyword-density",
      "Focus keyword density is 0.5–2.5%",
      density >= 0.5 && density <= 2.5 ? "pass" : density > 0 && density <= 4 ? "warn" : "fail",
    );

    const firstTenPercent = text.slice(0, Math.ceil(text.length * 0.1)).toLocaleLowerCase();
    add(
      "keyword-introduction",
      "Focus keyword appears near the beginning of the content",
      keyword && firstTenPercent.includes(keyword.toLocaleLowerCase()) ? "pass" : "warn",
    );
    const headings = Array.from(input.html.matchAll(/<h[23]\b[^>]*>([\s\S]*?)<\/h[23]>/gi))
      .map((match) => plainText(match[1]).toLocaleLowerCase());
    add(
      "keyword-heading",
      "Focus keyword appears in an H2 or H3 heading",
      keyword && headings.some((heading) => heading.includes(keyword.toLocaleLowerCase())) ? "pass" : "warn",
    );

    const hrefs = linkHrefs(input.html);
    add(
      "internal-link",
      "Content has an internal link",
      hrefs.some((href) => href.startsWith("/") || href.startsWith("https://intubedrama.com/")) ? "pass" : "warn",
    );
    add(
      "external-link",
      "Content has an external link",
      hrefs.some((href) => /^https?:\/\//i.test(href) && !/^https:\/\/intubedrama\.com(?:\/|$)/i.test(href))
        ? "pass"
        : "warn",
    );

    const images = Array.from(input.html.matchAll(/<img\b([^>]*)>/gi)).map((match) => match[1]);
    add(
      "image-alt",
      "Every image has descriptive alt text",
      images.every((attributes) => /\balt\s*=\s*["'][^"']+["']/i.test(attributes)) ? "pass" : "warn",
    );
    if (input.kind === "post") {
      add("post-image", "Post includes an image", images.length > 0 ? "pass" : "warn");
    }
  }

  const score = checks.length
    ? Math.round((checks.reduce((total, check) => total + (check.status === "pass" ? 1 : check.status === "warn" ? 0.5 : 0), 0) / checks.length) * 100)
    : 0;
  return { score, checks };
}

export function readingMinutes(html: string) {
  return Math.max(1, Math.ceil(wordCount(plainText(html)) / 200));
}
