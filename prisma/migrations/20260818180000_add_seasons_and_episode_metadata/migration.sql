CREATE TABLE "Season" (
    "id" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Episode"
ADD COLUMN "seasonId" TEXT,
ADD COLUMN "originalFilename" TEXT,
ADD COLUMN "sku" TEXT;

CREATE UNIQUE INDEX "Season_seriesId_number_key" ON "Season"("seriesId", "number");
CREATE INDEX "Season_seriesId_sortOrder_idx" ON "Season"("seriesId", "sortOrder");
CREATE UNIQUE INDEX "Episode_sku_key" ON "Episode"("sku");
CREATE INDEX "Episode_seasonId_idx" ON "Episode"("seasonId");

ALTER TABLE "Season"
ADD CONSTRAINT "Season_seriesId_fkey"
FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Episode"
ADD CONSTRAINT "Episode_seasonId_fkey"
FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "Season" ("id", "seriesId", "number", "title", "sortOrder", "createdAt", "updatedAt")
SELECT 'season_' || "Series"."id", "Series"."id", 1, 'Season 1', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Series"
WHERE EXISTS (
  SELECT 1 FROM "Episode" WHERE "Episode"."seriesId" = "Series"."id"
);

UPDATE "Episode"
SET "seasonId" = 'season_' || "seriesId"
WHERE "seasonId" IS NULL;
