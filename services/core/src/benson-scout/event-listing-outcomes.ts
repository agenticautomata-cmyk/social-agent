/**
 * Shared Watchlist listing outcome dimensions.
 *
 * OWNERSHIP (primary architecture): status semantics + explanations.
 * Reachability | extraction capability | content outcome | reliability | session
 * must remain separable — never overload a single field into contradictions.
 */

import type { WatchlistDisplayHealth, WatchlistReachability } from '../curator-watchlist/watchlist-state.js';

export type ExtractionCapabilityOutcome =
  | 'supported'
  | 'needs_adapter'
  | 'incomplete_render'
  | 'failed';

export type ListingContentOutcome =
  | 'upcoming_events_found'
  | 'no_change'
  | 'no_upcoming_events'
  | 'expired_only'
  | 'undated_leads_only';

export type MeetupRelevanceState = 'verified_relevant' | 'possibly_relevant' | 'not_relevant';

export type ListingCompletenessStats = {
  candidatesDetected: number;
  acceptedUpcoming: number;
  expiredRejected: number;
  undatedLeads: number;
  irrelevantRejected: number;
  missingRequiredFields: number;
  duplicatesSuppressed: number;
  paginationComplete: boolean | null;
  resultContainerRendered: boolean | null;
  productionGroups?: number | null;
  performanceInstances?: number | null;
  suspiciousFlags: string[];
};

export type ListingCheckDiagnostics = {
  reachability: WatchlistReachability;
  extractionCapability: ExtractionCapabilityOutcome;
  contentOutcome: ListingContentOutcome;
  listingPlatform: string | null;
  extractionMethod: string | null;
  configuredUrl: string;
  effectiveExtractionUrl: string | null;
  lastResolvedUrl: string | null;
  completeness: ListingCompletenessStats;
  statusExplanation: string;
};

export function emptyCompleteness(
  overrides: Partial<ListingCompletenessStats> = {},
): ListingCompletenessStats {
  return {
    candidatesDetected: 0,
    acceptedUpcoming: 0,
    expiredRejected: 0,
    undatedLeads: 0,
    irrelevantRejected: 0,
    missingRequiredFields: 0,
    duplicatesSuppressed: 0,
    paginationComplete: null,
    resultContainerRendered: null,
    productionGroups: null,
    performanceInstances: null,
    suspiciousFlags: [],
    ...overrides,
  };
}

/** Local calendar YMD in America/Chicago (default KC). */
export function localYmdInTimeZone(
  date: Date = new Date(),
  timeZone = 'America/Chicago',
): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function isUpcomingLocalDate(
  startDate: string | null | undefined,
  now: Date = new Date(),
  timeZone = 'America/Chicago',
): boolean {
  if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return false;
  return startDate >= localYmdInTimeZone(now, timeZone);
}

export function stripTrackingParams(url: string): string {
  try {
    const u = new URL(url);
    const drop = [
      'fbclid',
      'gclid',
      'mc_cid',
      'mc_eid',
      '_ga',
      '_gl',
      'ref',
      'ref_src',
      'ref_url',
    ];
    for (const key of [...u.searchParams.keys()]) {
      if (drop.includes(key.toLowerCase()) || /^utm_/i.test(key)) {
        u.searchParams.delete(key);
      }
    }
    return u.toString();
  } catch {
    return url;
  }
}

export function deriveContentOutcome(input: {
  upcomingCount: number;
  expiredCount: number;
  undatedCount: number;
  created: number;
  priorCapability: boolean;
  extractionOk: boolean;
}): ListingContentOutcome {
  if (!input.extractionOk) {
    // Caller should prefer failed/needs_adapter over content outcome.
    return input.priorCapability ? 'no_change' : 'no_upcoming_events';
  }
  if (input.upcomingCount > 0) {
    if (input.priorCapability && input.created === 0) return 'no_change';
    return 'upcoming_events_found';
  }
  if (input.expiredCount > 0 && input.undatedCount === 0) return 'expired_only';
  if (input.undatedCount > 0 && input.expiredCount === 0) return 'undated_leads_only';
  if (input.expiredCount > 0 && input.undatedCount > 0) return 'expired_only';
  return 'no_upcoming_events';
}

export function explanationForListingOutcome(input: {
  contentOutcome: ListingContentOutcome;
  upcomingCount: number;
  created: number;
  expiredCount: number;
  undatedCount: number;
  priorCapability: boolean;
  needsAdapter?: boolean;
  incompleteRender?: boolean;
  blocked?: boolean;
  platformLabel?: string | null;
}): string {
  if (input.blocked) {
    return 'Access is blocked (login, CAPTCHA, bot protection, or robots rules).';
  }
  if (input.incompleteRender) {
    return 'Page shell loaded, but the event result container never finished rendering.';
  }
  if (input.needsAdapter) {
    return 'Recognizable calendar surface detected, but no supported extractor produced verified events.';
  }
  switch (input.contentOutcome) {
    case 'upcoming_events_found':
      if (!input.priorCapability) {
        return `Baseline created from ${input.upcomingCount} verified event listings.`;
      }
      if (input.created > 0) {
        return `Recent check extracted ${input.upcomingCount} events; ${input.created} were new.`;
      }
      return `Checked ${input.upcomingCount} current listings; no changes found.`;
    case 'no_change':
      return input.upcomingCount > 0
        ? `Checked ${input.upcomingCount} current listings; no changes found.`
        : 'Valid check completed; no new records since the last extraction.';
    case 'expired_only':
      return `Checked successfully. No upcoming dated events are currently published (${input.expiredCount} expired listing${input.expiredCount === 1 ? '' : 's'} detected).`;
    case 'undated_leads_only':
      return `Checked successfully. Found ${input.undatedCount} undated lead${input.undatedCount === 1 ? '' : 's'} without a verifiable upcoming date.`;
    case 'no_upcoming_events':
      return 'Checked successfully. No upcoming dated events are currently published.';
    default:
      return 'Page responded, but no usable events were found.';
  }
}

/**
 * Map content + capability into operator-facing display health without contradictions.
 * Zero upcoming after a successful supported parse is NOT no_yield.
 */
export function displayHealthForListingOutcome(input: {
  contentOutcome: ListingContentOutcome;
  extractionCapability: ExtractionCapabilityOutcome;
  reachability: WatchlistReachability;
  upcomingCount: number;
  created: number;
  priorCapability: boolean;
}): WatchlistDisplayHealth {
  if (input.reachability === 'blocked') return 'blocked';
  if (input.extractionCapability === 'failed') return 'failed';
  if (input.extractionCapability === 'incomplete_render') return 'degraded';
  if (input.extractionCapability === 'needs_adapter') return 'needs_adapter';

  if (input.upcomingCount > 0) {
    if (!input.priorCapability) return 'healthy';
    if (input.created > 0) return 'healthy';
    return 'no_change';
  }

  // Successful supported extraction with zero upcoming — operationally OK.
  if (input.extractionCapability === 'supported') {
    if (
      input.contentOutcome === 'no_upcoming_events' ||
      input.contentOutcome === 'expired_only' ||
      input.contentOutcome === 'undated_leads_only'
    ) {
      return input.priorCapability ? 'no_change' : 'healthy';
    }
    return 'no_change';
  }

  return 'no_yield';
}
