CREATE TABLE "UserActivityDay" (
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,

    CONSTRAINT "UserActivityDay_pkey" PRIMARY KEY ("userId", "day")
);

CREATE INDEX "UserActivityDay_day_idx" ON "UserActivityDay"("day");

ALTER TABLE "UserActivityDay" ADD CONSTRAINT "UserActivityDay_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "UserActivityDay" ("userId", "day")
SELECT DISTINCT "userId", "updatedAt"::date
FROM "WatchProgress"
ON CONFLICT ("userId", "day") DO NOTHING;
