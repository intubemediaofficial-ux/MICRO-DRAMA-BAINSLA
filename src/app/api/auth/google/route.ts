import { NextResponse } from "next/server";
import { z } from "zod";
import { consumeReferralCode, findOrCreateUser, issueSession } from "@/server/auth";
import { verifyGoogleIdToken } from "@/server/google-auth";
import { rateLimit } from "@/server/rate-limit";
import { getSettings } from "@/server/settings";

const input = z.object({
  idToken: z.string().min(1).max(10_000),
  referralCode: z.string().trim().max(64).optional(),
});

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  if (!rateLimit(`google-login:${ip}`, 10))
    return NextResponse.json({ error: { message: "Too many requests" } }, { status: 429 });
  const settings = await getSettings();
  if (!settings.GOOGLE_OAUTH_WEB_CLIENT_ID)
    return NextResponse.json({ error: { message: "Google sign-in is not configured" } }, { status: 503 });
  try {
    const { idToken, referralCode: explicitReferralCode } = input.parse(await request.json());
    const identity = await verifyGoogleIdToken(idToken, settings.GOOGLE_OAUTH_WEB_CLIENT_ID);
    const referralCode = await consumeReferralCode(explicitReferralCode);
    const user = await findOrCreateUser(identity.email, referralCode, identity.name);
    await issueSession({ userId: user.id, role: user.role });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (error instanceof z.ZodError)
      return NextResponse.json({ error: { message: "Invalid Google token" } }, { status: 400 });
    if (message === "ACCOUNT_DISABLED")
      return NextResponse.json({ error: { message: "Account disabled" } }, { status: 403 });
    return NextResponse.json({ error: { message: "Google sign-in failed" } }, { status: 401 });
  }
}
