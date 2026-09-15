/**
 * Multi-surface event reconciliation.
 *
 * Rules:
 * - Empty surfaces never overrule coherent upcoming yields
 * - Weak/past-only JSON-LD never overrules a complete rendered or embedded catalog
 * - Same occurrence merges; conflicting dates → diagnostics/review evidence
 * - Win by completeness / coherence / provenance / evidence — not adapter order alone
 */

import { isUpcomingLocalDate, localYmdInTimeZone } from './event-listing-outcomes.js';
import type { ExtractedEventListing, EventListingExtractionMethod } from './event-listing-extract.js';

export type SurfaceYield = {
  surfaceId: string;
  method: EventListingExtractionMethod | string;
  events: ExtractedEventListing[];
  evidence: string[];
  /** Higher is better; used only after upcoming/completeness gates. */
  provenanceScore: number;
};

export type SurfaceReconcileResult = {
  events: ExtractedEventListing[];
  method: EventListingExtractionMethod | string;
  winningSurfaceId: string | null;
  diagnostics: string[];
  surfaceSummaries: Array<{
    surfaceId: string;
    method: string;
    total: number;
    upcoming: number;
    dated: number;
    withVenue: number;
    withUrl: number;
    completeness: number;
  }>;
};

function occurrenceKey(ev: ExtractedEventListing): string {
  const title = (ev.title || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const date = ev.startDate || '';
  const url = (ev.eventUrl || '').replace(/\/$/, '').toLowerCase();
  const venue = (ev.venue || '').toLowerCase().replace(/\s+/g, ' ').trim();
  return `${title}|${date}|${url || venue}`;
}

function completenessScore(events: ExtractedEventListing[], now: Date, tz: string): {
  upcoming: number;
  dated: number;
  withVenue: number;
  withUrl: number;
  completeness: number;
} {
  let upcoming = 0;
  let dated = 0;
  let withVenue = 0;
  let withUrl = 0;
  for (const ev of events) {
    if (ev.startDate) dated += 1;
    if (isUpcomingLocalDate(ev.startDate, now, tz)) upcoming += 1;
    if (ev.venue) withVenue += 1;
    if (ev.eventUrl) withUrl += 1;
  }
  const n = Math.max(events.length, 1);
  const completeness =
    upcoming * 10 +
    dated * 2 +
    withVenue +
    withUrl +
    (events.length >= 5 ? 5 : 0) +
    events.length;
  void n;
  return { upcoming, dated, withVenue, withUrl, completeness };
}

function mergeSameOccurrence(
  a: ExtractedEventListing,
  b: ExtractedEventListing,
  diagnostics: string[],
): ExtractedEventListing {
  const pick = <T>(x: T | null | undefined, y: T | null | undefined): T | null =>
    (x != null && String(x).trim() !== '' ? x : y ?? null) as T | null;

  if (a.startDate && b.startDate && a.startDate !== b.startDate) {
    diagnostics.push(
      `date_conflict:${(a.title || '').slice(0, 40)}:${a.startDate}vs${b.startDate}`,
    );
  }

  return {
    ...a,
    title: a.title.length >= b.title.length ? a.title : b.title,
    startDate: a.startDate ?? b.startDate,
    startDateTime: pick(a.startDateTime, b.startDateTime),
    endDate: pick(a.endDate, b.endDate),
    endDateTime: pick(a.endDateTime, b.endDateTime),
    venue: pick(a.venue, b.venue),
    address: pick(a.address, b.address),
    city: pick(a.city, b.city),
    regionState: pick(a.regionState, b.regionState),
    priceText: pick(a.priceText, b.priceText),
    isFree: a.isFree ?? b.isFree,
    eventUrl: pick(a.eventUrl, b.eventUrl),
    ticketOrRsvpUrl: pick(a.ticketOrRsvpUrl, b.ticketOrRsvpUrl),
    organizer: pick(a.organizer, b.organizer),
    imageUrl: pick(a.imageUrl, b.imageUrl),
    evidence: [...new Set([...a.evidence, ...b.evidence, 'surface_reconcile:merged'])],
    verificationState:
      a.verificationState === 'verified' || b.verificationState === 'verified'
        ? 'verified'
        : a.verificationState,
    externalId: a.externalId ?? b.externalId,
  };
}

/**
 * Reconcile multiple surface yields into one coherent event set.
 */
export function reconcileSurfaceYields(input: {
  surfaces: SurfaceYield[];
  now?: Date;
  timeZone?: string;
}): SurfaceReconcileResult {
  const now = input.now ?? new Date();
  const tz = input.timeZone ?? 'America/Chicago';
  const diagnostics: string[] = [];
  const today = localYmdInTimeZone(now, tz);

  const summaries = input.surfaces.map((s) => {
    const c = completenessScore(s.events, now, tz);
    return {
      surfaceId: s.surfaceId,
      method: String(s.method),
      total: s.events.length,
      ...c,
      provenanceScore: s.provenanceScore,
    };
  });

  for (const s of summaries) {
    diagnostics.push(
      `surface:${s.surfaceId}:${s.method}:total=${s.total}:upcoming=${s.upcoming}:completeness=${s.completeness}`,
    );
  }

  const nonEmpty = summaries.filter((s) => s.total > 0);
  if (!nonEmpty.length) {
    return {
      events: [],
      method: 'none',
      winningSurfaceId: null,
      diagnostics: [...diagnostics, 'reconcile:all_surfaces_empty'],
      surfaceSummaries: summaries,
    };
  }

  // Prefer surfaces with upcoming events; never let empty/past-only beat coherent upcoming.
  const withUpcoming = nonEmpty.filter((s) => s.upcoming > 0);
  const candidates = withUpcoming.length ? withUpcoming : nonEmpty;

  if (withUpcoming.length && nonEmpty.some((s) => s.upcoming === 0 && s.total > 0)) {
    diagnostics.push(`reconcile:ignored_past_or_empty_surfaces_as_of:${today}`);
  }

  candidates.sort((a, b) => {
    if (b.upcoming !== a.upcoming) return b.upcoming - a.upcoming;
    if (b.completeness !== a.completeness) return b.completeness - a.completeness;
    const pa = summaries.find((s) => s.surfaceId === a.surfaceId)?.provenanceScore ?? 0;
    const pb = summaries.find((s) => s.surfaceId === b.surfaceId)?.provenanceScore ?? 0;
    return pb - pa;
  });

  const winner = candidates[0]!;
  const winnerSurface = input.surfaces.find((s) => s.surfaceId === winner.surfaceId)!;

  // Merge supporting surfaces that share occurrences (enrich fields).
  // Weaker surfaces may enrich matching keys but must not invent additional rows
  // when the winner is already a complete structured catalog (REST / embedded).
  const merged = new Map<string, ExtractedEventListing>();
  const winnerIsStructured =
    /wordpress_tec_rest|embedded_json_events|direct_ics|semantic_html_blocks|wordpress_tec_list/.test(
      String(winnerSurface.method),
    );

  for (const ev of winnerSurface.events) {
    const key = occurrenceKey(ev);
    merged.set(key, {
      ...ev,
      evidence: [...ev.evidence, `surface:${winnerSurface.surfaceId}`],
    });
  }

  const supporting = input.surfaces.filter((s) => {
    if (s.surfaceId === winner.surfaceId) return false;
    const sum = summaries.find((x) => x.surfaceId === s.surfaceId);
    return Boolean(sum && sum.upcoming > 0);
  });

  for (const surface of supporting) {
    for (const ev of surface.events) {
      if (
        winner.upcoming > 0 &&
        ev.startDate &&
        !isUpcomingLocalDate(ev.startDate, now, tz)
      ) {
        continue;
      }
      const key = occurrenceKey(ev);
      const existing = merged.get(key);
      if (existing) {
        merged.set(key, mergeSameOccurrence(existing, ev, diagnostics));
      } else if (!winnerIsStructured) {
        // Only non-structured winners accept net-new rows from secondary surfaces.
        merged.set(key, {
          ...ev,
          evidence: [...ev.evidence, `surface:${surface.surfaceId}`],
        });
      } else {
        diagnostics.push(
          `reconcile:skip_extra_from_${surface.surfaceId}:${(ev.title || '').slice(0, 40)}`,
        );
      }
    }
  }

  diagnostics.push(`reconcile:winner:${winner.surfaceId}:${winner.method}:upcoming=${winner.upcoming}`);

  return {
    events: [...merged.values()],
    method: winnerSurface.method,
    winningSurfaceId: winner.surfaceId,
    diagnostics,
    surfaceSummaries: summaries,
  };
}

/** Provenance baseline by method — used as a weak tie-breaker only. */
export function provenanceScoreForMethod(method: string): number {
  switch (method) {
    case 'wordpress_tec_rest':
      return 9000;
    case 'embedded_json_events':
      return 8500;
    case 'direct_ics':
      return 8000;
    case 'semantic_html_blocks':
      return 7500;
    case 'wordpress_tec_list':
      return 7200;
    case 'wordpress_rhp_events':
      return 7000;
    case 'wix_events_hydration':
    case 'wix_events':
      return 6800;
    case 'squarespace_events':
      return 6500;
    case 'theater_season':
      return 6400;
    case 'json_ld':
      return 6000;
    case 'rss_feed':
    case 'atom_feed':
    case 'json_feed':
      return 4000;
    default:
      return 3000;
  }
}
