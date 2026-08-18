CREATE TYPE "EpisodeThumbnailSource" AS ENUM ('LEGACY', 'CATALOGUE', 'AUTO', 'CUSTOM');
CREATE TYPE "EpisodeProcessingStatus" AS ENUM ('READY', 'PROCESSING', 'FAILED');

ALTER TABLE "Episode"
ALTER COLUMN "thumbnailSource" DROP DEFAULT,
ALTER COLUMN "thumbnailSource" TYPE "EpisodeThumbnailSource"
  USING "thumbnailSource"::"EpisodeThumbnailSource",
ALTER COLUMN "thumbnailSource" SET DEFAULT 'LEGACY'::"EpisodeThumbnailSource",
ALTER COLUMN "processingStatus" DROP DEFAULT,
ALTER COLUMN "processingStatus" TYPE "EpisodeProcessingStatus"
  USING "processingStatus"::"EpisodeProcessingStatus",
ALTER COLUMN "processingStatus" SET DEFAULT 'READY'::"EpisodeProcessingStatus";
