import { z } from "zod";

const canonicalSchema = z.string().trim().max(2048).refine((value) => {
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}, "Canonical URL must be an HTTPS URL or an absolute path");

export const SeoFieldsSchema = z.object({
  title: z.string().trim().max(120).optional(),
  description: z.string().trim().max(320).optional(),
  focusKeyword: z.string().trim().max(120).optional(),
  keywords: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  canonical: canonicalSchema.optional(),
  noindex: z.boolean().optional(),
  nofollow: z.boolean().optional(),
  breadcrumbTitle: z.string().trim().max(120).optional(),
  ogTitle: z.string().trim().max(120).optional(),
  ogDescription: z.string().trim().max(320).optional(),
  ogImage: canonicalSchema.optional(),
  twitterCard: z.enum(["summary_large_image", "summary"]).optional(),
  schemaType: z.enum([
    "Auto",
    "WebPage",
    "AboutPage",
    "ContactPage",
    "Article",
    "BlogPosting",
    "NewsArticle",
    "FAQPage",
    "TVSeries",
    "TVEpisode",
    "None",
  ]).optional(),
  faq: z.array(z.object({
    question: z.string().trim().min(1).max(500),
    answer: z.string().trim().min(1).max(5000),
  })).max(30).optional(),
});

export type SeoFields = z.infer<typeof SeoFieldsSchema>;

export type TitleTemplateVariables = Partial<
  Record<
    "title" | "sitename" | "sep" | "tagline" | "excerpt" | "category" | "series" | "episode" | "page",
    string | number | null | undefined
  >
>;

export function renderTitleTemplate(template: string, vars: TitleTemplateVariables) {
  return template
    .replace(/%([a-z]+)%/gi, (_, token: string) => {
      const value = vars[token.toLowerCase() as keyof TitleTemplateVariables];
      return value === null || value === undefined ? "" : String(value);
    })
    .replace(/\s+/g, " ")
    .replace(/^\s*[|·]+\s*|\s*[|·]+\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
