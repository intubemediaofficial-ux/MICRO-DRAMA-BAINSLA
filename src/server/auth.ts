import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { env } from "./config";
import { prisma } from "./db";

const COOKIE = "microdrama_session";
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
export async function findOrCreateUser(identifier: string, referralCode?: string) {
  const isEmail = identifier.includes("@");
  const existing = await prisma.user.findFirst({
    where: isEmail ? { email: identifier } : { phone: identifier },
  });
  if (existing) {
    if (existing.isDisabled) throw new Error("ACCOUNT_DISABLED");
    if (referralCode) throw new Error("REFERRAL_ALREADY_CLAIMED");
    return existing;
  }
  const referrer = referralCode ? await prisma.user.findUnique({ where: { referralCode } }) : null;
  if (referrer && (referrer.email === identifier || referrer.phone === identifier))
    throw new Error("INVALID_REFERRAL");
  const user = await prisma.user.create({
    data: {
      ...(isEmail ? { email: identifier } : { phone: identifier }),
      referralCode: `MD${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      referredById: referrer?.id,
    },
  });
  if (referrer) {
    // Signup referral credits are kept in the same ledger choke point.
    const { credit } = await import("./coins");
    await credit(referrer.id, 25, "REFERRAL_BONUS", { type: "signup", id: user.id });
    await credit(user.id, 25, "REFERRAL_BONUS", { type: "signup", id: referrer.id });
  }
  return user;
}
