import { verify as verifySignature, type KeyObject } from "node:crypto";

const KEY_URL = "https://www.gstatic.com/admob/reward/verifier-keys.json";
type VerifierKey = { keyId: number; pem: string };
let cachedKeys: VerifierKey[] = [];
let cachedUntil = 0;

async function fetchVerifierKeys(fetcher: typeof fetch, force = false): Promise<VerifierKey[]> {
  if (!force && cachedUntil > Date.now()) return cachedKeys;
  const response = await fetcher(KEY_URL, { cache: "no-store" });
  if (!response.ok) throw new Error("SSV_KEYS_UNAVAILABLE");
  const result = (await response.json()) as { keys?: VerifierKey[] };
  if (!Array.isArray(result.keys)) throw new Error("SSV_KEYS_INVALID");
  cachedKeys = result.keys;
  cachedUntil = Date.now() + 24 * 60 * 60 * 1000;
  return cachedKeys;
}

export function clearAdmobVerifierKeyCache() {
  cachedKeys = [];
  cachedUntil = 0;
}

export function parseAdmobSsvQuery(rawSearch: string) {
  const raw = rawSearch.startsWith("?") ? rawSearch.slice(1) : rawSearch;
  const signatureOffset = raw.indexOf("&signature=");
  if (signatureOffset <= 0 || raw.indexOf("&signature=", signatureOffset + 1) >= 0) return null;
  const message = raw.slice(0, signatureOffset);
  const suffix = raw.slice(signatureOffset + "&signature=".length);
  const keyOffset = suffix.indexOf("&key_id=");
  if (keyOffset <= 0) return null;
  const signature = suffix.slice(0, keyOffset);
  const keyIdText = suffix.slice(keyOffset + "&key_id=".length);
  if (!signature || !keyIdText || keyIdText.includes("&")) return null;
  const keyId = Number(keyIdText);
  if (!Number.isInteger(keyId)) return null;
  return { message, signature, keyId };
}

export async function verifyAdmobSignature(rawSearch: string, fetcher: typeof fetch = fetch) {
  const parsed = parseAdmobSsvQuery(rawSearch);
  if (!parsed) return false;
  let keys = await fetchVerifierKeys(fetcher);
  let key = keys.find((item) => item.keyId === parsed.keyId);
  if (!key) {
    keys = await fetchVerifierKeys(fetcher, true);
    key = keys.find((item) => item.keyId === parsed.keyId);
  }
  if (!key) return false;
  try {
    return verifySignature(
      "sha256",
      Buffer.from(parsed.message),
      { key: key.pem as unknown as KeyObject, dsaEncoding: "der" },
      Buffer.from(parsed.signature, "base64url"),
    );
  } catch {
    return false;
  }
}
