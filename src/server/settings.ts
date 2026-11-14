import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "./config";
import { prisma } from "./db";

export const SETTING_REGISTRY = {
  RAZORPAY_KEY_ID: { kind: "string", secret: false },
  RAZORPAY_KEY_SECRET: { kind: "string", secret: true },
  RAZORPAY_WEBHOOK_SECRET: { kind: "string", secret: true },
  PAYMENTS_ENABLED: { kind: "boolean", secret: false, default: false },
  FIREBASE_SERVICE_ACCOUNT_JSON: { kind: "string", secret: true },
  FIREBASE_ANDROID_APP_ID: { kind: "string", secret: false },
  FIREBASE_API_KEY: { kind: "string", secret: false },
  FIREBASE_PROJECT_ID: { kind: "string", secret: false },
  FIREBASE_SENDER_ID: { kind: "string", secret: false },
  GOOGLE_OAUTH_WEB_CLIENT_ID: { kind: "string", secret: false },
  ADMOB_REWARDED_UNIT_ID: { kind: "string", secret: false },
  ADS_ENABLED: { kind: "boolean", secret: false, default: false },
  REFERRAL_BONUS_COINS: { kind: "integer", secret: false, default: 50 },
} as const;

export const SECRET_SETTING_KEYS = [
  "RAZORPAY_KEY_SECRET",
  "RAZORPAY_WEBHOOK_SECRET",
  "FIREBASE_SERVICE_ACCOUNT_JSON",
] as const;

type SettingKey = keyof typeof SETTING_REGISTRY;
type SecretSettingKey = (typeof SECRET_SETTING_KEYS)[number];
type SettingValue<K extends SettingKey> =
  (typeof SETTING_REGISTRY)[K]["kind"] extends "boolean"
    ? boolean
    : (typeof SETTING_REGISTRY)[K]["kind"] extends "integer"
      ? number
      : string | undefined;

export type AppSettings = { [K in SettingKey]: SettingValue<K> };
export type PublicSettings = Omit<AppSettings, SecretSettingKey>;
export type SettingsPatch = {
  [K in SettingKey]?: AppSettings[K] | (K extends SecretSettingKey ? null : never);
};

const secretKeySet = new Set<string>(SECRET_SETTING_KEYS);
const settingKeys = Object.keys(SETTING_REGISTRY) as SettingKey[];
const publicSettingKeys = settingKeys.filter((key) => !secretKeySet.has(key)) as (keyof PublicSettings)[];
const CACHE_TTL_MS = 30_000;

let cached: { expiresAt: number; value: AppSettings } | undefined;

function encryptionKey() {
  return createHash("sha256").update(`app-settings:${env.SESSION_SECRET}`).digest();
}

export function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${ciphertext.toString("base64url")}`;
}

export function decryptSecret(value: string) {
  const [version, encodedIv, encodedTag, encodedCiphertext, extra] = value.split(":");
  if (version !== "v1" || !encodedIv || !encodedTag || encodedCiphertext === undefined || extra)
    throw new Error("INVALID_APP_SETTING_CIPHERTEXT");
  const iv = Buffer.from(encodedIv, "base64url");
  const tag = Buffer.from(encodedTag, "base64url");
  if (iv.length !== 12 || tag.length !== 16) throw new Error("INVALID_APP_SETTING_CIPHERTEXT");
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(Buffer.from(encodedCiphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("INVALID_APP_SETTING_CIPHERTEXT");
  }
}

function parseValue<K extends SettingKey>(key: K, raw: string): AppSettings[K] {
  const definition = SETTING_REGISTRY[key];
  if (definition.kind === "boolean") {
    if (raw === "true" || raw === "1") return true as AppSettings[K];
    if (raw === "false" || raw === "0") return false as AppSettings[K];
    throw new Error("INVALID_APP_SETTING_VALUE");
  }
  if (definition.kind === "integer") {
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < 0) throw new Error("INVALID_APP_SETTING_VALUE");
    return value as AppSettings[K];
  }
  return (raw.trim() ? raw : undefined) as AppSettings[K];
}

function environmentValue<K extends SettingKey>(key: K): AppSettings[K] {
  const raw = process.env[key];
  if (raw !== undefined) return parseValue(key, raw);
  const definition = SETTING_REGISTRY[key];
  const fallback = "default" in definition ? definition.default : undefined;
  if (fallback !== undefined) return fallback as AppSettings[K];
  return undefined as AppSettings[K];
}

function serializeValue(key: SettingKey, value: string | number | boolean): string {
  const kind = SETTING_REGISTRY[key].kind;
  if (kind === "boolean" && typeof value === "boolean") return String(value);
  if (kind === "integer" && typeof value === "number" && Number.isSafeInteger(value) && value >= 0)
    return String(value);
  if (kind === "string" && typeof value === "string") return value;
  throw new Error("INVALID_APP_SETTING_VALUE");
}

export async function getSettings(): Promise<AppSettings> {
  if (cached && cached.expiresAt > Date.now()) return { ...cached.value };

  const records = await prisma.appSetting.findMany();
  const byKey = new Map(records.map((record) => [record.key, record.value]));
  const value = {} as AppSettings;
  for (const key of settingKeys) {
    const stored = byKey.get(key);
    const raw = stored === undefined
      ? undefined
      : secretKeySet.has(key)
        ? decryptSecret(stored)
        : stored;
    (value as Record<SettingKey, unknown>)[key] =
      raw === undefined ? environmentValue(key) : parseValue(key, raw);
  }

  cached = { expiresAt: Date.now() + CACHE_TTL_MS, value };
  return { ...value };
}

export async function setSettings(patch: SettingsPatch, actorId: string) {
  const writes = Object.entries(patch) as [
    SettingKey,
    string | number | boolean | null | undefined,
  ][];
  await prisma.$transaction(async (tx) => {
    for (const [key, input] of writes) {
      if (input === undefined) continue;
      const isSecret = secretKeySet.has(key);
      if (isSecret && typeof input === "string" && !input.trim()) continue;
      if (input === null && !isSecret) throw new Error("INVALID_APP_SETTING_VALUE");
      const raw = input === null ? "" : serializeValue(key, input);
      await tx.appSetting.upsert({
        where: { key },
        create: {
          key,
          value: isSecret ? encryptSecret(raw) : raw,
          isSecret,
          updatedById: actorId,
        },
        update: {
          value: isSecret ? encryptSecret(raw) : raw,
          isSecret,
          updatedById: actorId,
        },
      });
    }
  });
  cached = undefined;
  return getSettings();
}

export function invalidateSettingsCache() {
  cached = undefined;
}

export async function publicSettings(): Promise<PublicSettings> {
  const settings = await getSettings();
  return Object.fromEntries(publicSettingKeys.map((key) => [key, settings[key]])) as PublicSettings;
}
