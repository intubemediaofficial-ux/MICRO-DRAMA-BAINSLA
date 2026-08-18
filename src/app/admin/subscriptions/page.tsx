import Link from "next/link";
import { getSession } from "@/server/auth";
import { getSubscriptionAdminMetrics } from "@/server/subscription-admin";
import { prisma } from "@/server/db";
import AdminSubscriptionsClient from "./subscriptions-client";

export default async function AdminSubscriptionsPage() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN")
    return (
      <div className="p-8">
        <h1 className="text-3xl font-black">Admin access required</h1>
        <Link href="/login" className="mt-5 inline-block rounded-full bg-rose-500 px-5 py-3">
          Sign in
        </Link>
      </div>
    );
  const [metrics, plans, settings] = await Promise.all([
    getSubscriptionAdminMetrics(),
    prisma.plan.findMany({ include: { prices: true }, orderBy: { createdAt: "asc" } }),
    prisma.subscriptionAutomation.upsert({
      where: { id: "default" },
      update: {},
      create: { id: "default" },
    }),
  ]);
  return (
    <div className="p-5 pb-24">
      <Link href="/admin" className="text-zinc-400">
        ← CMS
      </Link>
      <h1 className="mt-7 text-3xl font-black">Subscriptions</h1>
      <p className="mt-2 text-sm text-zinc-400">
        Monitor trials, billing, localized prices and reminder automation.
      </p>
      <AdminSubscriptionsClient metrics={metrics} plans={plans} settings={settings} />
    </div>
  );
}
