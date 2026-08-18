-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "pastDueSince" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SubscriptionAutomation" ADD COLUMN     "gracePeriodHours" INTEGER NOT NULL DEFAULT 72;

