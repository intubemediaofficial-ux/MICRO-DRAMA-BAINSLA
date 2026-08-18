CREATE TABLE "CastMember" (
    "id" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "photo" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "CastMember_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CastMember_seriesId_sortOrder_idx" ON "CastMember"("seriesId", "sortOrder");

ALTER TABLE "CastMember"
ADD CONSTRAINT "CastMember_seriesId_fkey"
FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE CASCADE ON UPDATE CASCADE;
