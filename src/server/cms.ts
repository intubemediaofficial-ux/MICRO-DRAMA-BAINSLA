import { Prisma } from "@prisma/client";
import { prisma } from "./db";

export const BUILT_IN_PAGE_SLUGS = new Set(["privacy", "terms", "refund-policy", "contact"]);

const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "series",
  "watch",
  "blog",
  "search",
  "login",
  "account",
  "wallet",
  "subscribe",
  "privacy",
  "terms",
  "refund-policy",
  "contact",
  "media",
  "demo",
  "sitemap.xml",
  "robots.txt",
  "_next",
  ".well-known",
]);

export function assertCmsSlug(slug: string, builtInCustomize = false) {
  if (slug.length > 80 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
    throw new Error("INVALID_SLUG");
  const firstSegment = slug.split("/")[0];
  if (RESERVED_SLUGS.has(firstSegment) && !(builtInCustomize && BUILT_IN_PAGE_SLUGS.has(slug)))
    throw new Error("RESERVED_SLUG");
}

export function normalizeRedirectPath(value: string) {
  const withoutQuery = value.split(/[?#]/, 1)[0] || "/";
  let decoded: string;
  try {
    decoded = decodeURIComponent(withoutQuery);
  } catch {
    throw new Error("INVALID_REDIRECT_PATH");
  }
  if (!decoded.startsWith("/") || decoded.startsWith("//") || decoded.length > 300)
    throw new Error("INVALID_REDIRECT_PATH");
  const normalized = decoded.length > 1 ? decoded.replace(/\/+$/, "") : decoded;
  if (/[\u0000-\u001f]/.test(normalized)) throw new Error("INVALID_REDIRECT_PATH");
  return normalized;
}

export async function saveSlugRedirect(
  tx: Prisma.TransactionClient,
  fromPath: string,
  toPath: string,
  permanent = true,
) {
  const from = normalizeRedirectPath(fromPath);
  const to = normalizeRedirectPath(toPath);
  if (from === to) return;
  await tx.redirect.upsert({
    where: { fromPath: from },
    create: { fromPath: from, toPath: to, permanent, active: true },
    update: { toPath: to, permanent, active: true },
  });
}

export async function resolveRedirect(path: string) {
  const fromPath = normalizeRedirectPath(path);
  const redirect = await prisma.redirect.findFirst({
    where: { fromPath, active: true },
  });
  if (!redirect) return null;
  await prisma.redirect.update({
    where: { id: redirect.id },
    data: { hits: { increment: 1 }, lastHitAt: new Date() },
  });
  return redirect;
}
