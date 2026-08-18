import { prisma } from "./db";
import { SubscriptionStatus } from "@prisma/client";

export async function resumeSubscription(userId: string, subscriptionId: string) {
  const subscription = await prisma.subscription.findFirst({
    where: { id: subscriptionId, userId, status: { in: ["TRIALING", "ACTIVE"] } },
  });
  if (!subscription) throw new Error("SUBSCRIPTION_NOT_FOUND");
  return prisma.$transaction(async (tx) => {
    const result = await tx.subscription.update({
      where: { id: subscriptionId },
      data: { cancelAtPeriodEnd: false },
    });
    await tx.subscriptionEvent.create({
      data: {
        subscriptionId,
        fromStatus: subscription.status as SubscriptionStatus,
        toStatus: subscription.status as SubscriptionStatus,
        reason: "Cancellation resumed",
        actorType: "USER",
        actorId: userId,
      },
    });
    return result;
  });
}
