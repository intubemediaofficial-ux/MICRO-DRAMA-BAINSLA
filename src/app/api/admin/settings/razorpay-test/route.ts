import { NextResponse } from "next/server";
import { adminSession } from "@/server/admin";
import { getSettings } from "@/server/settings";

export async function POST() {
  try {
    await adminSession();
    const settings = await getSettings();
    if (!settings.RAZORPAY_KEY_ID || !settings.RAZORPAY_KEY_SECRET)
      return NextResponse.json(
        { ok: false, message: "Save a Razorpay key ID and key secret first." },
        { status: 400 },
      );
    const authorization = Buffer.from(
      `${settings.RAZORPAY_KEY_ID}:${settings.RAZORPAY_KEY_SECRET}`,
    ).toString("base64");
    const response = await fetch("https://api.razorpay.com/v1/plans?count=1", {
      headers: { Authorization: `Basic ${authorization}` },
    }).catch(() => null);
    if (!response)
      return NextResponse.json(
        { ok: false, message: "Could not reach Razorpay. Try again later." },
        { status: 502 },
      );
    if (!response.ok)
      return NextResponse.json(
        { ok: false, message: "Razorpay rejected the saved keys." },
        { status: 400 },
      );
    return NextResponse.json({ ok: true, message: "Razorpay keys are valid." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Razorpay key test failed";
    const status = message === "UNAUTHENTICATED" ? 401 : message === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json(
      { ok: false, message: status === 500 ? "Razorpay key test failed." : message },
      { status },
    );
  }
}
