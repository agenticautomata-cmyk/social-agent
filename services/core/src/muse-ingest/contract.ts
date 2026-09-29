/**
 * Payload contract. Invalid fields are rejected. Missing fields stay missing.
 */
import { stripTrackingParams } from '../newsletter-intelligence/editorial-opportunity/canonical-url.js';
import {
  admissionDecisionToMetadata,
  evaluateCalendarAdmission,
  type CalendarAdmissionCandidate,
  type CalendarAdmissionDecision,
} from '../creator-calendar/admission/index.js';
import { OPENING_LIFECYCLE_STATUSES, type OpeningLifecycleStatus } from '../openings-radar/types.js';
import {
  MUSE_ITEM_TYPES,
  MUSE_SOURCE_ID,
  type MuseDisposition,
  type MuseItemType,
  type MuseProvenance,
  type ValidatedMuseItem,
} from './types.js';

const ISO_DATETIME =
  /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/;

export function normalizeMuseBody(body: unknown): { ok: true; items: unknown[] } | { ok: false; reason: string } {
  if (Array.isArray(body)) return { ok: true, items: body };
  if (!body || typeof body !== 'object') return { ok: false, reason: 'invalid_body' };
  const record = body as Record<string, unknown>;
  if ('items' in record) {
    if (!Array.isArray(record.items)) return { ok: false, reason: 'invalid_items' };
    return { ok: true, items: record.items };
  }
  return { ok: true, items: [body] };
}

export function stripMuseUrl(raw: string): string {
  return stripTrackingParams(raw.trim());
}

function isHttpUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Strict calendar date/time. Prose dates are rejected, not parsed into a guess. */
export function parseStrictIso(raw: string): boolean {
  const match = ISO_DATETIME.exec(raw.trim());
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = match[4] != null ? Number(match[4]) : 0;
  const minute = match[5] != null ? Number(match[5]) : 0;
  const second = match[6] != null ? Number(match[6]) : 0;
  if (hour > 23 || minute > 59 || second > 59) return false;
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
}

function optionalString(raw: Record<string, unknown>, key: string): string | null {
  if (!(key in raw) || raw[key] == null) return null;
  if (typeof raw[key] !== 'string') return null;
  const trimmed = (raw[key] as string).trim();
  return trimmed.length > 0 ? trimmed : null;
}

function requireString(
  raw: Record<string, unknown>,
  key: string,
  missingReason: string,
  invalidReason: string,
): { ok: true; value: string } | { ok: false; reason: string } {
  if (!(key in raw) || raw[key] == null || raw[key] === '') return { ok: false, reason: missingReason };
  if (typeof raw[key] !== 'string') return { ok: false, reason: invalidReason };
  const trimmed = raw[key].trim();
  if (!trimmed) return { ok: false, reason: missingReason };
  return { ok: true, value: trimmed };
}

export function validateMuseItem(
  input: unknown,
): { ok: true; item: ValidatedMuseItem } | { ok: false; fingerprint: string; reason: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, fingerprint: '', reason: 'invalid_item' };
  }
  const raw = input as Record<string, unknown>;
  const fingerprint = typeof raw.fingerprint === 'string' ? raw.fingerprint.trim() : '';
  if (!fingerprint) return { ok: false, fingerprint: '', reason: 'missing_fingerprint' };
  if (fingerprint.length > 512) return { ok: false, fingerprint: fingerprint.slice(0, 512), reason: 'fingerprint_too_long' };

  const type = raw.type;
  if (typeof type !== 'string' || !type.trim()) {
    return { ok: false, fingerprint, reason: 'missing_type' };
  }
  if (!MUSE_ITEM_TYPES.includes(type as MuseItemType)) {
    return { ok: false, fingerprint, reason: 'unknown_type' };
  }

  if (raw.source !== MUSE_SOURCE_ID) {
    return { ok: false, fingerprint, reason: 'invalid_source' };
  }

  const provenanceRaw = raw.provenance;
  if (!provenanceRaw || typeof provenanceRaw !== 'object' || Array.isArray(provenanceRaw)) {
    return { ok: false, fingerprint, reason: 'missing_provenance' };
  }
  const provenance = provenanceRaw as Record<string, unknown>;
  const foundVia = requireString(provenance, 'found_via', 'missing_found_via', 'invalid_found_via');
  if (!foundVia.ok) return { ok: false, fingerprint, reason: foundVia.reason };
  if (foundVia.value.length > 200) return { ok: false, fingerprint, reason: 'found_via_too_long' };
  const foundAt = requireString(provenance, 'found_at', 'missing_found_at', 'invalid_found_at');
  if (!foundAt.ok) return { ok: false, fingerprint, reason: foundAt.reason };
  if (!parseStrictIso(foundAt.value)) return { ok: false, fingerprint, reason: 'invalid_found_at' };

  const evidenceUrls: string[] = [];
  if ('evidence_urls' in provenance && provenance.evidence_urls != null) {
    if (!Array.isArray(provenance.evidence_urls)) {
      return { ok: false, fingerprint, reason: 'invalid_evidence_urls' };
    }
    for (const entry of provenance.evidence_urls) {
      if (typeof entry !== 'string' || !isHttpUrl(entry.trim())) {
        return { ok: false, fingerprint, reason: 'invalid_evidence_url' };
      }
      evidenceUrls.push(stripMuseUrl(entry));
    }
  }

  const typed = type as MuseItemType;
  const specific = validateTypeFields(typed, raw, fingerprint);
  if (!specific.ok) return specific;

  return {
    ok: true,
    item: {
      type: typed,
      source: MUSE_SOURCE_ID,
      fingerprint,
      provenance: {
        found_via: foundVia.value,
        found_at: foundAt.value,
        evidence_urls: evidenceUrls,
      },
      raw,
    },
  };
}

