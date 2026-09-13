/**
 * Persistence/dedupe outcomes are the authority for “new” vs reprocess noise.
 * Extraction counts candidates; only outcome === 'created' increments newLogicalEvents.
 */

export type PersistenceOutcome =
  | 'created'
  | 'updated'
  | 'provenance_added'
  | 'duplicate'
  | 'rejected'
  | 'expired'
  | 'unchanged';

export type CuratorRunCounters = {
  /** Visual/OCR candidates seen this run (not “new”). */
  candidatesExtracted: number;
  /** Genuinely new logical records created this run. */
  newLogicalEvents: number;
  existingEventsUpdated: number;
  provenanceAdded: number;
  duplicatesSuppressed: number;
  rejectedCandidates: number;
  expiredCandidates: number;
  reviewCandidates: number;
  calendarEligibleCandidates: number;
  ocrAttempted: number;
  ocrCompleted: number;
  ocrCached: number;
  unchangedCandidates: number;
};

export function emptyCuratorRunCounters(): CuratorRunCounters {
  return {
    candidatesExtracted: 0,
    newLogicalEvents: 0,
    existingEventsUpdated: 0,
    provenanceAdded: 0,
    duplicatesSuppressed: 0,
    rejectedCandidates: 0,
    expiredCandidates: 0,
    reviewCandidates: 0,
    calendarEligibleCandidates: 0,
    ocrAttempted: 0,
    ocrCompleted: 0,
    ocrCached: 0,
    unchangedCandidates: 0,
  };
}

export function applyPersistenceOutcome(
  counters: CuratorRunCounters,
  outcome: PersistenceOutcome,
): CuratorRunCounters {
  const next = { ...counters };
  switch (outcome) {
    case 'created':
      next.newLogicalEvents += 1;
      break;
    case 'updated':
      next.existingEventsUpdated += 1;
      break;
    case 'provenance_added':
      next.provenanceAdded += 1;
      break;
    case 'duplicate':
      next.duplicatesSuppressed += 1;
      break;
    case 'rejected':
      next.rejectedCandidates += 1;
      break;
    case 'expired':
      next.expiredCandidates += 1;
      break;
    case 'unchanged':
      next.unchangedCandidates += 1;
      break;
    default:
      break;
  }
  return next;
}

export function mergeCuratorRunCounters(
  a: CuratorRunCounters,
  b: Partial<CuratorRunCounters>,
): CuratorRunCounters {
  return {
    candidatesExtracted: a.candidatesExtracted + (b.candidatesExtracted ?? 0),
    newLogicalEvents: a.newLogicalEvents + (b.newLogicalEvents ?? 0),
    existingEventsUpdated: a.existingEventsUpdated + (b.existingEventsUpdated ?? 0),
    provenanceAdded: a.provenanceAdded + (b.provenanceAdded ?? 0),
    duplicatesSuppressed: a.duplicatesSuppressed + (b.duplicatesSuppressed ?? 0),
    rejectedCandidates: a.rejectedCandidates + (b.rejectedCandidates ?? 0),
    expiredCandidates: a.expiredCandidates + (b.expiredCandidates ?? 0),
    reviewCandidates: a.reviewCandidates + (b.reviewCandidates ?? 0),
    calendarEligibleCandidates:
      a.calendarEligibleCandidates + (b.calendarEligibleCandidates ?? 0),
    ocrAttempted: a.ocrAttempted + (b.ocrAttempted ?? 0),
    ocrCompleted: a.ocrCompleted + (b.ocrCompleted ?? 0),
    ocrCached: a.ocrCached + (b.ocrCached ?? 0),
    unchangedCandidates: a.unchangedCandidates + (b.unchangedCandidates ?? 0),
  };
}

/** Compat: Check now `newItems` must equal newLogicalEvents. */
export function newItemsFromCounters(counters: Pick<CuratorRunCounters, 'newLogicalEvents'>): number {
  return counters.newLogicalEvents;
}

export function materialLeadFieldsChanged(
  existing: {
    verificationStatus: string;
    officialOrganizerUrl: string | null;
    officialVenueUrl: string | null;
    ticketUrl: string | null;
    officialSocialUrl: string | null;
    creatorRecommendation: string | null;
    creatorValueScore: string | null;
    researchSummary: unknown;
  },
  incoming: {
    verificationStatus?: string | null;
    officialOrganizerUrl?: string | null;
    officialVenueUrl?: string | null;
    ticketUrl?: string | null;
    officialSocialUrl?: string | null;
    creatorRecommendation?: string | null;
    creatorValueScore?: string | null;
    researchSummary?: unknown;
  },
): boolean {
  // Intentionally ignore volatile researchSummary text churn from re-research.
  const pairs: Array<[unknown, unknown]> = [
    [existing.verificationStatus, incoming.verificationStatus ?? existing.verificationStatus],
    [existing.officialOrganizerUrl, incoming.officialOrganizerUrl ?? null],
    [existing.officialVenueUrl, incoming.officialVenueUrl ?? null],
    [existing.ticketUrl, incoming.ticketUrl ?? null],
    [existing.officialSocialUrl, incoming.officialSocialUrl ?? null],
    [existing.creatorRecommendation, incoming.creatorRecommendation ?? null],
  ];
  return pairs.some(([a, b]) => String(a ?? '') !== String(b ?? ''));
}

export function provenanceUrlsFromMeta(
  meta: Record<string, unknown> | null | undefined,
  discoveredViaPostUrl: string,
): string[] {
  const prev = Array.isArray(meta?.provenanceUrls)
    ? meta!.provenanceUrls.map(String)
    : [discoveredViaPostUrl];
  return [...new Set(prev.filter(Boolean))];
}

export function wouldAddProvenanceUrl(existingUrls: string[], sourceUrl: string): boolean {
  const normalized = sourceUrl.trim();
  if (!normalized) return false;
  return !existingUrls.some((url) => url === normalized);
}
