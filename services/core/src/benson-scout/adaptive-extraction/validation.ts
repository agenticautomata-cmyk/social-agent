/**
 * Self-checking before reporting healthy extraction.
 */

import type { ExtractedEventListing } from '../event-listing-extract.js';
import { isUpcomingLocalDate, localYmdInTimeZone } from '../event-listing-outcomes.js';
import type { AdaptiveExtractionStatus } from './types.js';

export type ValidationInput = {
  events: ExtractedEventListing[];
  pageHadFutureEventsLikely?: boolean;
  /** Visible event cards/listings on page but extractor yielded nothing. */
  visibleEventsUnparsed?: boolean;
  priorHealthyFingerprint?: string | null;
  priorEventCount?: number | null;
  now?: Date;
  timeZone?: string;
};

export type ValidationResult = {
  okForHealthy: boolean;
  statusHint: AdaptiveExtractionStatus | null;
  notes: string[];
  accepted: ExtractedEventListing[];
  quarantined: ExtractedEventListing[];
  contentFingerprint: string;
};

const NAV_NOISE =
  /^(home|menu|tickets?|gift cards?|faqs?|contact|about|buy tickets!?|view (as|menu)|upcoming events)$/i;

export function validateExtractedEvents(input: ValidationInput): ValidationResult {
  const now = input.now ?? new Date();
  const tz = input.timeZone ?? 'America/Chicago';
  const notes: string[] = [];
  const accepted: ExtractedEventListing[] = [];
  const quarantined: ExtractedEventListing[] = [];

  for (const ev of input.events) {
    const reasons: string[] = [];
    if (!ev.title || NAV_NOISE.test(ev.title.trim())) reasons.push('nav_or_generic_title');
    if (ev.startDate && !/^\d{4}-\d{2}-\d{2}$/.test(ev.startDate)) reasons.push('implausible_date');
    if (ev.startDate && ev.startDate < '2020-01-01') reasons.push('implausible_old_date');
    if (ev.startDate && ev.startDate > '2099-12-31') reasons.push('implausible_far_date');
    if (!ev.eventUrl && !ev.ticketOrRsvpUrl && !ev.ticketUrl && !ev.sourceUrl) {
      reasons.push('missing_source_url');
    }
    if (reasons.length) {
      quarantined.push(ev);
      notes.push(`quarantine:${ev.title}:${reasons.join(',')}`);
    } else {
      accepted.push(ev);
    }
  }

  const upcoming = accepted.filter((e) => isUpcomingLocalDate(e.startDate, now, tz));
  const fingerprint = accepted
    .map((e) => `${e.title}|${e.startDate ?? ''}|${e.startTimeLocal ?? ''}|${e.eventUrl ?? ''}`)
    .sort()
    .join('\n');

  if (accepted.length === 0 && input.events.length === 0) {
    notes.push('zero_yield');
    // Visible events with zero extract must NOT be empty_confirmed.
    if (input.visibleEventsUnparsed || input.pageHadFutureEventsLikely) {
      notes.push('visible_events_unparsed');
      return {
        okForHealthy: false,
        statusHint: 'needs_adapter',
        notes,
        accepted,
        quarantined,
        contentFingerprint: fingerprint,
      };
    }
    return {
      okForHealthy: false,
      statusHint: null,
      notes,
      accepted,
      quarantined,
      contentFingerprint: fingerprint,
    };
  }

  if (accepted.length === 0) {
    notes.push('all_quarantined');
    return {
      okForHealthy: false,
      statusHint: 'partial',
      notes,
      accepted,
      quarantined,
      contentFingerprint: fingerprint,
    };
  }

  if (accepted.length > 500) {
    notes.push('count_exceeds_bound');
    return {
      okForHealthy: false,
      statusHint: 'partial',
      notes,
      accepted: accepted.slice(0, 500),
      quarantined,
      contentFingerprint: fingerprint,
    };
  }

  // Distinct times for same-title same-day repeats should remain distinct rows.
  const seenKeys = new Set<string>();
  let duplicateKeys = 0;
  for (const ev of accepted) {
    const key = `${ev.title}|${ev.startDate}|${ev.startTimeLocal ?? ev.startDateTime ?? ''}`;
    if (seenKeys.has(key)) duplicateKeys += 1;
    seenKeys.add(key);
  }
  if (duplicateKeys > 0) notes.push(`duplicate_occurrence_keys:${duplicateKeys}`);

  if (
    typeof input.priorEventCount === 'number' &&
    input.priorEventCount > 0 &&
    accepted.length === 0
  ) {
    notes.push('sudden_zero_vs_prior_healthy');
    return {
      okForHealthy: false,
      statusHint: 'structure_changed',
      notes,
      accepted,
      quarantined,
      contentFingerprint: fingerprint,
    };
  }

  if (
    input.priorHealthyFingerprint &&
    input.priorHealthyFingerprint === fingerprint &&
    accepted.length > 0
  ) {
    notes.push('content_fingerprint_unchanged');
    return {
      okForHealthy: true,
      statusHint: 'no_change',
      notes,
      accepted,
      quarantined,
      contentFingerprint: fingerprint,
    };
  }

  if (upcoming.length === 0 && accepted.every((e) => e.startDate)) {
    const today = localYmdInTimeZone(now, tz);
    notes.push(`no_upcoming_as_of:${today}`);
    return {
      okForHealthy: true,
      statusHint: 'empty_confirmed',
      notes,
      accepted,
      quarantined,
      contentFingerprint: fingerprint,
    };
  }

  notes.push(`accepted:${accepted.length}`, `upcoming:${upcoming.length}`);
  return {
    okForHealthy: true,
    statusHint: 'healthy',
    notes,
    accepted,
    quarantined,
    contentFingerprint: fingerprint,
  };
}
