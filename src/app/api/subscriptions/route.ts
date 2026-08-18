import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/server/auth";
import { detectCountry, resolveCurrency } from "@/server/currency";
import { getUserSubscription, startTrial } from "@/server/subscriptions";

const input = z.object({
  planCode: z.string().min(1).default("VIP_ANNUAL"),
  discountCode: z.string().trim().min(1).max(32).optional(),
});

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });
  return NextResponse.json(await getUserSubscription(session.userId));
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });
  try {
    const data = input.parse(await request.json());
    const currency = resolveCurrency(request.headers);
    const country = detectCountry(request.headers) ?? "IN";
    const subscription = await startTrial(
      session.userId,
      data.planCode,
      currency,
      country,
      data.discountCode,
    );
    return NextResponse.json({ ok: true, subscription });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Subscription failed";
    const status =
      message === "PLAN_NOT_FOUND" || message === "PRICE_NOT_FOUND"
        ? 404
        : message === "INVALID_DISCOUNT"
          ? 422
          : 400;
    return NextResponse.json({ error: { message } }, { status });
  }
}
