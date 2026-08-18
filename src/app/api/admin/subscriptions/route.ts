import { NextResponse } from "next/server";
import { z } from "zod";
import { adminSession } from "@/server/admin";
import { prisma } from "@/server/db";
import { getSubscriptionAdminMetrics } from "@/server/subscription-admin";

const input = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("settings"),
    enabled: z.boolean(),
    reminderLeadHours: z.number().int().positive(),
  }),
  z.object({
    kind: z.literal("discount"),
    code: z.string().min(2).max(32),
    type: z.enum(["PERCENT", "FIXED_MINOR"]),
    value: z.number().int().nonnegative(),
    maxRedemptions: z.number().int().positive(),
    startsAt: z.string().datetime().optional(),
    endsAt: z.string().datetime().optional(),
    planIds: z.array(z.string()).default([]),
  }),
  z.object({
    kind: z.literal("price"),
    id: z.string(),
    amountMinor: z.number().int().nonnegative(),
    trialAmountMinor: z.number().int().nonnegative(),
    countryCodes: z.array(z.string().length(2)).default([]),
    isActive: z.boolean().default(true),
  }),
  z.object({
    kind: z.literal("plan"),
    id: z.string(),
    name: z.string().min(1).max(80),
    trialDays: z.number().int().nonnegative(),
    isActive: z.boolean(),
  }),
]);

export async function GET(request: Request) {
  try {
    await adminSession();
    const url = new URL(request.url);
    const days = Math.max(1, Math.min(365, Number(url.searchParams.get("days") ?? 30)));
    const search = url.searchParams.get("q") ?? undefined;
    const [metrics, plans, settings] = await Promise.all([
      getSubscriptionAdminMetrics(days, search),
      prisma.plan.findMany({ include: { prices: true }, orderBy: { createdAt: "asc" } }),
      prisma.subscriptionAutomation.upsert({
        where: { id: "default" },
        update: {},
        create: { id: "default" },
      }),
    ]);
    return NextResponse.json({ metrics, plans, settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Admin access required";
    return NextResponse.json(
      { error: { message } },
      { status: message === "FORBIDDEN" ? 403 : 401 },
    );
  }
}

export async function POST(request: Request) {
  try {
    await adminSession();
    const data = input.parse(await request.json());
    if (data.kind === "settings") {
      const settings = await prisma.subscriptionAutomation.upsert({
        where: { id: "default" },
        update: { enabled: data.enabled, reminderLeadHours: data.reminderLeadHours },
        create: { id: "default", enabled: data.enabled, reminderLeadHours: data.reminderLeadHours },
      });
      return NextResponse.json(settings);
    }
    if (data.kind === "price") {
      return NextResponse.json(
        await prisma.planPrice.update({
          where: { id: data.id },
          data: {
            amountMinor: data.amountMinor,
            trialAmountMinor: data.trialAmountMinor,
            countryCodes: data.countryCodes,
            isActive: data.isActive,
          },
        }),
      );
    }
    if (data.kind === "plan") {
      return NextResponse.json(
        await prisma.plan.update({
          where: { id: data.id },
          data: { name: data.name, trialDays: data.trialDays, isActive: data.isActive },
        }),
      );
    }
    const discount = await prisma.discountCode.create({
      data: {
        code: data.code.toUpperCase(),
        type: data.type,
        value: data.value,
        maxRedemptions: data.maxRedemptions,
        startsAt: data.startsAt ? new Date(data.startsAt) : undefined,
        endsAt: data.endsAt ? new Date(data.endsAt) : undefined,
        plans: { create: data.planIds.map((planId) => ({ planId })) },
      },
    });
    return NextResponse.json(discount);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Subscription admin request failed";
    return NextResponse.json({ error: { message } }, { status: 400 });
  }
}
