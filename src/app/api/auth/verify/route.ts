import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/server/config";
import { findOrCreateUser, issueSession } from "@/server/auth";
const input = z.object({
  identifier: z.string().min(3).max(120),
  code: z.string().length(6),
  referralCode: z.string().optional(),
});
export async function POST(request: Request) {
  try {
    const data = input.parse(await request.json());
    if (data.code !== env.OTP_DEV_CODE)
      return NextResponse.json({ error: { message: "Invalid OTP" } }, { status: 401 });
    const user = await findOrCreateUser(data.identifier, data.referralCode);
    await issueSession({ userId: user.id, role: user.role });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error && error.message === "INVALID_REFERRAL"
        ? "Invalid referral"
        : "Invalid input";
    return NextResponse.json({ error: { message } }, { status: 400 });
  }
}
