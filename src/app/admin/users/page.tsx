import Link from "next/link";
import { getSession } from "@/server/auth";
import { prisma } from "@/server/db";
import AdminUsersClient from "./users-client";

export default async function AdminUsersPage() {
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
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      email: true,
      phone: true,
      name: true,
      role: true,
      isDisabled: true,
      coinBalance: true,
      subscriptions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, status: true, currentPeriodEnd: true },
      },
    },
  });
  return (
    <div className="p-5 pb-24">
      <Link href="/admin" className="text-zinc-400">
        ← Command center
      </Link>
      <h1 className="mt-7 text-3xl font-black">Users</h1>
      <p className="mt-2 text-sm text-zinc-400">
        Search accounts, inspect history, adjust coins through the ledger, and manage access.
      </p>
      <AdminUsersClient initialUsers={users} />
    </div>
  );
}
