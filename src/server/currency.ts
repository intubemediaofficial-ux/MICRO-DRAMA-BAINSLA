import type { PlanPrice } from "@prisma/client";
import { prisma } from "./db";

const COUNTRY_CURRENCY: Record<string, string> = {
  AE: "AED",
  AT: "EUR",
  BE: "EUR",
  DE: "EUR",
  ES: "EUR",
  FI: "EUR",
  FR: "EUR",
  GR: "EUR",
  IE: "EUR",
  IT: "EUR",
  LU: "EUR",
  NL: "EUR",
  PT: "EUR",
  US: "USD",
  IN: "INR",
};

function countryFromLanguage(language: string | null) {
  const match = language?.match(/[-_]([A-Za-z]{2})(?:[;,]|$)/);
  return match?.[1]?.toUpperCase() ?? null;
}

export function detectCountry(headers: Headers) {
  const direct =
    headers.get("cf-ipcountry")?.toUpperCase() ?? headers.get("x-vercel-ip-country")?.toUpperCase();
  return direct && direct.length === 2
    ? direct
    : countryFromLanguage(headers.get("accept-language"));
}

export function currencyForCountry(country: string | null) {
  return (country && COUNTRY_CURRENCY[country]) ?? "INR";
}

export function resolveCurrency(headers: Headers) {
  return currencyForCountry(detectCountry(headers));
}

export async function localizedPlan(planCode: string, currency: string) {
  const plan = await prisma.plan.findUnique({
    where: { code: planCode },
    include: { prices: { where: { isActive: true } } },
  });
  if (!plan || !plan.isActive) return null;
  return { plan, price: choosePlanPrice(plan, currency) };
}

export function choosePlanPrice(plan: { prices: PlanPrice[] }, currency: string) {
  return plan.prices.find((price) => price.currency === currency) ?? null;
}

export function discountedAmount(
  amountMinor: number,
  type: "PERCENT" | "FIXED_MINOR",
  value: number,
) {
  if (type === "PERCENT") return Math.max(0, amountMinor - Math.floor((amountMinor * value) / 100));
  return Math.max(0, amountMinor - value);
}

export function formatMinor(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en", { style: "currency", currency }).format(amountMinor / 100);
}
