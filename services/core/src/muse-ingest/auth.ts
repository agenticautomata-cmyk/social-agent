import { createHash, timingSafeEqual } from 'node:crypto';
import { MUSE_INGEST_ENV } from './types.js';

function sha256(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

/** Equal-length digest compare. Never logs the key. */
export function museIngestKeysMatch(presented: string, expected: string): boolean {
  return timingSafeEqual(sha256(presented), sha256(expected));
}

export function museIngestKeyId(presented: string): string {
  return sha256(presented).subarray(0, 8).toString('hex');
}

export function readMuseIngestKey(): string | undefined {
  const value = process.env[MUSE_INGEST_ENV]?.trim();
  return value ? value : undefined;
}

/**
 * Missing env, missing header, or mismatch → unauthorized.
 * No key, no write.
 */
export function authorizeMuseIngest(headerValue: string | undefined): { ok: true; keyId: string } | { ok: false } {
  const expected = readMuseIngestKey();
  const presented = headerValue?.trim() ?? '';
  if (!expected || !presented || !museIngestKeysMatch(presented, expected)) {
    return { ok: false };
  }
  return { ok: true, keyId: museIngestKeyId(presented) };
}
