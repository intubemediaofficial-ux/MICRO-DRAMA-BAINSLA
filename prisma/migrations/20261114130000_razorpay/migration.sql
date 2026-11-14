ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'INCOMPLETE';
ALTER TYPE "SubscriptionProvider" ADD VALUE IF NOT EXISTS 'RAZORPAY';

CREATE TABLE "ProviderPlan" (
    "id" TEXT NOT NULL,
    "provider" "SubscriptionProvider" NOT NULL,
    "key" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProviderPlan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProviderPlan_provider_key_key" ON "ProviderPlan"("provider", "key");
