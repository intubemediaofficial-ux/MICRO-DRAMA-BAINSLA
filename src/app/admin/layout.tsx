import { getSession } from "@/server/auth";
import { prisma } from "@/server/db";
import AdminShell from "@/components/admin/admin-shell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return children;
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { email: true } });
  return <AdminShell email={user?.email ?? "Administrator"}>{children}</AdminShell>;
}
