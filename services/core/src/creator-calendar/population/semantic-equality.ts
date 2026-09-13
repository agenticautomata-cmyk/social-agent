/**
 * Semantic equality for Calendar suggestion projection patches.
 * Ignores metadata array/object key order; excludes volatile stamps (updatedAt, evaluatedAt).
 */
export function stableSerialize(value: unknown): string {
  return JSON.stringify(normalizeForCompare(value));
}

function normalizeForCompare(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    const normalized = value.map(normalizeForCompare);
    // Order-insensitive for arrays of primitives / plain objects when elements are sortable.
    const allScalar = normalized.every(
      (v) => v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean',
    );
    if (allScalar) {
      return [...normalized].sort((a, b) => String(a).localeCompare(String(b)));
    }
    return normalized;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      // Volatile admission evaluation stamp — not a material field.
      if (key === 'evaluatedAt' || key === 'updatedAt' || key === 'ranAt') continue;
      out[key] = normalizeForCompare(obj[key]);
    }
    return out;
  }
  return String(value);
}

export type SuggestionSemanticSnapshot = {
  title: string;
  description: string | null;
  location: string | null;
  startAt: string;
  endAt: string | null;
  allDay: boolean;
  sourceUrl: string | null;
  internalDetailUrl: string | null;
  notes: string | null;
  verificationState: string | null;
  occurrenceFingerprint: string | null;
  idempotencyKey: string | null;
  populationSource: string | null;
  calendarIntent: string | null;
  sourceRecordType: string | null;
  sourceRecordId: string | null;
  /** Admission decision without volatile evaluatedAt. */
  admission: unknown;
  whyIncluded: unknown;
};

export function suggestionSemanticHash(snapshot: SuggestionSemanticSnapshot): string {
  return stableSerialize(snapshot);
}

/** Strip volatile keys from metadata before comparing admission blocks. */
export function materialMetadataForCompare(metadata: unknown): Record<string, unknown> {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
  const meta = { ...(metadata as Record<string, unknown>) };
  const admission = meta.calendarAdmission;
  if (admission && typeof admission === 'object' && !Array.isArray(admission)) {
    const adm = { ...(admission as Record<string, unknown>) };
    delete adm.evaluatedAt;
    meta.calendarAdmission = adm;
  }
  return meta;
}

export function snapshotsEqual(a: SuggestionSemanticSnapshot, b: SuggestionSemanticSnapshot): boolean {
  return suggestionSemanticHash(a) === suggestionSemanticHash(b);
}
