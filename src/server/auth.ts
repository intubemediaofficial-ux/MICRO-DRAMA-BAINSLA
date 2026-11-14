import { Prisma } from "@prisma/client";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { credit } from "./coins";
import { env } from "./config";
import { prisma } from "./db";
import { getSettings } from "./settings";

const COOKIE = "microdrama_session";
const REFERRAL_COOKIE = "ref";
const key = () => new TextEncoder().encode(env.SESSION_SECRET);
export type Session = { userId: string; role: "USER" | "ADMIN" };

export async function issueSession(session: Session): Promise<void> {
  const token = await new SignJWT(session)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(key());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
}
export async function clearSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    if (typeof payload.userId !== "string" || (payload.role !== "USER" && payload.role !== "ADMIN"))
      return null;
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { role: true, isDisabled: true },
    });
    if (!user || user.isDisabled) return null;
    return { userId: payload.userId, role: user.role };
  } catch {
    return null;
  }
}
export async function requireUser(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHENTICATED");
  return session;
}
export async function requireAdmin(): Promise<Session> {
  const session = await requireUser();
  if (session.role !== "ADMIN") throw new Error("FORBIDDEN");
  return session;
}
export async function consumeReferralCode(explicit?: string) {
  const cookieStore = await cookies();
  const stored = cookieStore.get(REFERRAL_COOKIE)?.value;
  if (stored) cookieStore.delete(REFERRAL_COOKIE);
  const code = explicit?.trim() || stored?.trim();
  return code && /^[a-z\d_-]{2,64}$/i.test(code) ? code.toUpperCase() : undefined;
}

export async function clearReferralCookie() {
  (await cookies()).delete(REFERRAL_COOKIE);
}

export async function findOrCreateUser(identifier: string, referralCode?: string) {
  const isEmail = identifier.includes("@");
  return prisma.$transaction(async (tx) => {
    const existing = await tx.user.findFirst({
      where: isEmail ? { email: identifier } : { phone: identifier },
    });
    if (existing) {
      if (existing.isDisabled) throw new Error("ACCOUNT_DISABLED");
      return existing;
    }

    let referrerId: string | undefined;
    const candidate = referralCode
      ? await tx.user.findUnique({
          where: { referralCode },
          select: { id: true, email: true, phone: true, isDisabled: true },
        })
      : null;
    if (
      candidate &&
      !candidate.isDisabled &&
      candidate.email !== identifier &&
      candidate.phone !== identifier
    ) {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "User" WHERE id = ${candidate.id} FOR UPDATE`);
      const referrer = await tx.user.findUnique({
        where: { id: candidate.id },
        select: { id: true, isDisabled: true },
      });
      if (referrer && !referrer.isDisabled) referrerId = referrer.id;
    }

    const user = await tx.user.create({
      data: {
        ...(isEmail ? { email: identifier } : { phone: identifier }),
        referralCode: `MD${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        ...(referrerId ? { referredById: referrerId } : {}),
      },
    });
    if (referrerId) {
      const recentRewards = await tx.coinTransaction.count({
        where: {
          userId: referrerId,
          type: "REFERRAL_BONUS",
          refType: "referral",
          createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) },
        },
      });
      const bonus = (await getSettings()).REFERRAL_BONUS_COINS;
      if (recentRewards < 20 && bonus > 0) {
        await credit(user.id, bonus, "REFERRAL_BONUS", { type: "referral", id: referrerId }, tx);
        await credit(referrerId, bonus, "REFERRAL_BONUS", { type: "referral", id: user.id }, tx);
      }
    }
    return user;
  });
}
