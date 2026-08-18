ALTER TABLE "User"
ADD COLUMN "passwordFailedAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "passwordLockedUntil" TIMESTAMP(3);
