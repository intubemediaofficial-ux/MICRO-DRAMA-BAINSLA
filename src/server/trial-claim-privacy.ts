import { Prisma } from "@prisma/client";
import { createHmac } from "node:crypto";
import { env } from "./config";

function hashTrialIdentifier(kind: string, value: string) {
  return createHmac("sha256", env.SESSION_SECRET)
    .update(`${kind}:${value.trim().toLowerCase()}`)
    .digest("hex");
}

export function deletedAccountIdentifierPrefix(kind: "email" | "phone", value: string) {
  return `deleted:${hashTrialIdentifier(kind, value)}:`;
}

export function anonymizedDeletedAccountIdentifier(
  kind: "email" | "phone",
  value: string,
  userId: string,
) {
  return `${deletedAccountIdentifierPrefix(kind, value)}${userId}`;
}

export function accountDeletionIdentifier(
  kind: "email" | "phone",
  identifier: string | null,
  userId: string,
  isDisabled: boolean,
) {
  if (isDisabled || !identifier || identifier.startsWith("deleted:")) return identifier;
  return anonymizedDeletedAccountIdentifier(kind, identifier, userId);
}

export function anonymizedTrialClaimEmail(email: string) {
  return `deleted-${hashTrialIdentifier("email", email)}@deleted.invalid`;
}

export function anonymizedTrialClaimDeviceFingerprint(fingerprint: string) {
  return hashTrialIdentifier("device", fingerprint);
}

export function priorTrialClaimWhere(
  email: string,
  fingerprint?: string,
): Prisma.TrialClaimWhereInput {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedFingerprint = fingerprint?.trim() || undefined;
  return {
    OR: [
      { email: { in: [normalizedEmail, anonymizedTrialClaimEmail(normalizedEmail)] } },
      ...(normalizedFingerprint
        ? [
            {
              deviceFingerprint: {
                in: [
                  normalizedFingerprint,
                  anonymizedTrialClaimDeviceFingerprint(normalizedFingerprint),
                ],
              },
            },
          ]
        : []),
    ],
  };
}
