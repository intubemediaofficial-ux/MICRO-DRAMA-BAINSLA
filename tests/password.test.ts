import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";

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
  }),
}));

import { issueSession } from "../src/server/auth";
import { prisma } from "../src/server/db";
import { hashPassword } from "../src/server/password";
import { POST as loginPost } from "../src/app/api/auth/password/login/route";
import { PATCH as changePasswordPatch } from "../src/app/api/auth/password/route";

const suffix = crypto.randomUUID();
let userId = "";
let disabledId = "";
let noPasswordId = "";

function login(email: string, password: string) {
  return loginPost(
    new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ email, password }),
      headers: { "content-type": "application/json" },
    }),
  );
}

describe("password authentication", () => {
  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `password-${suffix}@test.local`,
        passwordHash: await hashPassword("correct horse battery staple"),
        referralCode: `PW${suffix.slice(0, 8)}`,
      },
    });
    const disabled = await prisma.user.create({
      data: {
        email: `disabled-password-${suffix}@test.local`,
        passwordHash: await hashPassword("correct horse battery staple"),
        isDisabled: true,
        referralCode: `DP${suffix.slice(0, 8)}`,
      },
    });
    const noPassword = await prisma.user.create({
      data: {
        email: `no-password-${suffix}@test.local`,
        referralCode: `NP${suffix.slice(0, 8)}`,
      },
    });
    userId = user.id;
    disabledId = disabled.id;
    noPasswordId = noPassword.id;
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [userId, disabledId, noPasswordId] } } });
  });

  it("logs in with the correct password and issues a session", async () => {
    const response = await login(`PASSWORD-${suffix}@TEST.LOCAL`, "correct horse battery staple");
    expect(response.status).toBe(200);
    expect(cookieState.token).toBeTruthy();
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(stored.passwordHash).toMatch(/^scrypt\$16384\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    expect(stored.passwordHash).not.toContain("correct horse battery staple");
  });

  it("uses the same generic failure for wrong, unknown, disabled, and unset passwords", async () => {
    const responses = await Promise.all([
      login(`password-${suffix}@test.local`, "wrong password"),
      login(`unknown-${suffix}@test.local`, "wrong password"),
      login(`disabled-password-${suffix}@test.local`, "correct horse battery staple"),
      login(`no-password-${suffix}@test.local`, "anything"),
    ]);
    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        error: { message: "Invalid email or password" },
      });
    }
  });

  it("requires the current password when changing it", async () => {
    await issueSession({ userId, role: "USER" });
    const invalid = await changePasswordPatch(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({
          currentPassword: "wrong password",
          newPassword: "new password 123",
        }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(invalid.status).toBe(400);
    const changed = await changePasswordPatch(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({
          currentPassword: "correct horse battery staple",
          newPassword: "new password 123",
        }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(changed.status).toBe(200);
    expect((await login(`password-${suffix}@test.local`, "new password 123")).status).toBe(200);
  });
});
