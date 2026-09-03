/**
 * Stable content hash for a media-kit snapshot.
 *
 * Used in approval records so regenerating a kit (same row id) invalidates prior
 * approvals when the visible content changed.
 */

import { createHash } from 'node:crypto';

/** Canonical JSON: sorted keys, stable number/string encoding. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sortKeys);
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    out[key] = sortKeys(obj[key]);
  }
  return out;
}

export function mediaKitContentHash(snapshot: unknown): string {
  return createHash('sha256').update(canonicalJson(snapshot), 'utf8').digest('hex');
}
