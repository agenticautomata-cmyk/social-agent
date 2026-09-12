import {
  classifyEditorialContainer,
  looksLikeEditorialContainerTitle,
} from '../../ask-benson/editorial-container.js';
import { isKcMetroLocation, isOutOfMarketLocation } from '../../ask-benson/url-geo.js';
import { isDateOnlyTimestamp } from '../../creator-agent/temporal-state.js';
import { computeOccurrenceFingerprint, computeSkipMatchIdentity } from '../../creator-skip/fingerprint.js';
import { getCreatorTimezone, getLocalCalendarDay } from '../../datetime.js';
import { isEditorialHeadlineTitle } from '../../inventory/today-clarity.js';
import type { InventoryItem } from '../../inventory/normalize.js';
import { resolveDisplayTitleFromRecord } from '../../display-title/index.js';
import { isPoliticalCivicBanquet, isPrivateOrMemberOnly } from '../weekend-things-to-do.js';
import { calendarCategoryFromInventory } from './calendar-category.js';
import type { PopulationCandidate, PopulationRejection } from './types.js';
import {
  evaluatePublicEventEligibility,
} from '../../inventory/public-event-eligibility.js';
import { isPageLevelArchiveTitle } from '../../ask-benson/editorial-container.js';
import {
  dateAgreesWithExplicitWeekday,
  utcWeekdayFromIsoDate,
  weekdayIndexFromToken,
} from '../../curator-watchlist/watchlist-date-trust.js';
import {
  isFragmentaryDiscoverTitle,
  isRemoteCityHeadline,
  isSeoLeftoverDiscover,
  looksLikeRawScraperText,
} from '../../creator-interest/discover-trust.js';
import { isDiscoverHubUrl } from '../../creator-interest/discover-identity.js';
import {
  admissionCandidateFromCuratorLead,
  admissionCandidateFromInventory,
  admissionDecisionToMetadata,
  evaluateCalendarAdmission,
  isCalendarAccepted,
  calendarAdmissionAllowsDisplay,
} from '../admission/index.js';

const EVENT_IDENTITY_RE =
  /\b(event|events|concert|festival|fair|market|meetup|meet-up|dj\b|nightlife|class(?:es)?|workshop|brunch|matinee|art walk|pickleball|wine down|tickets?|live music|open mic|popup|pop-up|tasting|parade|816)\b/i;

const PARTNERSHIP_RE = /creator_partnership|affiliate|brand ambassador|ugc program/i;

const NATIONAL_SEO_RE =
  /\b(every state|tour dates?\s*\| |\|\s*(ticketmaster|fidelity)|sales tax holidays?)\b/i;

const CIVIC_MEETING_RE =
  /\b(advisory committee|city council|board of (aldermen|directors)|public hearing)\b/i;

/** Listing UI/nav copy extracted as a dated child — not an event title. */
const LISTING_CHROME_PHRASE_RE =
  /\b(?:in\s+)?(?:calendar|list|grid)\s+view\b|\b(?:concerts|events|shows)\s+happening\s+this\s+(?:week|weekend|month)\b|\bview\s+(?:event|tickets|calendar)\b|\b(?:next|previous)\s+(?:week|month|page|events?)\b/i;

const LISTING_NAV_WORD_RE = /\b(today|next|previous)\b/gi;

