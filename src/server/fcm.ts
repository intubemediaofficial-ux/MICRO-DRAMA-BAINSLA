import { importPKCS8, SignJWT } from "jose";
import { prisma } from "./db";
import { getSettings } from "./settings";

const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const FCM_URL = "https://fcm.googleapis.com/v1/projects";
let cachedAccessToken: { identity: string; value: string; expiresAt: number } | null = null;

type FcmPayload = { title: string; body: string; data?: Record<string, string> };
type ServiceAccount = { client_email: string; private_key: string; project_id: string };
type Fetcher = typeof fetch;

async function serviceAccount(): Promise<ServiceAccount | null> {
  const value = (await getSettings()).FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<ServiceAccount>;
    if (parsed.client_email && parsed.private_key && parsed.project_id)
      return parsed as ServiceAccount;
  } catch {
    return null;
  }
  return null;
}

export async function isFcmConfigured() {
  return Boolean(await serviceAccount());
}

async function accessToken(account: ServiceAccount, fetcher: Fetcher) {
  const identity = `${account.client_email}:${account.project_id}`;
  if (
    cachedAccessToken?.identity === identity &&
    cachedAccessToken.expiresAt > Date.now()
  )
    return cachedAccessToken.value;
  const privateKey = await importPKCS8(account.private_key, "RS256");
  const assertion = await new SignJWT({ scope: FCM_SCOPE })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(account.client_email)
    .setAudience(TOKEN_URL)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);
  const response = await fetcher(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const result = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!response.ok || !result.access_token) return null;
  cachedAccessToken = {
    identity,
    value: result.access_token,
    expiresAt: Date.now() + Math.max(0, (result.expires_in ?? 3600) * 1000 - 5 * 60 * 1000),
  };
  return result.access_token;
}

function tokenInvalid(status: number, error: Record<string, unknown>) {
  if (status === 404 || error.status === "UNREGISTERED") return true;
  const details = Array.isArray(error.details) ? error.details : [];
  if (
    details.some(
      (detail) =>
        detail &&
        typeof detail === "object" &&
        "errorCode" in detail &&
        detail.errorCode === "UNREGISTERED",
    )
  )
    return true;
  return (
    error.status === "INVALID_ARGUMENT" &&
    details.some(
      (detail) =>
        detail &&
        typeof detail === "object" &&
        "fieldViolations" in detail &&
        Array.isArray(detail.fieldViolations) &&
        detail.fieldViolations.some(
          (violation: { field?: string }) =>
            typeof violation.field === "string" && violation.field.includes("token"),
        ),
    )
  );
}

export async function sendFcmNotifications(
  tokens: string[],
  payload: FcmPayload,
  fetcher: Fetcher = fetch,
) {
  const account = await serviceAccount();
  if (!account) return { configured: false, sent: 0, failed: 0 };
  const bearer = await accessToken(account, fetcher).catch(() => null);
  if (!bearer) return { configured: true, sent: 0, failed: tokens.length };
  let next = 0;
  let sent = 0;
  let failed = 0;
  const invalidTokens: string[] = [];
  const worker = async () => {
    while (next < tokens.length) {
      const token = tokens[next++];
      try {
        const response = await fetcher(
          `${FCM_URL}/${encodeURIComponent(account.project_id)}/messages:send`,
          {
            method: "POST",
            headers: {
              authorization: `Bearer ${bearer}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              message: {
                token,
                data: {
                  ...payload.data,
                  title: payload.title,
                  body: payload.body,
                },
                android: { priority: "HIGH" },
              },
            }),
          },
        );
        if (response.ok) {
          sent += 1;
        } else {
          failed += 1;
          const result = (await response.json().catch(() => ({}))) as {
            error?: Record<string, unknown>;
          };
          if (tokenInvalid(response.status, result.error ?? {})) invalidTokens.push(token);
        }
      } catch {
        failed += 1;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(20, tokens.length) }, () => worker()));
  if (invalidTokens.length)
    await prisma.deviceToken.deleteMany({ where: { token: { in: invalidTokens } } });
  return { configured: true, sent, failed };
}

export function clearFcmTokenCache() {
  cachedAccessToken = null;
}