function validateTypeFields(
  type: MuseItemType,
  raw: Record<string, unknown>,
  fingerprint: string,
): { ok: true } | { ok: false; fingerprint: string; reason: string } {
  if (type === 'event_finding') {
    const title = requireString(raw, 'title', 'missing_title', 'invalid_title');
    if (!title.ok) return { ok: false, fingerprint, reason: title.reason };
    if (title.value.length > 500) return { ok: false, fingerprint, reason: 'title_too_long' };
    const starts = requireString(raw, 'starts_at', 'missing_starts_at', 'invalid_starts_at');
    if (!starts.ok) return { ok: false, fingerprint, reason: starts.reason };
    if (!parseStrictIso(starts.value)) return { ok: false, fingerprint, reason: 'invalid_starts_at' };
    if ('ends_at' in raw && raw.ends_at != null) {
      if (typeof raw.ends_at !== 'string' || !parseStrictIso(raw.ends_at)) {
        return { ok: false, fingerprint, reason: 'invalid_ends_at' };
      }
    }
    if ('canonical_url' in raw && raw.canonical_url != null) {
      if (typeof raw.canonical_url !== 'string' || !isHttpUrl(raw.canonical_url.trim())) {
        return { ok: false, fingerprint, reason: 'invalid_canonical_url' };
      }
    }
    return { ok: true };
  }

  if (type === 'opportunity_dossier') {
    const business = requireString(raw, 'business', 'missing_business', 'invalid_business');
    if (!business.ok) return { ok: false, fingerprint, reason: business.reason };
    if ('facts' in raw && raw.facts != null) {
      if (!Array.isArray(raw.facts)) return { ok: false, fingerprint, reason: 'invalid_facts' };
      for (const fact of raw.facts) {
        if (!fact || typeof fact !== 'object' || Array.isArray(fact)) {
          return { ok: false, fingerprint, reason: 'invalid_fact' };
        }
        const row = fact as Record<string, unknown>;
        if (typeof row.claim !== 'string' || !row.claim.trim()) {
          return { ok: false, fingerprint, reason: 'invalid_fact' };
        }
        if ('verified' in row && row.verified != null && typeof row.verified !== 'boolean') {
          return { ok: false, fingerprint, reason: 'invalid_fact' };
        }
        if ('evidence_url' in row && row.evidence_url != null) {
          if (typeof row.evidence_url !== 'string' || !isHttpUrl(row.evidence_url.trim())) {
            return { ok: false, fingerprint, reason: 'invalid_evidence_url' };
          }
        }
      }
    }
    if ('contact_routes' in raw && raw.contact_routes != null) {
      if (!Array.isArray(raw.contact_routes)) return { ok: false, fingerprint, reason: 'invalid_contact_routes' };
      for (const route of raw.contact_routes) {
        if (!route || typeof route !== 'object' || Array.isArray(route)) {
          return { ok: false, fingerprint, reason: 'invalid_contact_route' };
        }
        const row = route as Record<string, unknown>;
        if (typeof row.type !== 'string' || !row.type.trim()) {
          return { ok: false, fingerprint, reason: 'invalid_contact_route' };
        }
        if ('url' in row && row.url != null) {
          if (typeof row.url !== 'string' || !isHttpUrl(row.url.trim())) {
            return { ok: false, fingerprint, reason: 'invalid_contact_route' };
          }
        }
      }
    }
    return { ok: true };
  }

  const business = requireString(raw, 'business', 'missing_business', 'invalid_business');
  if (!business.ok) return { ok: false, fingerprint, reason: business.reason };
  const stage = requireString(raw, 'stage', 'missing_stage', 'invalid_stage');
  if (!stage.ok) return { ok: false, fingerprint, reason: stage.reason };
  if (!OPENING_LIFECYCLE_STATUSES.includes(stage.value as OpeningLifecycleStatus)) {
    return { ok: false, fingerprint, reason: 'invalid_stage' };
  }
  if ('evidence_url' in raw && raw.evidence_url != null) {
    if (typeof raw.evidence_url !== 'string' || !isHttpUrl(raw.evidence_url.trim())) {
      return { ok: false, fingerprint, reason: 'invalid_evidence_url' };
    }
  }
  if ('projected_open' in raw && raw.projected_open != null) {
    if (typeof raw.projected_open !== 'string' || !parseStrictIso(raw.projected_open) || raw.projected_open.trim().length !== 10) {
      return { ok: false, fingerprint, reason: 'invalid_projected_open' };
    }
  }
  return { ok: true };
}

