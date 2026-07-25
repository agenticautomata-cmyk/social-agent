import { createHash } from 'node:crypto';

/** User-facing fallback when Ask Benson hits an unexpected server error. */
export const ASK_BENSON_FRIENDLY_ERROR =
  'Benson hit a technical problem and couldn’t answer that. Please try again.';

/**
 * Coerce a single value into a stable string for cache keys and snapshot hashes.
 * Dates become ISO 8601; null/undefined become empty string.
 */
export function normalizeHashPart(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'bigint') return value.toString();
  return stableJsonStringify(value);
}

/** Build a deterministic SHA-256 prefix from heterogeneous hash inputs. */
export function hashNormalizedParts(parts: unknown[]): string {
  return createHash('sha256')
    .update(parts.map(normalizeHashPart).join('|'))
    .digest('hex')
    .slice(0, 16);
}

/**
 * Normalize a value for Ask Benson JSON payloads (LLM context, logging).
 * Recursively converts Dates to ISO strings and drops undefined keys in objects.
 */
export function serializeAskBensonValue(value: unknown): unknown {
  if (value == null) return value ?? null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serializeAskBensonValue);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (child === undefined) continue;
      out[key] = serializeAskBensonValue(child);
    }
    return out;
  }
  return value;
}

/** Stable JSON for nested objects in hash parts (sorted keys). */
export function stableJsonStringify(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (value == null || typeof value !== 'object') return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(sortJson);
  const obj = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    const child = obj[key];
    if (child === undefined) continue;
    sorted[key] = sortJson(child);
  }
  return sorted;
}

/** Postgres.js bind parameters require strings for timestamptz comparisons. */
export function toPostgresTimestamp(value: Date | string | number): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number') return new Date(value).toISOString();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid timestamp for postgres bind: ${String(value)}`);
  }
  return parsed.toISOString();
}
