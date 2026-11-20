import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { clearSession, getSession } from "@/server/auth";
import { prisma } from "@/server/db";
import {
  accountDeletionIdentifier,
  anonymizedTrialClaimDeviceFingerprint,
  anonymizedTrialClaimEmail,
} from "@/server/trial-claim-privacy";

const input = z.object({ confirm: z.literal("DELETE") }).strict();

export async function POST(request: Request) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });

  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: { message: "Invalid confirmation" } }, { status: 400 });

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: session.userId },
      select: { email: true, phone: true, isDisabled: true },
    });
    if (!user) return "missing" as const;

    const renewableSubscription = await tx.subscription.findFirst({
      where: {
        userId: session.userId,
        cancelAtPeriodEnd: false,
        status: { in: ["TRIALING", "ACTIVE", "PAST_DUE"] },
      },
      select: { id: true },
    });
    if (renewableSubscription) return "subscription" as const;

    await tx.subscription.updateMany({
      where: { userId: session.userId, status: "INCOMPLETE" },
      data: { status: "CANCELED" },
    });

    const identifiers = [user.email, user.phone].filter(
      (identifier): identifier is string => Boolean(identifier),
    );
    if (identifiers.length > 0)
      await tx.otpChallenge.deleteMany({ where: { identifier: { in: identifiers } } });

    await tx.deviceToken.deleteMany({ where: { userId: session.userId } });
    await tx.watchProgress.deleteMany({ where: { userId: session.userId } });
    await tx.watchlistItem.deleteMany({ where: { userId: session.userId } });
    await tx.episodeLike.deleteMany({ where: { userId: session.userId } });
    await tx.userActivityDay.deleteMany({ where: { userId: session.userId } });
    await tx.dailyCheckin.deleteMany({ where: { userId: session.userId } });
    await tx.notificationLog.deleteMany({ where: { userId: session.userId } });
    await tx.analyticsEvent.updateMany({
      where: { userId: session.userId },
      data: { userId: null },
    });

    const subscriptions = await tx.subscription.findMany({
      where: { userId: session.userId },
      select: { id: true },
    });
    if (subscriptions.length > 0)
      await tx.subscriptionWebhookEvent.updateMany({
        where: { subscriptionId: { in: subscriptions.map(({ id }) => id) } },
        data: { payload: Prisma.DbNull },
      });

    const trialClaims = await tx.trialClaim.findMany({
      where: { userId: session.userId },
      select: { id: true, email: true, deviceFingerprint: true },
    });
    for (const claim of trialClaims)
      await tx.trialClaim.update({
        where: { id: claim.id },
        data: {
          userId: null,
          email: anonymizedTrialClaimEmail(claim.email),
          deviceFingerprint: claim.deviceFingerprint
            ? anonymizedTrialClaimDeviceFingerprint(claim.deviceFingerprint)
            : null,
        },
      });

    await tx.user.update({
      where: { id: session.userId },
      data: {
        email: accountDeletionIdentifier("email", user.email, session.userId, user.isDisabled),
        phone: accountDeletionIdentifier("phone", user.phone, session.userId, user.isDisabled),
        name: null,
        passwordHash: null,
        isDisabled: true,
        passwordFailedAttempts: 0,
        passwordLockedUntil: null,
      },
    });
    return "deleted" as const;
  });

  if (result === "subscription")
    return NextResponse.json(
      { error: { message: "Cancel your VIP auto-renew first" } },
      { status: 409 },
    );
  if (result === "missing")
    return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });

  await clearSession();
  return NextResponse.json({ ok: true });
}
