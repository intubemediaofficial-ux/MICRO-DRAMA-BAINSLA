import { Prisma } from "@prisma/client";
import { z } from "zod";
import { SeoFieldsSchema } from "@/lib/seo";
import { sanitizeContentHtml } from "./sanitize-html";

export const contentStatusSchema = z.enum(["DRAFT", "PUBLISHED", "SCHEDULED"]);
export const emptyContentJson = { type: "doc", content: [{ type: "paragraph" }] };

export const contentFields = {
  slug: z.string().trim().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().trim().min(1).max(200),
  contentJson: z.record(z.string(), z.unknown()).default(emptyContentJson),
  contentHtml: z.string().max(1_000_000).default("<p></p>"),
  excerpt: z.string().max(1000).nullable().optional(),
  featuredImage: z.string().max(2048).nullable().optional(),
  status: contentStatusSchema,
  publishedAt: z.coerce.date().nullable().optional(),
  seo: z.unknown().nullable().optional(),
};

export const contentFieldsPatch = {
  slug: contentFields.slug.optional(),
  title: contentFields.title.optional(),
  contentJson: z.record(z.string(), z.unknown()).optional(),
  contentHtml: z.string().max(1_000_000).optional(),
  excerpt: z.string().max(1000).nullable().optional(),
  featuredImage: z.string().max(2048).nullable().optional(),
  status: contentStatusSchema.optional(),
  publishedAt: z.coerce.date().nullable().optional(),
  seo: z.unknown().nullable().optional(),
};

export function sanitizedSeo(value: unknown) {
  if (value === null) return Prisma.DbNull;
  if (value === undefined) return undefined;
  const parsed = SeoFieldsSchema.safeParse(value);
  if (!parsed.success) throw new Error("INVALID_SEO");
  return parsed.data as Prisma.InputJsonValue;
}

export function sanitizedContentHtml(value: string) {
  return sanitizeContentHtml(value);
}

export function publicationDate(status: z.infer<typeof contentStatusSchema>, date?: Date | null) {
  if (status === "DRAFT") return null;
  if (status === "PUBLISHED") return date ?? new Date();
  if (!date) throw new Error("SCHEDULE_DATE_REQUIRED");
  return date;
}