const BARE_YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK_RE = /^\d{1,2}:\d{2}(?::\d{2})?/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function extractedStringField(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function extractedTemporalFields(item: Pick<InventoryItem, 'metadata' | 'temporalEvidence'>): {
  eventDate: string | null;
  eventEndDate: string | null;
  startTime: string | null;
} {
  const fromEvidence = item.temporalEvidence;
  const meta = item.metadata ?? {};
  const fromMeta = isRecord(meta.extracted) ? meta.extracted : null;
  const rawPayload = isRecord(meta.rawPayload) ? meta.rawPayload : null;
  const fromRaw = rawPayload && isRecord(rawPayload.extracted) ? rawPayload.extracted : null;
  const extracted = fromMeta ?? fromRaw;
  return {
    eventDate:
      extractedStringField(fromEvidence?.eventDate) ?? extractedStringField(extracted?.eventDate),
    eventEndDate:
      extractedStringField(fromEvidence?.eventEndDate) ??
      extractedStringField(extracted?.eventEndDate),
    startTime:
      extractedStringField(fromEvidence?.startTime) ?? extractedStringField(extracted?.startTime),
  };
}

function hasRealExtractedClock(startTime: string | null): boolean {
  if (!startTime) return false;
  return CLOCK_RE.test(startTime);
}

/**
 * Calendar day key for inventory `past_event` comparison.
 * True date-only → encoded UTC YYYY-MM-DD; timed → America/Chicago local day.
 */
export function inventoryTemporalDayKey(
  iso: string | null | undefined,
  item: Pick<InventoryItem, 'metadata' | 'temporalEvidence'>,
  which: 'start' | 'end' = 'start',
  timezone: string = getCreatorTimezone(),
): string | null {
  if (!iso?.trim()) return null;
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return null;

  const extracted = extractedTemporalFields(item);
  if (hasRealExtractedClock(extracted.startTime)) {
    return getLocalCalendarDay(instant, timezone);
  }

  const bare =
    which === 'end'
      ? extracted.eventEndDate && BARE_YMD_RE.test(extracted.eventEndDate)
        ? extracted.eventEndDate
        : null
      : extracted.eventDate && BARE_YMD_RE.test(extracted.eventDate)
        ? extracted.eventDate
        : null;
  if (bare) return bare;

  if (isDateOnlyTimestamp(instant)) {
    return instant.toISOString().slice(0, 10);
  }

  return getLocalCalendarDay(instant, timezone);
}

function listingTitleKey(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isListingChromeContainerChildTitle(title: string): boolean {
  const raw = title.trim();
  if (!raw) return false;
  if (LISTING_CHROME_PHRASE_RE.test(raw)) return true;
  const navWords = raw.match(LISTING_NAV_WORD_RE) ?? [];
  if (navWords.length >= 2) return true;
  return false;
}

function comparableContainerPlaceKeys(item: Pick<InventoryItem, 'venue' | 'locationName' | 'businessName'>): string[] {
  const keys: string[] = [];
  // Venue only — businessName often duplicates the event title for named shows
  // (e.g. "Kansas City Home Show") and must not trip venue-as-title.
  for (const raw of [item.venue]) {
    const key = listingTitleKey(raw);
    if (key.length >= 3) keys.push(key);
  }
  const locRaw = (item.locationName ?? '').trim();
  const locKey = listingTitleKey(locRaw);
  if (locKey.length >= 3 && !isKcMetroLocation(locRaw)) keys.push(locKey);
  return keys;
}

export function isVenueAsTitleContainerChild(
  item: Pick<InventoryItem, 'title' | 'venue' | 'locationName' | 'businessName' | 'metadata'>,
): boolean {
  if (item.metadata?.containerChild !== true) return false;
  const titleKey = listingTitleKey(item.title).replace(/^at\s+/, '');
  if (titleKey.length < 3) return false;
  return comparableContainerPlaceKeys(item).some((place) => place === titleKey || place.replace(/^at\s+/, '') === titleKey);
}

export function calendarMarketTokensConflict(aTokens: string[], bTokens: string[]): boolean {
  const aHay = aTokens.join(' ');
  const bHay = bTokens.join(' ');
  return isOutOfMarketLocation(aHay) !== isOutOfMarketLocation(bHay);
}

export type CuratorLeadEligibilityInput = {
  id: string;
  eventName: string;
  eventDate: string | null;
  eventTime: string | null;
  venue: string | null;
  neighborhood: string | null;
  dayHeading?: string | null;
  originalQuotedText?: string | null;
  verificationStatus: string;
  dismissedAt: Date | string | null;
  discoveredViaHandle: string;
  discoveredViaPostUrl: string;
  officialOrganizerUrl: string | null;
  officialVenueUrl: string | null;
  ticketUrl: string | null;
  officialSocialUrl: string | null;
  linkedContentItemId: string | null;
  watcherId: string;
  creatorValueScore?: string | null;
  occurrenceFingerprint?: string | null;
};

export type EligibilityDecision =
  | { ok: true; reason?: undefined }
  | { ok: false; reason: PopulationRejection['category']; detail: string };

function haystack(parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

function parseClock(time: string | null | undefined): string | null {
  if (!time?.trim()) return null;
  const raw = time.trim().toLowerCase().replace(/\./g, '');
  const range = raw.split(/\s*[-–—to]+\s*/i)[0] ?? raw;
  const m = range.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!m) return null;
  let hour = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const ap = (m[3] ?? '').toLowerCase();
  if (ap === 'pm' && hour < 12) hour += 12;
  if (ap === 'am' && hour === 12) hour = 0;
  if (!ap && hour <= 7) hour += 12;
  if (hour > 23 || min > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:00`;
}

/** Convert a Chicago wall-clock date/time to a UTC Date. */
export function chicagoWallTimeToUtc(dateYmd: string, clockHms = '12:00:00'): Date | null {
  const d = dateYmd.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const clock = /^\d{2}:\d{2}:\d{2}$/.test(clockHms) ? clockHms : '12:00:00';
  const [year, month, day] = d.split('-').map(Number);
  const [hour, minute, second] = clock.split(':').map(Number);
  if (![year, month, day, hour, minute, second].every((n) => Number.isFinite(n))) return null;
  const tz = getCreatorTimezone();
  const wantedUtc = Date.UTC(year!, month! - 1, day!, hour!, minute!, second!);
  let guess = wantedUtc;
  for (let i = 0; i < 4; i += 1) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(guess));
    const num = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value);
    const localAsUtc = Date.UTC(
      num('year'),
      num('month') - 1,
      num('day'),
      num('hour'),
      num('minute'),
      num('second'),
    );
    const diff = wantedUtc - localAsUtc;
    if (diff === 0) return new Date(guess);
    guess += diff;
  }
  return new Date(guess);
}

export function calendarStartAtFromDateTime(date: string | null | undefined, time?: string | null): Date | null {
  if (!date?.trim()) return null;
  const ymd = date.trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    return chicagoWallTimeToUtc(ymd, parseClock(time) ?? '12:00:00');
  }
  const parsed = Date.parse(date.trim());
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

export function verificationRank(state: string | null | undefined): number {
  const s = (state ?? '').trim();
  const lower = s.toLowerCase();
  if (s === 'VERIFIED' || lower === 'verified' || lower.startsWith('official_') || lower === 'verified_official') {
    return 40;
  }
  if (s === 'PARTIALLY_VERIFIED' || lower === 'partially_verified' || lower === 'trusted_secondary_source') {
    return 25;
  }
  if (s === 'SOCIAL_LEAD' || lower === 'social_lead' || lower === 'unverified' || lower === 'newsletter_only') {
    return 10;
  }
  if (s === 'CONFLICTED' || s === 'EXPIRED' || lower === 'conflicted' || lower === 'expired') {
    return 0;
  }
  return 8;
}

export type CalendarVerificationDisplay = 'verified' | 'needs_verification';

export function calendarVerificationDisplay(state: string | null | undefined): CalendarVerificationDisplay {
  return verificationRank(state) >= 40 ? 'verified' : 'needs_verification';
}

export function strongerVerification(existing: string | null | undefined, incoming: string | null | undefined): string {
  if (verificationRank(incoming) > verificationRank(existing)) return incoming ?? existing ?? 'unverified';
  return existing ?? incoming ?? 'unverified';
}

export function isCalendarKcRelevant(
  text: string,
  opts?: { watchlistDefault?: boolean },
): boolean {
  const blob = text.trim();
  if (isOutOfMarketLocation(blob) && !isKcMetroLocation(blob)) {
    return false;
  }
  if (isKcMetroLocation(blob)) return true;
  if (opts?.watchlistDefault) return !isOutOfMarketLocation(blob);
  return !isOutOfMarketLocation(blob) && blob.length > 0;
}

export function isCalendarParentContainerItem(
  item: Pick<InventoryItem, 'title' | 'sourceUrl' | 'summary' | 'metadata' | 'eventDate' | 'category' | 'ingest' | 'sourceName'>,
): boolean {
  const meta = item.metadata ?? {};
  if (meta.calendarEligible === false) return true;
  // Dated extracted children keep the hub listing URL as sourceUrl (shared-hub
  // persist). Re-classifying that URL as a listing hub would drop every child.
  if (meta.containerChild === true) return false;
  if (meta.parentRepresentsSingleEvent === true) return false;
  if (meta.editorialContainer === true) return true;
  const classified = classifyEditorialContainer({
    url: item.sourceUrl,
    title: item.title,
    pageText: item.summary,
  });
  if (classified.isContainer && !classified.parentRepresentsSingleEvent) return true;
  if (looksLikeEditorialContainerTitle(item.title)) return true;
  return false;
}

export function inventoryEventIdentity(item: Pick<InventoryItem, 'title' | 'summary' | 'category' | 'venue' | 'locationName' | 'ingest'>): boolean {
  if (looksLikeEditorialContainerTitle(item.title)) return false;
  if ((item.venue ?? '').trim().length >= 3) return true;
  const hay = `${item.title} ${item.summary ?? ''} ${item.category ?? ''} ${item.ingest ?? ''}`;
  if (EVENT_IDENTITY_RE.test(hay)) return true;
  if (/\b(event|festival|concert|nightlife|community_event|local_event)\b/i.test(item.category ?? '')) return true;
  return false;
}

function admissionToEligibility(
  decision: ReturnType<typeof evaluateCalendarAdmission>,
): EligibilityDecision {
  if (isCalendarAccepted(decision)) return { ok: true };
  const code = decision.primaryReason;
  const category: PopulationRejection['category'] =
    code === 'no_date'
      ? 'no_date'
      : code === 'expired' || code === 'past_event' || code === 'stale_source'
        ? 'expired'
        : code === 'suppressed'
          ? 'suppressed'
          : code === 'duplicate_event'
            ? 'duplicate'
            : 'excluded';
  // Prefer authoritative admission reason codes; keep temporal detail strings for legacy tests.
  const detail =
    code === 'expired' || code === 'past_event' || code === 'suppressed' || code === 'no_date'
      ? decision.detail || code
      : code === 'excluded' && decision.detail && decision.detail !== 'accepted'
        ? decision.detail
        : code;
  return { ok: false, reason: category, detail };
}

export function evaluateInventoryCalendarEligibility(
  item: InventoryItem,
  now = new Date(),
): EligibilityDecision {
  // Authoritative Calendar admission boundary — geo/temporal/eventness/completeness/presentation.
  const admission = evaluateCalendarAdmission(admissionCandidateFromInventory(item), now);
  if (!isCalendarAccepted(admission)) {
    return admissionToEligibility(admission);
  }

  // Inventory-shaped projection guards (containers, identity, public-event lane).
  if (isPoliticalCivicBanquet(item)) return { ok: false, reason: 'excluded', detail: 'political_civic' };
  if (isPrivateOrMemberOnly(item)) return { ok: false, reason: 'excluded', detail: 'private' };
  if (isCalendarParentContainerItem(item)) {
    return { ok: false, reason: 'excluded', detail: 'editorial_container' };
  }
  if (item.metadata?.containerChild === true && isListingChromeContainerChildTitle(item.title)) {
    return { ok: false, reason: 'excluded', detail: 'listing_chrome' };
  }
  if (isVenueAsTitleContainerChild(item)) {
    return { ok: false, reason: 'excluded', detail: 'venue_as_title' };
  }
  if (NATIONAL_SEO_RE.test(item.title) || CIVIC_MEETING_RE.test(item.title)) {
    return { ok: false, reason: 'excluded', detail: 'non_event_discover' };
  }
  const meta = item.metadata ?? {};
  const category = `${item.category ?? ''} ${typeof meta.opportunityCategory === 'string' ? meta.opportunityCategory : ''}`;
  if (PARTNERSHIP_RE.test(category) && !item.eventDate) {
    return { ok: false, reason: 'excluded', detail: 'non_event_partnership' };
  }
  if (PARTNERSHIP_RE.test(category) && !inventoryEventIdentity(item)) {
    return { ok: false, reason: 'excluded', detail: 'non_event_discover' };
  }
  if (!inventoryEventIdentity(item)) {
    return { ok: false, reason: 'excluded', detail: 'not_event_identity' };
  }
  if (isPageLevelArchiveTitle(item.title)) {
    return { ok: false, reason: 'excluded', detail: 'page_level_archive_title' };
  }
  // Chicago day past check (admission uses ISO date prefix; honor extracted clocks).
  const todayKey = getLocalCalendarDay(now);
  const eventKey = inventoryTemporalDayKey(item.eventDate, item, 'start');
  const endKey = inventoryTemporalDayKey(item.eventEndDate, item, 'end');
  if (eventKey && eventKey < todayKey && (!endKey || endKey < todayKey)) {
    return { ok: false, reason: 'expired', detail: 'past_event' };
  }
  // Canonical public-event gate — eligibility before any calendar ranking/projection.
  const publicEvent = evaluatePublicEventEligibility(item, now);
  if (!publicEvent.laneEligibility.calendar_suggestion) {
    return {
      ok: false,
      reason: 'excluded',
      detail: publicEvent.rejectionReasonCode ?? 'public_event_ineligible',
    };
  }
  return { ok: true };
}

export function evaluateCuratorLeadCalendarEligibility(
  lead: CuratorLeadEligibilityInput,
  now = new Date(),
): EligibilityDecision {
  if (lead.dismissedAt) return { ok: false, reason: 'dismissed', detail: 'lead_dismissed' };
  if (lead.verificationStatus === 'EXPIRED') return { ok: false, reason: 'expired', detail: 'EXPIRED' };
  if (lead.verificationStatus === 'CONFLICTED') return { ok: false, reason: 'excluded', detail: 'CONFLICTED' };
  if (!lead.eventDate) return { ok: false, reason: 'no_date', detail: 'no_date' };
  const start = calendarStartAtFromDateTime(lead.eventDate, lead.eventTime);
  if (!start) return { ok: false, reason: 'no_date', detail: 'unparseable_date' };
  const todayKey = getLocalCalendarDay(now);
  if (getLocalCalendarDay(start) < todayKey) {
    return { ok: false, reason: 'expired', detail: 'past_event' };
  }

  const admission = evaluateCalendarAdmission(
    admissionCandidateFromCuratorLead({
      ...lead,
      eventDate: start.toISOString(),
    }),
    now,
  );
  if (!isCalendarAccepted(admission)) {
    return admissionToEligibility(admission);
  }

  const iso = lead.eventDate.slice(0, 10);
  const headingIdx = lead.dayHeading ? weekdayIndexFromToken(lead.dayHeading) : null;
  if (headingIdx != null && utcWeekdayFromIsoDate(iso) !== headingIdx) {
    return { ok: false, reason: 'excluded', detail: 'weekday_contradiction' };
  }
  const weekdayHay = haystack([lead.dayHeading, lead.eventName, lead.originalQuotedText, lead.venue]);
  if (!dateAgreesWithExplicitWeekday(weekdayHay, iso)) {
    return { ok: false, reason: 'excluded', detail: 'weekday_contradiction' };
  }
  return { ok: true };
}

export function inventoryVerificationState(item: InventoryItem): string {
  const meta = item.metadata ?? {};
  const raw =
    (typeof meta.verificationStatus === 'string' && meta.verificationStatus) ||
    (typeof meta.verificationState === 'string' && meta.verificationState) ||
    (typeof meta.calendarVerification === 'string' && meta.calendarVerification) ||
    null;
  if (raw) return raw;
  if (item.ingest === 'newsletter_intelligence' && typeof meta.verificationStatus === 'string') {
    return meta.verificationStatus;
  }
  return 'unverified';
}

export function whyIncludedForInventory(item: InventoryItem): string {
  const ingest = (item.ingest ?? '').toLowerCase();
  if (ingest.includes('watchlist_verified')) return 'Watchlist verified';
  if (ingest.includes('ask_benson')) return 'Ask Benson';
  if (ingest.includes('gmail') || ingest.includes('discoveries') || ingest.includes('email')) {
    return 'discoveries@';
  }
  if (ingest.includes('newsletter')) return 'Newsletter';
  if (ingest.includes('curator') || ingest.includes('watchlist')) {
    return 'Instagram Watchlist';
  }
  if (item.sourceName?.trim()) {
    const name = item.sourceName.trim();
    if (name.length <= 48 && !/\bwith\b/i.test(name) && !/\bamphitheatr/i.test(name)) {
      return name;
    }
  }
  return 'Benson inventory';
}

/**
 * Calendar allDay for inventory suggestions.
 * Prefer extracted startTime / date-only eventDate over UTC-midnight heuristics:
 * timed local events often persist as T00:00:00Z after timezone conversion.
 * Chicago-local midnight without a trustworthy extracted clock is date-only —
 * never render as "12:00 AM".
 */
export function inventoryCalendarAllDay(item: InventoryItem, start: Date): boolean {
  const extracted = extractedTemporalFields(item);
  if (hasRealExtractedClock(extracted.startTime)) {
    return false;
  }
  if (extracted.eventDate && BARE_YMD_RE.test(extracted.eventDate)) {
    return true;
  }
  if (
    start.getUTCHours() === 0 &&
    start.getUTCMinutes() === 0 &&
    start.getUTCSeconds() === 0
  ) {
    return true;
  }
  const localParts = new Intl.DateTimeFormat('en-US', {
    timeZone: getCreatorTimezone(),
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(start);
  const hour = Number(localParts.find((p) => p.type === 'hour')?.value);
  const minute = Number(localParts.find((p) => p.type === 'minute')?.value);
  const second = Number(localParts.find((p) => p.type === 'second')?.value);
  if (hour === 0 && minute === 0 && second === 0) {
    return true;
  }
  return false;
}

export function candidateFromInventory(item: InventoryItem): PopulationCandidate {
  const start = new Date(item.eventDate!);
  const allDay = inventoryCalendarAllDay(item, start);
  const identity = computeSkipMatchIdentity({
    title: item.title,
    eventDate: item.eventDate,
    locationName: item.locationName,
    formattedAddress: item.formattedAddress,
    venue: item.venue,
  });
  const fingerprint = computeOccurrenceFingerprint({
    title: item.title,
    eventDate: item.eventDate,
    eventEndDate: item.eventEndDate,
    locationName: item.locationName,
    formattedAddress: item.formattedAddress,
    venue: item.venue,
    sourceUrl: item.sourceUrl,
  });
  const skipKey = identity?.key ?? fingerprint;
  const verification = inventoryVerificationState(item);
  const admission = evaluateCalendarAdmission(admissionCandidateFromInventory(item));
  const location =
    admission.display.location ||
    item.venue?.trim() ||
    item.locationName?.trim() ||
    item.formattedAddress?.trim() ||
    item.neighborhood?.trim() ||
    null;
  const display = resolveDisplayTitleFromRecord({
    rawTitle: admission.display.title || item.title,
    sourceName: item.sourceName,
    venueName: location,
    sourceUrl: item.sourceUrl,
    summary: admission.display.description ?? item.summary,
    metadata: item.metadata,
    businessName: item.businessName,
  });
  // Never let listing-chrome / archive display titles replace a usable event title.
  const resolvedTitle =
    isPageLevelArchiveTitle(display.displayTitle) || /events?\s+archive/i.test(display.displayTitle)
      ? item.title
      : display.displayTitle;
  return {
    sourceRecordType: 'content_item',
    sourceRecordId: item.id,
    calendarIntent: 'public_event',
    itemType: 'public_event',
    planningStatus: 'suggested',
    title: resolvedTitle,
    description: admission.display.description,
    startAt: start.toISOString(),
    endAt: item.eventEndDate,
    allDay,
    timezone: getCreatorTimezone(),
    location,
    sourceUrl: item.sourceUrl,
    internalDetailUrl: `/discoveries/${item.id}`,
    occurrenceFingerprint: fingerprint,
    idempotencyKey: `skip:${skipKey}`,
    confidence: item.audienceScore ? item.audienceScore / 100 : undefined,
    verificationState: verification,
    populationSource: item.ingest ?? 'content_item',
    createdBy: 'benson_inventory',
    whyIncluded: whyIncludedForInventory(item),
    metadata: {
      ingest: item.ingest,
      skipKey,
      rawTitle: item.title,
      displayIdentity: {
        displayTitle: display.displayTitle,
        displaySubtitle: display.displaySubtitle,
        sourceName: display.sourceName,
        venueName: display.venueName,
        rawTitle: item.title,
        changeReason: display.changeReason,
        verification: display.verification,
      },
      ticketUrl: typeof item.metadata?.ticketUrl === 'string' ? item.metadata.ticketUrl : null,
      organizerUrl:
        typeof item.metadata?.officialOrganizerUrl === 'string'
          ? item.metadata.officialOrganizerUrl
          : item.locationWebsiteUrl,
      calendarCategory: calendarCategoryFromInventory(item),
      opportunityCategory: item.category,
      estateSaleFlag: item.flags.estateSale,
      sourceType: item.sourceType,
      ...admissionDecisionToMetadata(admission),
    },
  };
}

export function candidateFromCuratorLead(lead: CuratorLeadEligibilityInput): PopulationCandidate | null {
  const start = calendarStartAtFromDateTime(lead.eventDate, lead.eventTime);
  if (!start) return null;
  const eventDateIso = start.toISOString();
  const identity = computeSkipMatchIdentity({
    title: lead.eventName,
    eventDate: eventDateIso,
    locationName: lead.neighborhood,
    venue: lead.venue,
  });
  const fingerprint =
    lead.occurrenceFingerprint ??
    computeOccurrenceFingerprint({
      title: lead.eventName,
      eventDate: eventDateIso,
      locationName: lead.neighborhood,
      venue: lead.venue,
      sourceUrl: lead.discoveredViaPostUrl,
    });
  const skipKey = identity?.key ?? fingerprint;
  const sourceUrl =
    lead.officialOrganizerUrl ||
    lead.ticketUrl ||
    lead.officialVenueUrl ||
    lead.officialSocialUrl ||
    lead.discoveredViaPostUrl;
  const handle = lead.discoveredViaHandle.replace(/^@/, '');
  const allDay = !lead.eventTime?.trim();
  const linked = lead.linkedContentItemId;
  const admission = evaluateCalendarAdmission(
    admissionCandidateFromCuratorLead({
      ...lead,
      eventDate: eventDateIso,
    }),
  );
  const location = admission.display.location || lead.venue || lead.neighborhood || null;
  return {
    sourceRecordType: linked ? 'content_item' : 'curator_event_lead',
    sourceRecordId: linked ?? lead.id,
    calendarIntent: 'public_event',
    itemType: 'public_event',
    planningStatus: 'suggested',
    title: admission.display.title || lead.eventName,
    description: admission.display.description ?? [lead.venue, lead.neighborhood, `via @${handle}`].filter(Boolean).join(' · '),
    startAt: eventDateIso,
    endAt: null,
    allDay,
    timezone: getCreatorTimezone(),
    location,
    sourceUrl,
    internalDetailUrl: `/watchlist/${lead.watcherId}`,
    occurrenceFingerprint: fingerprint,
    idempotencyKey: `skip:${skipKey}`,
    confidence: lead.creatorValueScore ? Number(lead.creatorValueScore) : undefined,
    verificationState: lead.verificationStatus,
    populationSource: 'instagram_watchlist',
    createdBy: 'benson_watchlist',
    whyIncluded: `Instagram Watchlist · @${handle}`,
    metadata: {
      curatorLeadId: lead.id,
      watcherId: lead.watcherId,
      discoveredViaHandle: handle,
      ticketUrl: lead.ticketUrl,
      organizerUrl: lead.officialOrganizerUrl || lead.officialVenueUrl,
      ingest: 'instagram_watchlist',
      skipKey,
      ...admissionDecisionToMetadata(admission),
    },
  };
}

/** Cheap list-time gate for already-projected suggestions that later fail city/editorial rules. */
export function calendarSuggestionIsDisplayable(item: {
  title: string;
  location?: string | null;
  sourceUrl?: string | null;
  description?: string | null;
  planningStatus?: string | null;
  metadata?: unknown;
}): boolean {
  // Authoritative read-time admission filter when metadata is present.
  if (item.metadata != null || item.planningStatus != null) {
    return calendarAdmissionAllowsDisplay(item);
  }
  const loc = (item.location ?? '').trim();
  // Location field wins over title brand tokens ("Sporting KC … Seattle, WA").
  if (loc && isOutOfMarketLocation(loc)) return false;
  if (isOutOfMarketLocation(item.title) && !isKcMetroLocation(item.title)) return false;
  const hay = `${item.title} ${loc}`;
  if (isOutOfMarketLocation(hay) && !isKcMetroLocation(hay)) return false;
  if (NATIONAL_SEO_RE.test(item.title) || CIVIC_MEETING_RE.test(item.title)) return false;
  if (/\bkc sipps\b/i.test(item.title)) return false;
  if (looksLikeEditorialContainerTitle(item.title)) return false;
  if (looksLikeRawScraperText(item.title)) return false;
  if (isFragmentaryDiscoverTitle(item.title)) return false;
  if (isSeoLeftoverDiscover(item.title, item.sourceUrl, item.description)) return false;
  if (isRemoteCityHeadline(item.title, loc)) return false;
  if (isEditorialHeadlineTitle(item.title)) return false;
  if (isDiscoverHubUrl(item.sourceUrl) && /utm_source=openai/i.test(item.sourceUrl ?? '')) {
    return false;
  }
  const yearHit = item.title.match(/\b((?:19|20)\d{2})\b/);
  if (yearHit && Number(yearHit[1]) < new Date().getFullYear()) return false;
  return true;
}
