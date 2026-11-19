import { z } from "zod";
import { prisma } from "./db";

const colorSchema = z.string().regex(/^#[\da-f]{6}$/i);
const optionalUrlSchema = z.string().trim().max(2048).refine((value) => {
  if (!value) return true;
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
});

const titleTemplatesSchema = z.object({
  home: z.string().max(200),
  page: z.string().max(200),
  post: z.string().max(200),
  category: z.string().max(200),
  series: z.string().max(200),
  episode: z.string().max(200),
  search: z.string().max(200),
});

const robotsExtraSchema = z.string().max(10_000).superRefine((value, context) => {
  for (const [index, line] of value.split(/\r?\n/).entries()) {
    if (line && !/^(Allow|Disallow): \/\S*$/.test(line)) {
      context.addIssue({
        code: "custom",
        message: "Use Allow: /path or Disallow: /path",
        path: [index],
      });
    }
  }
});

export const SeoGlobalSchema = z.object({
  siteName: z.string().trim().min(1).max(120),
  separator: z.string().max(12),
  titleTemplates: titleTemplatesSchema,
  defaultDescription: z.string().max(320),
  homeTitle: z.string().max(120).optional(),
  homeDescription: z.string().max(320).optional(),
  defaultOgImage: optionalUrlSchema.optional(),
  twitterHandle: z.string().max(80).optional(),
  organization: z.object({
    name: z.string().trim().min(1).max(120),
    logo: optionalUrlSchema,
    url: optionalUrlSchema,
    email: z.string().email().max(254).optional().or(z.literal("")),
    phone: z.string().max(40).optional(),
    sameAs: z.array(optionalUrlSchema).max(30),
  }),
  verification: z.object({
    google: z.string().max(500).optional(),
    bing: z.string().max(500).optional(),
    yandex: z.string().max(500).optional(),
    pinterest: z.string().max(500).optional(),
    baidu: z.string().max(500).optional(),
  }),
  sitemap: z.object({
    pages: z.boolean(),
    posts: z.boolean(),
    categories: z.boolean(),
    series: z.boolean(),
    episodes: z.boolean(),
  }),
  robotsExtra: robotsExtraSchema,
  noindexSearch: z.boolean(),
  analytics: z.object({
    ga4Id: z.string().regex(/^G-[A-Z0-9]{4,}$/).optional().or(z.literal("")),
    gtmId: z.string().regex(/^GTM-[A-Z0-9]{4,}$/).optional().or(z.literal("")),
  }),
}).strict();

export type SeoGlobalConfig = z.infer<typeof SeoGlobalSchema>;

const menuLinkSchema = z.object({
  label: z.string().trim().min(1).max(80),
  href: optionalUrlSchema,
});

const socialSchema = z.object({
  instagram: optionalUrlSchema.optional(),
  youtube: optionalUrlSchema.optional(),
  facebook: optionalUrlSchema.optional(),
  x: optionalUrlSchema.optional(),
  whatsapp: optionalUrlSchema.optional(),
  telegram: optionalUrlSchema.optional(),
});

export const ThemeSchema = z.object({
  siteName: z.string().trim().min(1).max(120),
  tagline: z.string().max(200),
  kicker: z.string().max(80),
  logoUrl: optionalUrlSchema.optional(),
  faviconUrl: optionalUrlSchema.optional(),
  brandColor: colorSchema,
  neutralPreset: z.enum(["zinc", "slate", "stone", "neutral", "gray"]),
  accentGold: colorSchema,
  fontFamily: z.enum(["system", "Inter", "Poppins", "Roboto", "Noto Sans", "Montserrat", "Mukta", "Hind", "Baloo 2"]),
  radius: z.enum(["sm", "md", "lg", "xl"]),
  announcement: z.object({
    enabled: z.boolean(),
    text: z.string().max(500),
    href: optionalUrlSchema.optional(),
    bg: colorSchema,
    fg: colorSchema,
  }),
  headerMenu: z.array(menuLinkSchema).max(20),
  footerColumns: z.array(z.object({
    title: z.string().trim().min(1).max(80),
    links: z.array(menuLinkSchema).max(30),
  })).max(8),
  copyright: z.string().max(240),
  social: socialSchema,
  home: z.object({
    showContinueWatching: z.boolean(),
    showHero: z.boolean(),
    showRails: z.boolean(),
    showLatestPosts: z.boolean(),
    heroHeadline: z.string().max(160),
    sectionOrder: z.array(z.enum(["continueWatching", "hero", "rails", "latestPosts"])).max(4),
  }),
  customCss: z.string().max(20_000).transform((value) => value.replace(/</g, "")),
}).strict();

export type ThemeConfig = z.infer<typeof ThemeSchema>;

export const SEO_GLOBAL_DEFAULTS: SeoGlobalConfig = {
  siteName: "Intube Drama",
  separator: "|",
  titleTemplates: {
    home: "%sitename% %sep% %tagline%",
    page: "%title% %sep% %sitename%",
    post: "%title% %sep% %sitename%",
    category: "%title% %sep% %sitename%",
    series: "%title% %sep% %sitename%",
    episode: "%series% · Episode %episode% %sep% %sitename%",
    search: "%title% %sep% %sitename%",
  },
  defaultDescription: "Short dramas. Big twists. Discover your next obsession with Intube Drama.",
  organization: {
    name: "Intube Drama",
    logo: "",
    url: "https://intubedrama.com",
    sameAs: [],
  },
  verification: {},
  sitemap: { pages: true, posts: true, categories: true, series: true, episodes: false },
  robotsExtra: "",
  noindexSearch: true,
  analytics: {},
};

export const THEME_DEFAULTS: ThemeConfig = {
  siteName: "Intube Drama",
  tagline: "Your next obsession.",
  kicker: "INTUBE DRAMA",
  brandColor: "#f43f5e",
  neutralPreset: "zinc",
  accentGold: "#fbbf24",
  fontFamily: "system",
  radius: "lg",
  announcement: {
    enabled: false,
    text: "",
    bg: "#09090b",
    fg: "#ffffff",
  },
  headerMenu: [
    { label: "Home", href: "/" },
    { label: "Blog", href: "/blog" },
  ],
  footerColumns: [
    {
      title: "Explore",
      links: [
        { label: "Blog", href: "/blog" },
        { label: "Privacy", href: "/privacy" },
        { label: "Terms", href: "/terms" },
        { label: "Refund policy", href: "/refund-policy" },
        { label: "Contact", href: "/contact" },
        { label: "Delete account", href: "/account/delete" },
      ],
    },
  ],
  copyright: "© {year} Intube Drama · Intube Media · intubedrama.com",
  social: {},
  home: {
    showContinueWatching: true,
    showHero: true,
    showRails: true,
    showLatestPosts: false,
    heroHeadline: "Your next obsession.",
    sectionOrder: ["continueWatching", "hero", "rails", "latestPosts"],
  },
  customCss: "",
};

type ConfigKey = "SEO_GLOBAL" | "THEME";
type ConfigCacheEntry = { expiresAt: number; value: unknown };
type PlainRecord = Record<string, unknown>;

const cache = new Map<ConfigKey, ConfigCacheEntry>();
const CACHE_TTL_MS = 30_000;

function isRecord(value: unknown): value is PlainRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeField(schema: z.ZodTypeAny, fallback: unknown, input: unknown): unknown {
  if (input === undefined) return fallback;
  const parsed = schema.safeParse(input);
  if (parsed.success) return parsed.data;
  if (schema instanceof z.ZodObject && isRecord(fallback) && isRecord(input)) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    return Object.fromEntries(Object.entries(shape).map(([key, childSchema]) => [
      key,
      mergeField(childSchema, fallback[key], input[key]),
    ]));
  }
  return fallback;
}

