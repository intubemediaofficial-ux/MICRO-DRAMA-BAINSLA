import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./config";

export type CheckoutInput = {
  userId: string;
  subscriptionId: string;
  amountMinor: number;
  currency: string;
  trial: boolean;
  periodKey?: string;
};
export type ProviderCharge = { providerRef: string };
export type ProviderWebhook = {
  eventId: string;
  type: "PAYMENT_SUCCEEDED" | "PAYMENT_FAILED" | "SUBSCRIPTION_CANCELED";
  providerRef: string;
};

export interface SubscriptionProvider {
  readonly name: "DEV" | "STRIPE";
  createTrialCheckout(input: CheckoutInput): Promise<ProviderCharge>;
  chargeRenewal(input: CheckoutInput): Promise<ProviderCharge>;
  cancel(providerRef: string): Promise<void>;
  verifyWebhook(payload: string, signature: string | null): ProviderWebhook;
}

export class DevSubscriptionProvider implements SubscriptionProvider {
  readonly name = "DEV" as const;
  async createTrialCheckout(input: CheckoutInput) {
    return { providerRef: `dev_trial_${input.periodKey ?? input.subscriptionId}` };
  }
  async chargeRenewal(input: CheckoutInput) {
    return {
      providerRef: `dev_renewal_${input.subscriptionId}_${input.periodKey ?? Date.now()}`,
    };
  }
  async cancel(_providerRef: string) {}
  verifyWebhook(payload: string) {
    const parsed = JSON.parse(payload) as Partial<ProviderWebhook>;
    if (
      typeof parsed.eventId !== "string" ||
      typeof parsed.providerRef !== "string" ||
      (parsed.type !== "PAYMENT_SUCCEEDED" &&
        parsed.type !== "PAYMENT_FAILED" &&
        parsed.type !== "SUBSCRIPTION_CANCELED")
    )
      throw new Error("INVALID_WEBHOOK");
    return {
      eventId: parsed.eventId,
      providerRef: parsed.providerRef,
      type: parsed.type,
    };
  }
}

export class StripeSubscriptionProvider implements SubscriptionProvider {
  readonly name = "STRIPE" as const;
  private readonly api = "https://api.stripe.com/v1";

  private async request(path: string, body: URLSearchParams) {
    const response = await fetch(`${this.api}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        "content-type": "application/x-www-form-urlencoded",
        ...(body.get("metadata[period_key]")
          ? { "Idempotency-Key": body.get("metadata[period_key]")! }
          : {}),
      },
      body,
    });
    if (!response.ok) throw new Error("STRIPE_REQUEST_FAILED");
    return response.json();
  }

  async createTrialCheckout(input: CheckoutInput) {
    const result = (await this.request(
      "/payment_intents",
      new URLSearchParams({
        amount: String(input.amountMinor),
        currency: input.currency.toLowerCase(),
        "metadata[user_id]": input.userId,
        "metadata[subscription_id]": input.subscriptionId,
        ...(input.periodKey ? { "metadata[period_key]": input.periodKey } : {}),
      }),
    )) as { id: string };
    return { providerRef: result.id };
  }

  async chargeRenewal(input: CheckoutInput) {
    return this.createTrialCheckout({ ...input, trial: false });
  }

  async cancel(providerRef: string) {
    const response = await fetch(`${this.api}/payment_intents/${providerRef}/cancel`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
    });
    if (!response.ok) throw new Error("STRIPE_CANCEL_FAILED");
  }

  verifyWebhook(payload: string, signature: string | null) {
    if (!env.STRIPE_WEBHOOK_SECRET || !signature) throw new Error("INVALID_WEBHOOK_SIGNATURE");
    const [timestampPart, signaturePart] = signature.split(",");
    const timestamp = timestampPart?.replace("t=", "");
    const received = signaturePart?.replace("v1=", "");
    if (!timestamp || !received) throw new Error("INVALID_WEBHOOK_SIGNATURE");
    const expected = createHmac("sha256", env.STRIPE_WEBHOOK_SECRET)
      .update(`${timestamp}.${payload}`)
      .digest("hex");
    if (
      received.length !== expected.length ||
      !timingSafeEqual(Buffer.from(received), Buffer.from(expected))
    )
      throw new Error("INVALID_WEBHOOK_SIGNATURE");
    const parsed = JSON.parse(payload) as {
      id?: string;
      type?: string;
      data?: { object?: { id?: string } };
    };
    const type: ProviderWebhook["type"] | null =
      parsed.type === "invoice.payment_succeeded"
        ? "PAYMENT_SUCCEEDED"
        : parsed.type === "invoice.payment_failed"
          ? "PAYMENT_FAILED"
          : parsed.type === "customer.subscription.deleted"
            ? "SUBSCRIPTION_CANCELED"
            : null;
    if (!parsed.id || !type || !parsed.data?.object?.id) throw new Error("INVALID_WEBHOOK");
    return { eventId: parsed.id, type, providerRef: parsed.data.object.id };
  }
}

export function subscriptionProvider() {
  return env.STRIPE_SECRET_KEY ? new StripeSubscriptionProvider() : new DevSubscriptionProvider();
}
