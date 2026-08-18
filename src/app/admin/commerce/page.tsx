import Link from "next/link";
import { getSession } from "@/server/auth";
import { prisma } from "@/server/db";
import AdminCommerceClient from "./commerce-client";

export default async function AdminCommercePage() {
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
  const [bundles, banners, coupons, plans, discounts] = await Promise.all([
    prisma.coinBundle.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.banner.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.coupon.findMany({ orderBy: { code: "asc" } }),
    prisma.plan.findMany({ include: { prices: true }, orderBy: { createdAt: "asc" } }),
    prisma.discountCode.findMany({ orderBy: { createdAt: "desc" } }),
  ]);
  return (
    <div className="p-5 pb-24">
      <Link href="/admin" className="text-zinc-400">
        ← Command center
      </Link>
      <h1 className="mt-7 text-3xl font-black">Commerce controls</h1>
      <p className="mt-2 text-sm text-zinc-400">
        Edit integer minor-unit prices, coin bundles, coupons, banners, plans and discounts.
      </p>
      <AdminCommerceClient initial={{ bundles, banners, coupons, plans, discounts }} />
    </div>
  );
}
