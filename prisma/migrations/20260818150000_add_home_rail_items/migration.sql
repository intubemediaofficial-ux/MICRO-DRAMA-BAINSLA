CREATE TABLE "HomeRailItem" (
    "id" TEXT NOT NULL,
    "railKey" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "seriesId" TEXT,
    "bannerUrl" TEXT,
    CONSTRAINT "HomeRailItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HomeRailItem_railKey_position_key"
ON "HomeRailItem"("railKey", "position");

CREATE INDEX "HomeRailItem_railKey_position_idx"
ON "HomeRailItem"("railKey", "position");

ALTER TABLE "HomeRailItem"
ADD CONSTRAINT "HomeRailItem_seriesId_fkey"
FOREIGN KEY ("seriesId") REFERENCES "Series"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
