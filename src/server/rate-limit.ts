const buckets = new Map<string, { count: number; reset: number }>();
// In-memory limiter for local/dev. Swap this helper for Redis in production.
export function rateLimit(key: string, limit = 60, windowMs = 60_000): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.reset <= now) { buckets.set(key, { count: 1, reset: now + windowMs }); return true; }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}
