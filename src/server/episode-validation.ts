export function findEpisodeNumberCollision(
  existingNumbers: number[],
  requestedNumbers: number[],
) {
  const occupied = new Set(existingNumbers);
  return requestedNumbers.find((number) => occupied.has(number)) ?? null;
}

export function duplicateSkuMessage(sku: string, title?: string | null) {
  return `SKU already used${title ? ` by ${title}` : ""}: ${sku}`;
}

export function episodeNumberConflictMessage(number: number) {
  return `Episode number ${number} is already used in this series`;
}

export function seasonHasEpisodesMessage() {
  return "Move or delete this season's episodes before deleting the season";
}

export function canDeleteSeason(episodeCount: number) {
  return episodeCount === 0;
}

export function buildEpisodeUploadMetadata(input: {
  originalFilename: string;
  durationSec: number;
  sku?: string | null;
}) {
  return {
    originalFilename: input.originalFilename,
    durationSec: input.durationSec,
    sku: input.sku?.trim() || null,
  };
}
