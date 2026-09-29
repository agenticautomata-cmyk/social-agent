import { MUSE_INGEST_RATE_LIMIT, MUSE_INGEST_RATE_WINDOW_MS } from './types.js';

const buckets = new Map<string, number[]>();

export function resetMuseIngestRateLimit(): void {
  buckets.clear();
}

/** Sliding window, keyed by a digest of the ingest key — not the secret. */
export function consumeMuseIngestRateLimit(keyId: string, now = Date.now()): boolean {
  const recent = (buckets.get(keyId) ?? []).filter((stamp) => now - stamp < MUSE_INGEST_RATE_WINDOW_MS);
  if (recent.length >= MUSE_INGEST_RATE_LIMIT) {
    buckets.set(keyId, recent);
    return false;
  }
  recent.push(now);
  buckets.set(keyId, recent);
  return true;
}
