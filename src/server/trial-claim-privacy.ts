import { createHmac } from "node:crypto";
import { env } from "./config";

function hashTrialIdentifier(kind: string, value: string) {
  return createHmac("sha256", env.SESSION_SECRET)
    .update(`${kind}:${value.trim().toLowerCase()}`)
    .digest("hex");
}

export function anonymizedTrialClaimEmail(email: string) {
  return `deleted-${hashTrialIdentifier("email", email)}@deleted.invalid`;
}

export function anonymizedTrialClaimDeviceFingerprint(fingerprint: string) {
  return hashTrialIdentifier("device", fingerprint);
}
