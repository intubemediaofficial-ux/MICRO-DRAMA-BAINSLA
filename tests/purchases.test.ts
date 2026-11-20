import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/microdrama";
  process.env.SESSION_SECRET ??= "test-session-secret-123456";
  process.env.STREAM_TOKEN_SECRET ??= "test-stream-secret-123456";
  return { token: "", paymentsEnabled: false };
});

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (state.token ? { value: state.token } : undefined),
    set: (_name: string, value: string) => {
      state.token = value;
    },
    delete: () => {
      state.token = "";
    },
  }),
}));

vi.mock("@/server/settings", () => ({
  getSettings: async () => ({
    RAZORPAY_KEY_ID: "rzp_test_key",
    RAZORPAY_KEY_SECRET: "coin-purchase-test-secret",
    RAZORPAY_WEBHOOK_SECRET: "webhook-test-secret",
    PAYMENTS_ENABLED: state.paymentsEnabled,
  }),
}));

import { issueSession } from "@/server/auth";
import { prisma } from "@/server/db";
import { POST as createPurchase } from "@/app/api/purchases/route";
import { POST as verifyPurchase } from "@/app/api/purchases/verify/route";
import { processRazorpayWebhook } from "@/server/razorpay";

const suffix = crypto.randomUUID().slice(0, 8);
const keySecret = "coin-purchase-test-secret";
const userIds: string[] = [];
let bundleId = "";
let orderCounter = 0;

async function createOrder() {
  const response = await createPurchase(
    new Request("http://localhost/api/purchases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bundleId }),
    }),
  );
  return { response, body: await response.json() };
}

function sign(orderId: string, paymentId: string) {
  return createHmac("sha256", keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
}

describe("Razorpay coin purchases", () => {
  beforeAll(async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        expect(url).toBe("https://api.razorpay.com/v1/orders");
        const body = JSON.parse(String(init.body));
        expect(body).toMatchObject({
          amount: 499,
          currency: "INR",
          notes: { userId: expect.any(String), purchaseId: expect.any(String) },
        });
        orderCounter += 1;
        return new Response(JSON.stringify({ id: `order_${suffix}_${orderCounter}` }), {
          status: 200,
        });
      }),
    );
    const users = await Promise.all(
      ["owner", "other"].map((name) =>
        prisma.user.create({
          data: { email: `purchase-${name}-${suffix}@test.local`, referralCode: `PU${name}${suffix}` },
        }),
      ),
    );
    userIds.push(...users.map((user) => user.id));
    const bundle = await prisma.coinBundle.create({
      data: { coins: 100, bonusCoins: 20, priceMinor: 499, currency: "INR" },
    });
    bundleId = bundle.id;
    await issueSession({ userId: userIds[0]!, role: "USER" });
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await prisma.purchase.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.coinTransaction.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.coinBundle.deleteMany({ where: { id: bundleId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    state.token = "";
  });

  it("returns 503 instead of granting coins when payments are disabled", async () => {
    state.paymentsEnabled = false;
    const { response, body } = await createOrder();
    expect(response.status).toBe(503);
    expect(body.error.message).toBe("Coin packs open soon");
    expect(await prisma.purchase.count({ where: { userId: userIds[0] } })).toBe(0);
  });

  it("creates a pending order and credits only after valid, owned verification", async () => {
    state.paymentsEnabled = true;
    const { response: createResponse, body: checkout } = await createOrder();
    expect(createResponse.status).toBe(200);
    expect(checkout).toMatchObject({
      orderId: `order_${suffix}_1`,
      keyId: "rzp_test_key",
      amount: 499,
      currency: "INR",
    });
    const pending = await prisma.purchase.findUniqueOrThrow({
      where: { id: checkout.purchaseId },
    });
    expect(pending).toMatchObject({
      provider: "RAZORPAY",
      providerRef: checkout.orderId,
      status: "PENDING",
      coinsGranted: 120,
    });

    const paymentId = `pay_${suffix}_1`;
    const verification = {
      razorpay_order_id: checkout.orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: sign(checkout.orderId, paymentId),
    };
    const bad = await verifyPurchase(
      new Request("http://localhost/api/purchases/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...verification, razorpay_signature: "bad" }),
      }),
    );
    expect(bad.status).toBe(400);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userIds[0] } })).coinBalance).toBe(0);

    const otherSession = await issueSession({ userId: userIds[1]!, role: "USER" });
    const otherResponse = await verifyPurchase(
      new Request("http://localhost/api/purchases/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(verification),
      }),
    );
    expect(otherResponse.status).toBe(404);
    await issueSession({ userId: userIds[0]!, role: "USER" });
    expect(otherSession).toBeUndefined();

    const verified = await verifyPurchase(
      new Request("http://localhost/api/purchases/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(verification),
      }),
    );
    expect(verified.status).toBe(200);
    expect(await prisma.purchase.findUniqueOrThrow({ where: { id: checkout.purchaseId } })).toMatchObject({
      status: "COMPLETED",
    });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userIds[0] } })).coinBalance).toBe(120);
    expect(
      await prisma.coinTransaction.count({
        where: { userId: userIds[0], refType: "purchase", refId: checkout.purchaseId },
      }),
    ).toBe(1);

    await verifyPurchase(
      new Request("http://localhost/api/purchases/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(verification),
      }),
    );
    const webhook = {
      event: "payment.captured",
      payload: { payment: { entity: { id: paymentId, order_id: checkout.orderId } } },
    };
    expect(
      await processRazorpayWebhook(`evt_purchase_${suffix}`, webhook),
    ).toMatchObject({ handled: true });
    expect(
      await processRazorpayWebhook(`evt_purchase_${suffix}`, webhook),
    ).toMatchObject({ duplicate: true });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userIds[0] } })).coinBalance).toBe(120);
    expect(
      await prisma.coinTransaction.count({
        where: { userId: userIds[0], refType: "purchase", refId: checkout.purchaseId },
      }),
    ).toBe(1);

    const secondOrder = await createOrder();
    expect(secondOrder.response.status).toBe(200);
    await processRazorpayWebhook(`evt_order_paid_${suffix}`, {
      event: "order.paid",
      payload: { order: { entity: { id: secondOrder.body.orderId } } },
    });
    expect(
      await prisma.purchase.findUniqueOrThrow({ where: { id: secondOrder.body.purchaseId } }),
    ).toMatchObject({ status: "COMPLETED" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userIds[0] } })).coinBalance).toBe(
      240,
    );
  });
});
