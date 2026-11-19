import type { SeoFields } from "@/lib/seo";
import type { SeoKind } from "./seo";

const CONTEXT = "https://schema.org";

export type BreadcrumbItem = { name: string; url: string };

export function breadcrumbList(items: BreadcrumbItem[]) {
  return {
    "@context": CONTEXT,
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function articleSchema(input: {
  type?: "Article" | "BlogPosting" | "NewsArticle";
  title: string;
  description: string;
  url: string;
  image?: string | null;
  publishedAt?: Date | null;
  modifiedAt?: Date | null;
  authorName?: string;
  organizationName?: string;
  organizationLogo?: string;
}) {
  return {
    "@context": CONTEXT,
    "@type": input.type || "BlogPosting",
    headline: input.title,
    description: input.description,
    mainEntityOfPage: { "@type": "WebPage", "@id": input.url },
    ...(input.image ? { image: [input.image] } : {}),
    ...(input.publishedAt ? { datePublished: input.publishedAt.toISOString() } : {}),
    ...(input.modifiedAt ? { dateModified: input.modifiedAt.toISOString() } : {}),
    author: { "@type": "Person", name: input.authorName || input.organizationName || "Intube Drama" },
    publisher: {
      "@type": "Organization",
      name: input.organizationName || "Intube Drama",
      ...(input.organizationLogo
        ? { logo: { "@type": "ImageObject", url: input.organizationLogo } }
        : {}),
    },
  };
}

export function webPageSchema(input: {
  type?: "WebPage" | "AboutPage" | "ContactPage";
  title: string;
  description: string;
  url: string;
}) {
  return {
    "@context": CONTEXT,
    "@type": input.type || "WebPage",
    name: input.title,
    description: input.description,
    url: input.url,
  };
}

export function faqPageSchema(faq: NonNullable<SeoFields["faq"]>) {
  return {
    "@context": CONTEXT,
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}

export function tvSeriesSchema(input: {
  name: string;
  description: string;
  url: string;
  image?: string;
  genres?: string[];
  actors?: string[];
  episodeCount?: number;
}) {
  return {
    "@context": CONTEXT,
    "@type": "TVSeries",
    name: input.name,
    description: input.description,
    url: input.url,
    ...(input.image ? { image: input.image } : {}),
    ...(input.genres?.length ? { genre: input.genres } : {}),
    ...(input.actors?.length
      ? { actor: input.actors.map((name) => ({ "@type": "Person", name })) }
      : {}),
    ...(input.episodeCount !== undefined ? { numberOfEpisodes: input.episodeCount } : {}),
  };
}

export function tvEpisodeSchema(input: {
  name: string;
  description: string;
  url: string;
  episodeNumber: number;
  seriesName: string;
  seriesUrl: string;
  thumbnailUrl?: string;
  durationSec?: number;
  publishedAt?: Date | null;
}) {
  return {
    "@context": CONTEXT,
    "@type": "TVEpisode",
    name: input.name,
    description: input.description,
    url: input.url,
    episodeNumber: input.episodeNumber,
    partOfSeries: { "@type": "TVSeries", name: input.seriesName, url: input.seriesUrl },
    ...(input.thumbnailUrl ? { thumbnailUrl: input.thumbnailUrl } : {}),
    ...(input.durationSec !== undefined
      ? { timeRequired: `PT${Math.max(0, Math.floor(input.durationSec))}S` }
      : {}),
    ...(input.publishedAt ? { datePublished: input.publishedAt.toISOString() } : {}),
  };
}

export function blogCollectionSchema(input: {
  name: string;
  description: string;
  url: string;
  posts: Array<{ title: string; url: string }>;
}) {
  return {
    "@context": CONTEXT,
    "@type": "Blog",
    name: input.name,
    description: input.description,
    url: input.url,
    blogPost: input.posts.map((post) => ({
      "@type": "BlogPosting",
      headline: post.title,
      url: post.url,
    })),
  };
}

export function schemaTypeFor(kind: SeoKind, requested?: SeoFields["schemaType"]) {
  if (requested && requested !== "Auto") return requested;
  const automatic: Record<SeoKind, NonNullable<SeoFields["schemaType"]>> = {
    home: "WebPage",
    page: "WebPage",
    post: "BlogPosting",
    category: "WebPage",
    series: "TVSeries",
    episode: "TVEpisode",
    search: "WebPage",
  };
  return automatic[kind];
}
