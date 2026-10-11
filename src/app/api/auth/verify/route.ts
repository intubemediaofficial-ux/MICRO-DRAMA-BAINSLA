import { NextResponse } from "next/server";
import { z } from "zod";
import { findOrCreateUser, issueSession } from "@/server/auth";
import { normalizeIdentifier, verifyOtp } from "@/server/otp";
import { rateLimit } from "@/server/rate-limit";
const input = z.object({
  identifier: z.string().min(3).max(120),
  code: z.string().length(6),
  referralCode: z.string().optional(),
});
export async function POST(request: Request) {
  if (!rateLimit("verify:" + request.headers.get("x-forwarded-for"), 20))
    return NextResponse.json({ error: { message: "Too many requests" } }, { status: 429 });
  try {
    const data = input.parse(await request.json());
    if (!(await verifyOtp(data.identifier, data.code)))
      return NextResponse.json({ error: { message: "Invalid or expired OTP" } }, { status: 401 });
    const user = await findOrCreateUser(normalizeIdentifier(data.identifier), data.referralCode);
    await issueSession({ userId: user.id, role: user.role });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error && error.message === "INVALID_REFERRAL"
        ? "Invalid referral"
        : error instanceof Error && error.message === "ACCOUNT_DISABLED"
          ? "Account disabled"
          : "Invalid input";
    return NextResponse.json(
      { error: { message } },
      { status: message === "Account disabled" ? 403 : 400 },
    );
  }
}
