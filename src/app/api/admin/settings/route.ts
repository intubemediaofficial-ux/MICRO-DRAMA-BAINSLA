import { NextResponse } from "next/server";
import { z } from "zod";
import { adminSession } from "@/server/admin";
import {
  getSettings,
  SECRET_SETTING_KEYS,
  setSettings,
  type SettingsPatch,
} from "@/server/settings";

const serviceAccount = z
  .string()
  .max(30_000)
  .nullable()
  .optional()
  .superRefine((value, context) => {
    if (!value?.trim()) return;
    try {
      const parsed: unknown = JSON.parse(value);
      if (
        !parsed ||
        typeof parsed !== "object" ||
        !("client_email" in parsed) ||
        !("private_key" in parsed) ||
        !("project_id" in parsed) ||
        typeof parsed.client_email !== "string" ||
        typeof parsed.private_key !== "string" ||
        typeof parsed.project_id !== "string" ||
        !parsed.client_email.trim() ||
        !parsed.private_key.trim() ||
        !parsed.project_id.trim()
      )
        context.addIssue({ code: "custom", message: "Invalid Firebase service account JSON" });
    } catch {
      context.addIssue({ code: "custom", message: "Invalid Firebase service account JSON" });
    }
  });

const settingsPatch = z.object({
  RAZORPAY_KEY_ID: z.string().max(255).optional(),
  RAZORPAY_KEY_SECRET: z.string().max(1_000).nullable().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().max(1_000).nullable().optional(),
  MUSE_API_KEY: z.string().max(1_000).nullable().optional(),
  MUSE_TEXT_MODEL: z.string().trim().max(120).optional(),
  MUSE_IMAGE_MODEL: z.string().trim().max(120).optional(),
  PAYMENTS_ENABLED: z.boolean().optional(),
  FIREBASE_SERVICE_ACCOUNT_JSON: serviceAccount,
  FIREBASE_ANDROID_APP_ID: z.string().max(255).optional(),
  FIREBASE_API_KEY: z.string().max(255).optional(),
  FIREBASE_PROJECT_ID: z.string().max(255).optional(),
  FIREBASE_SENDER_ID: z.string().max(255).optional(),
  ANDROID_CERT_SHA256: z.string().max(4_000).optional(),
  GOOGLE_OAUTH_WEB_CLIENT_ID: z.string().max(512).optional(),
  ADMOB_REWARDED_UNIT_ID: z.string().max(255).optional(),
  ADS_ENABLED: z.boolean().optional(),
  REFERRAL_BONUS_COINS: z.number().int().min(0).max(1_000_000).optional(),
});

function secretStatus(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  return { set: Boolean(trimmed), last4: trimmed ? trimmed.slice(-4) : "" };
}

function serviceAccountStatus(value: string | undefined) {
  if (!value?.trim()) return { set: false, client_email: "" };
  try {
    const parsed = JSON.parse(value) as { client_email?: unknown };
    return {
      set: true,
      client_email: typeof parsed.client_email === "string" ? parsed.client_email : "",
    };
  } catch {
    return { set: true, client_email: "" };
  }
}

async function responseSettings() {
  const values = await getSettings();
  const safeValues = { ...values } as Record<string, unknown>;
  for (const key of SECRET_SETTING_KEYS) delete safeValues[key];
  return {
    ...safeValues,
    RAZORPAY_KEY_SECRET: secretStatus(values.RAZORPAY_KEY_SECRET),
    RAZORPAY_WEBHOOK_SECRET: secretStatus(values.RAZORPAY_WEBHOOK_SECRET),
    MUSE_API_KEY: secretStatus(values.MUSE_API_KEY),
    FIREBASE_SERVICE_ACCOUNT_JSON: serviceAccountStatus(values.FIREBASE_SERVICE_ACCOUNT_JSON),
  };
}

function errorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";
  const status = message === "UNAUTHENTICATED" ? 401 : message === "FORBIDDEN" ? 403 : 0;
  if (status) return NextResponse.json({ error: { message } }, { status });
  if (error instanceof z.ZodError)
    return NextResponse.json({ error: { message: "Invalid settings" } }, { status: 400 });
  return NextResponse.json({ error: { message: fallback } }, { status: 500 });
}

export async function GET() {
  try {
    await adminSession();
    return NextResponse.json({ settings: await responseSettings() });
  } catch (error) {
    return errorResponse(error, "Settings lookup failed");
  }
}

export async function PUT(request: Request) {
  try {
    const session = await adminSession();
    const patch = settingsPatch.parse(await request.json());
    await setSettings(patch as SettingsPatch, session.userId);
    return NextResponse.json({ settings: await responseSettings() });
  } catch (error) {
    return errorResponse(error, "Settings update failed");
  }
}
