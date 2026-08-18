import { NextResponse } from "next/server";
import { getSession } from "@/server/auth";
import { prisma } from "@/server/db";
import { credit } from "@/server/coins";
export async function POST(request: Request) {
  const session = await getSession();
  if (!session)
    return NextResponse.redirect(
      new URL("/login", process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
    );
  const data = await request.formData();
  const bundleId = String(data.get("bundleId"));
  const bundle = await prisma.coinBundle.findUnique({ where: { id: bundleId } });
  if (!bundle)
    return NextResponse.json({ error: { message: "Bundle not found" } }, { status: 404 });
  const coinsGranted = bundle.coins + bundle.bonusCoins;
  const purchase = await prisma.purchase.create({
    data: {
      userId: session.userId,
      bundleId,
      provider: "CARD",
      providerRef: `dev_${crypto.randomUUID()}`,
      status: "COMPLETED",
      coinsGranted,
    },
  });
  await credit(session.userId, coinsGranted, "PURCHASE", { type: "purchase", id: purchase.id });
  return NextResponse.redirect(
    new URL("/wallet", process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  );
}