function readDocument<T>(schema: z.ZodType<T>, defaults: T, stored: unknown): T {
  if (!isRecord(stored) || !(schema instanceof z.ZodObject)) return defaults;
  const shape = schema.shape as Record<string, z.ZodTypeAny>;
  const merged = Object.fromEntries(Object.entries(shape).map(([key, childSchema]) => [
    key,
    mergeField(childSchema, (defaults as PlainRecord)[key], stored[key]),
  ]));
  const parsed = schema.safeParse(merged);
  return parsed.success ? parsed.data as T : defaults;
}

function mergePatch(current: unknown, patch: unknown): unknown {
  if (!isRecord(current) || !isRecord(patch)) return patch === undefined ? current : patch;
  const keys = new Set([...Object.keys(current), ...Object.keys(patch)]);
  return Object.fromEntries([...keys].map((key) => [
    key,
    patch[key] === undefined ? current[key] : mergePatch(current[key], patch[key]),
  ]));
}

function containsUnknownKeys(schema: z.ZodTypeAny, input: unknown): boolean {
  if (!(schema instanceof z.ZodObject) || !isRecord(input)) return false;
  const shape = schema.shape as Record<string, z.ZodTypeAny>;
  return Object.entries(input).some(([key, value]) =>
    !(key in shape) || containsUnknownKeys(shape[key], value),
  );
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function getConfig<T>(
  key: ConfigKey,
  schema: z.ZodType<T>,
  defaults: T,
): Promise<T> {
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return clone(cached.value as T);

  const setting = await prisma.appSetting.findUnique({ where: { key } });
  let stored: unknown;
  if (setting) {
    try {
      stored = JSON.parse(setting.value);
    } catch {
      stored = undefined;
    }
  }
  const value = readDocument(schema, defaults, stored);
  cache.set(key, { expiresAt: now + CACHE_TTL_MS, value });
  return clone(value);
}

async function saveConfig<T>(
  key: ConfigKey,
  schema: z.ZodType<T>,
  current: T,
  patch: unknown,
  actorId: string,
): Promise<T> {
  if (containsUnknownKeys(schema, patch)) throw new Error("INVALID_SITE_CONFIG");
  const merged = mergePatch(current, patch);
  const parsed = schema.safeParse(merged);
  if (!parsed.success) throw new Error("INVALID_SITE_CONFIG");

  const value = JSON.stringify(parsed.data);
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value, isSecret: false, updatedById: actorId },
    update: { value, isSecret: false, updatedById: actorId },
  });
  cache.delete(key);
  return clone(parsed.data);
}

export function getSeoGlobal() {
  return getConfig("SEO_GLOBAL", SeoGlobalSchema, SEO_GLOBAL_DEFAULTS);
}

export function getTheme() {
  return getConfig("THEME", ThemeSchema, THEME_DEFAULTS);
}

export async function saveSeoGlobal(patch: unknown, actorId: string) {
  const current = await getSeoGlobal();
  return saveConfig("SEO_GLOBAL", SeoGlobalSchema, current, patch, actorId);
}

export async function saveTheme(patch: unknown, actorId: string) {
  const current = await getTheme();
  return saveConfig("THEME", ThemeSchema, current, patch, actorId);
}

export function invalidateSiteConfigCache(key?: ConfigKey) {
  if (key) cache.delete(key);
  else cache.clear();
}

export function mergeSiteConfig<T>(schema: z.ZodType<T>, defaults: T, stored: unknown) {
  return readDocument(schema, defaults, stored);
}
