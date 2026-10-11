import crypto from "node:crypto";
import { env } from "./config";
import { prisma } from "./db";

const TTL_MS = 10 * 60_000;
const RESEND_MS = 60_000;
const MAX_ATTEMPTS = 5;

export function normalizeIdentifier(value: string) {
  const trimmed = value.trim();
  return trimmed.includes("@") ? trimmed.toLowerCase() : trimmed.replace(/[\s-]/g, "");
}

function hashCode(identifier: string, code: string) {
  return crypto.createHmac("sha256", env.SESSION_SECRET).update(`${identifier}:${code}`).digest();
}

/** Fixed dev code only works locally when no email provider is configured. */
export function devOtpEnabled() {
  return process.env.NODE_ENV !== "production" && !env.BREVO_API_KEY;
}

export async function createOtpChallenge(identifier: string) {
  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
  await prisma.otpChallenge.create({
    data: {
      identifier,
      codeHash: hashCode(identifier, code).toString("hex"),
      expiresAt: new Date(Date.now() + TTL_MS),
    },
  });
  return code;
}

export async function verifyOtpChallenge(identifier: string, code: string) {
  const challenge = await prisma.otpChallenge.findFirst({
    where: { identifier, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!challenge || challenge.attempts >= MAX_ATTEMPTS) return false;
  const expected = Buffer.from(challenge.codeHash, "hex");
  const actual = hashCode(identifier, code);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    await prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    });
    return false;
  }
  const consumed = await prisma.otpChallenge.updateMany({
    where: { id: challenge.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  return consumed.count === 1;
}

function parseSender(from: string) {
  const match = from.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  return match
    ? { name: match[1].trim() || "MicroDrama", email: match[2].trim() }
    : { name: "MicroDrama", email: from.trim() };
}

async function sendOtpEmail(email: string, code: string) {
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": env.BREVO_API_KEY ?? "",
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: parseSender(env.MAIL_FROM),
      to: [{ email }],
      subject: `${code} is your MicroDrama login code`,
      textContent: `Your MicroDrama login code is ${code}. It expires in 10 minutes. If you did not request it, ignore this email.`,
      htmlContent: `<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:24px;background:#09090b;color:#fafafa;border-radius:16px"><p style="color:#fb7185;font-weight:700;letter-spacing:4px;font-size:12px">MICRODRAMA</p><h2 style="margin:8px 0">Your login code</h2><p style="font-size:34px;font-weight:800;letter-spacing:8px;margin:16px 0">${code}</p><p style="color:#a1a1aa;font-size:14px">This code expires in 10 minutes. If you did not request it, you can ignore this email.</p></div>`,
    }),
  });
  if (!response.ok) throw new Error("OTP_SEND_FAILED");
}

export async function requestOtp(rawIdentifier: string) {
  const identifier = normalizeIdentifier(rawIdentifier);
  if (devOtpEnabled()) return { dev: true };
  if (!identifier.includes("@")) throw new Error("PHONE_OTP_UNAVAILABLE");
  if (!env.BREVO_API_KEY) throw new Error("OTP_UNAVAILABLE");
  const recent = await prisma.otpChallenge.findFirst({
    where: { identifier, createdAt: { gt: new Date(Date.now() - RESEND_MS) } },
  });
  if (recent) throw new Error("OTP_TOO_SOON");
  const code = await createOtpChallenge(identifier);
  await sendOtpEmail(identifier, code);
  return { dev: false };
}

export async function verifyOtp(rawIdentifier: string, code: string) {
  const identifier = normalizeIdentifier(rawIdentifier);
  if (devOtpEnabled()) return code === env.OTP_DEV_CODE;
  return verifyOtpChallenge(identifier, code);
}