export function eventCanonicalUrl(item: ValidatedMuseItem): string | null {
  const raw = item.raw.canonical_url;
  if (typeof raw !== 'string' || !raw.trim()) return null;
  return stripMuseUrl(raw);
}

export function dossierCanonicalUrl(item: ValidatedMuseItem): string | null {
  const urls: string[] = [];
  const facts = item.raw.facts;
  if (Array.isArray(facts)) {
    for (const fact of facts) {
      if (fact && typeof fact === 'object' && typeof (fact as { evidence_url?: unknown }).evidence_url === 'string') {
        urls.push(stripMuseUrl((fact as { evidence_url: string }).evidence_url));
      }
    }
  }
  const routes = item.raw.contact_routes;
  if (Array.isArray(routes)) {
    for (const route of routes) {
      if (route && typeof route === 'object' && typeof (route as { url?: unknown }).url === 'string') {
        urls.push(stripMuseUrl((route as { url: string }).url));
      }
    }
  }
  urls.push(...item.provenance.evidence_urls);
  return urls[0] ?? null;
}

export function openingEvidenceUrl(item: ValidatedMuseItem): string | null {
  const raw = item.raw.evidence_url;
  if (typeof raw !== 'string' || !raw.trim()) return null;
  return stripMuseUrl(raw);
}

export function museEventCandidate(item: ValidatedMuseItem, now: Date): CalendarAdmissionCandidate {
  const startsAt = String(item.raw.starts_at).trim();
  const endsAt = optionalString(item.raw, 'ends_at');
  const yearExplicit = /^\d{4}-\d{2}-\d{2}/.test(startsAt);
  return {
    title: String(item.raw.title).trim(),
    summary: optionalString(item.raw, 'description'),
    description: optionalString(item.raw, 'description'),
    venue: optionalString(item.raw, 'venue'),
    locationName: optionalString(item.raw, 'location'),
    formattedAddress: optionalString(item.raw, 'address'),
    neighborhood: optionalString(item.raw, 'neighborhood'),
    city: optionalString(item.raw, 'city'),
    state: optionalString(item.raw, 'state'),
    sourceUrl: eventCanonicalUrl(item),
    sourceName: MUSE_SOURCE_ID,
    eventDate: startsAt,
    eventEndDate: endsAt,
    extractedEventDate: yearExplicit ? startsAt : null,
    publicationDate: null,
    retrievalDate: now.toISOString(),
    yearExplicit,
    timezone: 'America/Chicago',
    parser: null,
    ingest: MUSE_SOURCE_ID,
    attribution: item.provenance.found_via,
    metadata: {
      museFingerprint: item.fingerprint,
      foundVia: item.provenance.found_via,
      foundAt: item.provenance.found_at,
    },
  };
}

export function decideEventAdmission(
  item: ValidatedMuseItem,
  now: Date,
): { disposition: Exclude<MuseDisposition, 'merged_duplicate'>; reason: string; decision: CalendarAdmissionDecision } {
  const decision = evaluateCalendarAdmission(museEventCandidate(item, now), now);
  const lifecycle = decision.lifecycle;
  const disposition: Exclude<MuseDisposition, 'merged_duplicate'> =
    lifecycle === 'accepted' || lifecycle === 'quarantined' || lifecycle === 'rejected' ? lifecycle : 'rejected';
  return {
    disposition,
    reason: `admission:${decision.primaryReason}`,
    decision,
  };
}

export function admissionMetadata(decision: CalendarAdmissionDecision): Record<string, unknown> {
  return admissionDecisionToMetadata(decision);
}

export function storedDossierFacts(item: ValidatedMuseItem): Array<{
  claim: string;
  evidence_url: string | null;
  verified: boolean | null;
}> {
  const facts = item.raw.facts;
  if (!Array.isArray(facts)) return [];
  return facts.map((fact) => {
    const row = fact as Record<string, unknown>;
    const evidence = typeof row.evidence_url === 'string' ? stripMuseUrl(row.evidence_url) : null;
    return {
      claim: String(row.claim).trim(),
      evidence_url: evidence,
      verified: typeof row.verified === 'boolean' ? row.verified : null,
    };
  });
}

export function storedContactRoutes(item: ValidatedMuseItem): Array<{
  type: string;
  url: string | null;
  label: string | null;
}> {
  const routes = item.raw.contact_routes;
  if (!Array.isArray(routes)) return [];
  return routes.map((route) => {
    const row = route as Record<string, unknown>;
    return {
      type: String(row.type).trim(),
      url: typeof row.url === 'string' ? stripMuseUrl(row.url) : null,
      label: typeof row.label === 'string' ? row.label : null,
    };
  });
}

export type { MuseProvenance };
