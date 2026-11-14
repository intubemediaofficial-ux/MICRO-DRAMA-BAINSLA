import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const cookieState = vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/microdrama";
  process.env.SESSION_SECRET ??= "test-session-secret-123456";
  process.env.STREAM_TOKEN_SECRET ??= "test-stream-secret-123456";
  return { token: "" };
});

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (cookieState.token ? { value: cookieState.token } : undefined),
    set: (_name: string, value: string) => {
      cookieState.token = value;
    },
    delete: () => {
      cookieState.token = "";
    },
  }),
}));

import { issueSession } from "@/server/auth";
import { prisma } from "@/server/db";
import { GET as getSettings } from "@/app/api/admin/settings/route";
import { getSettings as readSettings, setSettings } from "@/server/settings";

const suffix = crypto.randomUUID().slice(0, 8);
let userId = "";
let adminId = "";
let originalSecret: Awaited<ReturnType<typeof prisma.appSetting.findUnique>> = null;

describe("admin settings API", () => {
  beforeAll(async () => {
    const [user, admin] = await Promise.all([
      prisma.user.create({
        data: { email: `settings-user-${suffix}@test.local`, referralCode: `SU${suffix}` },
      }),
      prisma.user.create({
        data: {
          email: `settings-admin-${suffix}@test.local`,
          referralCode: `SA${suffix}`,
          role: "ADMIN",
        },
      }),
    ]);
    userId = user.id;
    adminId = admin.id;
    originalSecret = await prisma.appSetting.findUnique({
      where: { key: "RAZORPAY_KEY_SECRET" },
    });
  });

  afterAll(async () => {
    if (originalSecret) {
      await prisma.appSetting.upsert({
        where: { key: originalSecret.key },
        create: originalSecret,
        update: {
          value: originalSecret.value,
          isSecret: originalSecret.isSecret,
          updatedAt: originalSecret.updatedAt,
          updatedById: originalSecret.updatedById,
        },
      });
    } else {
      await prisma.appSetting.deleteMany({ where: { key: "RAZORPAY_KEY_SECRET" } });
    }
    await prisma.user.deleteMany({ where: { id: { in: [userId, adminId] } } });
    cookieState.token = "";
  });

  it("rejects unauthenticated and non-admin requests", async () => {
    cookieState.token = "";
    expect((await getSettings()).status).toBe(401);

    await issueSession({ userId, role: "USER" });
    expect((await getSettings()).status).toBe(403);
  });

  it("redacts secret values from the admin response", async () => {
    const marker = `secret-${suffix}`;
    await setSettings({ RAZORPAY_KEY_SECRET: marker }, adminId);
    await issueSession({ userId: adminId, role: "ADMIN" });

    const response = await getSettings();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.settings.RAZORPAY_KEY_SECRET).toMatchObject({
      set: true,
      last4: marker.slice(-4),
    });
    expect(JSON.stringify(body)).not.toContain(marker);
    expect((await readSettings()).RAZORPAY_KEY_SECRET).toBe(marker);
  });
});
