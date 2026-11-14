import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";

const state = vi.hoisted(() => ({
  settings: {} as Record<string, unknown>,
}));

vi.mock("@/server/settings", () => ({
  getSettings: async () => state.settings,
}));

import { prisma } from "@/server/db";
import { clearFcmTokenCache, sendFcmNotifications } from "@/server/fcm";

const suffix = crypto.randomUUID();
const token = `fcm-test-${suffix}`;
let deviceId = "";

describe("FCM delivery", () => {
  beforeAll(async () => {
    const device = await prisma.deviceToken.create({ data: { token } });
    deviceId = device.id;
  });

  afterAll(async () => {
    await prisma.deviceToken.deleteMany({ where: { token } });
  });

  it("does nothing when push credentials are not configured", async () => {
    state.settings = {};
    const fetcher = vi.fn();
    await expect(
      sendFcmNotifications([token], { title: "Title", body: "Body" }, fetcher as typeof fetch),
    ).resolves.toEqual({ configured: false, sent: 0, failed: 0 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("removes an unregistered token returned by FCM", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    state.settings = {
      FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
        client_email: "firebase@example.test",
        private_key: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
        project_id: "test-project",
      }),
    };
    clearFcmTokenCache();
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("oauth2.googleapis.com"))
        return new Response(JSON.stringify({ access_token: "test-access-token", expires_in: 3600 }), {
          status: 200,
        });
      return new Response(JSON.stringify({ error: { status: "UNREGISTERED" } }), {
        status: 404,
      });
    });
    const result = await sendFcmNotifications(
      [token],
      { title: "Title", body: "Body" },
      fetcher as typeof fetch,
    );
    expect(result).toEqual({ configured: true, sent: 0, failed: 1 });
    expect(await prisma.deviceToken.findUnique({ where: { token } })).toBeNull();
    expect(deviceId).toBeTruthy();
    clearFcmTokenCache();
  });

  it("does not reuse an access token for a different service account", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const privateKeyPem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
    let tokenRequestCount = 0;
    const bearerTokens: string[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("oauth2.googleapis.com")) {
        tokenRequestCount += 1;
        return new Response(JSON.stringify({ access_token: `access-${tokenRequestCount}`, expires_in: 3600 }), {
          status: 200,
        });
      }
      bearerTokens.push(new Headers(init?.headers).get("authorization") ?? "");
      return new Response(JSON.stringify({ name: "message" }), { status: 200 });
    });
    clearFcmTokenCache();
    state.settings = {
      FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
        client_email: "first@example.test",
        private_key: privateKeyPem,
        project_id: "first-project",
      }),
    };
    await sendFcmNotifications([token], { title: "Title", body: "Body" }, fetcher as typeof fetch);
    state.settings = {
      FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
        client_email: "second@example.test",
        private_key: privateKeyPem,
        project_id: "second-project",
      }),
    };
    await sendFcmNotifications([token], { title: "Title", body: "Body" }, fetcher as typeof fetch);
    expect(tokenRequestCount).toBe(2);
    expect(bearerTokens).toEqual(["Bearer access-1", "Bearer access-2"]);
    clearFcmTokenCache();
  });
});
