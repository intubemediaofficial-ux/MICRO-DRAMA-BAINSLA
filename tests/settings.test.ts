import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/microdrama";
  process.env.SESSION_SECRET ??= "test-session-secret-123456";
  process.env.STREAM_TOKEN_SECRET ??= "test-stream-secret-123456";
});

import { prisma } from "@/server/db";
import {
  decryptSecret,
  encryptSecret,
  getSettings,
  invalidateSettingsCache,
  setSettings,
} from "@/server/settings";

const settingKeys = ["RAZORPAY_KEY_ID", "FIREBASE_SERVICE_ACCOUNT_JSON"] as const;
const originals = new Map<string, Awaited<ReturnType<typeof prisma.appSetting.findUnique>>>();

async function restoreSetting(key: (typeof settingKeys)[number]) {
  const original = originals.get(key);
  if (original) {
    await prisma.appSetting.upsert({
      where: { key },
      create: original,
      update: {
        value: original.value,
        isSecret: original.isSecret,
        updatedAt: original.updatedAt,
        updatedById: original.updatedById,
      },
    });
  } else {
    await prisma.appSetting.deleteMany({ where: { key } });
  }
}

describe("application settings", () => {
  beforeAll(async () => {
    for (const key of settingKeys)
      originals.set(key, await prisma.appSetting.findUnique({ where: { key } }));
  });

  afterAll(async () => {
    for (const key of settingKeys) await restoreSetting(key);
    invalidateSettingsCache();
    vi.unstubAllEnvs();
  });

  it("encrypts and decrypts secrets with authenticated encryption", () => {
    const ciphertext = encryptSecret("private-setting");
    expect(ciphertext).toMatch(/^v1:/);
    expect(ciphertext).not.toContain("private-setting");
    expect(decryptSecret(ciphertext)).toBe("private-setting");

    const parts = ciphertext.split(":");
    parts[2] = `${parts[2]![0] === "A" ? "B" : "A"}${parts[2]!.slice(1)}`;
    expect(() => decryptSecret(parts.join(":"))).toThrow("INVALID_APP_SETTING_CIPHERTEXT");
  });

  it("uses a database value ahead of the matching environment value", async () => {
    vi.stubEnv("RAZORPAY_KEY_ID", "environment-key");
    await setSettings({ RAZORPAY_KEY_ID: "database-key" }, "settings-test");
    expect((await getSettings()).RAZORPAY_KEY_ID).toBe("database-key");
  });

  it("keeps a saved secret when a blank secret is submitted", async () => {
    await setSettings({ FIREBASE_SERVICE_ACCOUNT_JSON: '{"project_id":"test"}' }, "settings-test");
    await setSettings({ FIREBASE_SERVICE_ACCOUNT_JSON: "  " }, "settings-test");
    expect((await getSettings()).FIREBASE_SERVICE_ACCOUNT_JSON).toBe('{"project_id":"test"}');
  });
});
