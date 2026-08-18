import { NextResponse } from "next/server";
import { getSession } from "@/server/auth";
import { prisma } from "@/server/db";
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      email: true,
      phone: true,
      role: true,
      coinBalance: true,
      referralCode: true,
    },
  });
  return NextResponse.json(user);
}
