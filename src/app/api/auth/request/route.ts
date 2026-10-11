import { NextResponse } from "next/server";
import { z } from "zod";
import { requestOtp } from "@/server/otp";
import { rateLimit } from "@/server/rate-limit";

const input = z.object({ identifier: z.string().min(3).max(120) });

const errors: Record<string, [string, number]> = {
  PHONE_OTP_UNAVAILABLE: ["Phone OTP is not available yet. Please use your email address.", 400],
  OTP_UNAVAILABLE: ["OTP login is not available right now. Please use password login.", 503],
  OTP_TOO_SOON: ["Please wait a minute before requesting another OTP.", 429],
  OTP_SEND_FAILED: ["Could not send the OTP email. Please try again.", 502],
};

export async function POST(request: Request) {
  if (!rateLimit("auth:" + request.headers.get("x-forwarded-for"), 10))
    return NextResponse.json({ error: { message: "Too many requests" } }, { status: 429 });
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: { message: "Invalid identifier" } }, { status: 400 });
  try {
    const result = await requestOtp(parsed.data.identifier);
    return NextResponse.json({ ok: true, dev: result.dev });
  } catch (error) {
    const [message, status] = errors[error instanceof Error ? error.message : ""] ?? [
      "Could not send OTP. Please try again.",
      500,
    ];
    return NextResponse.json({ error: { message } }, { status });
  }
}
