CREATE TABLE "TrialClaim" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "deviceFingerprint" TEXT,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrialClaim_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TrialClaim_email_key" ON "TrialClaim"("email");
CREATE UNIQUE INDEX "TrialClaim_deviceFingerprint_key" ON "TrialClaim"("deviceFingerprint");
CREATE INDEX "TrialClaim_userId_idx" ON "TrialClaim"("userId");

ALTER TABLE "TrialClaim"
ADD CONSTRAINT "TrialClaim_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
