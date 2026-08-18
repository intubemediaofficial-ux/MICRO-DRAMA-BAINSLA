import { NextResponse } from "next/server";
import { env } from "@/server/config";
import { runSubscriptionCron } from "@/server/subscriptions";

export async function POST(request: Request) {
  if (request.headers.get("x-cron-secret") !== env.CRON_SECRET)
    return NextResponse.json({ error: { message: "Unauthorized" } }, { status: 401 });
  return NextResponse.json(await runSubscriptionCron());
}
