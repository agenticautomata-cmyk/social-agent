/**
 * Generic public event-listing extraction for Watchlist web sources.
 *
 * Ordered strategies (no LLM as factual source):
 * 1. Event JSON-LD / schema.org
 * 2. Other structured metadata (OpenGraph event-ish — reserved)
 * 3. Wix Events / events-viewer hydration when safely parseable
 * 4. Semantic HTML event blocks / repeated title+date+venue+link groups
 * 5. Playwright-rendered DOM only when caller opts in after static miss
 */

import { parseJsonLdPageGraph } from '../ask-benson/jsonld-events.js';

export type EventListingExtractionMethod =
  | 'json_ld'
  | 'wix_events_hydration'
  | 'semantic_html_blocks'
  | 'playwright_dom'
  | 'none';

export type ExtractedEventListing = {
  externalId: string | null;
  title: string;
  startDate: string | null;
  startDateTime: string | null;
  endDate: string | null;
  endDateTime: string | null;
  venue: string | null;
  address: string | null;
  city: string | null;
  regionState: string | null;
  priceText: string | null;
  isFree: boolean | null;
  eventUrl: string | null;
  ticketOrRsvpUrl: string | null;
  organizer: string | null;
  isRecurring: boolean;
  imageUrl: string | null;
  sourceUrl: string;
  evidence: string[];
  method: EventListingExtractionMethod;
  verificationState: 'verified' | 'partial' | 'unresolved_date';
};

export type EventListingExtractResult = {
  events: ExtractedEventListing[];
  method: EventListingExtractionMethod;
  strategiesAttempted: EventListingExtractionMethod[];
  rejectionReasons: string[];
  capability: EventListingCapability;
  retrievedAt: string;
};

export type EventListingCapability = {
  looksLikeEventListing: boolean;
  hasJsonLdEvents: boolean;
  hasWixEventsSignals: boolean;
  hasRepeatedEventBlocks: boolean;
  isWixSite: boolean;
  reasons: string[];
};

const WIX_EVENTS_MARKERS = [
  /events-viewer/i,
  /wix-one-events/i,
  /data-hook=["']short-date["']/i,
  /data-hook=["']ev-short-date-location["']/i,
  /event-details-registration/i,
  /static\.parastorage\.com\/services\/events-viewer/i,
];

const WIX_SITE_MARKERS = [
  /static\.parastorage\.com/i,
  /wix-thunderbolt/i,
  /meta[^>]+content=["']Wix\.com/i,
  /generator["']\s+content=["']Wix\.com/i,
];

const EVENT_PATH_RE =
  /(?:^|\/)(?:events?|live-music(?:-events)?|concerts?|shows?|calendar|upcoming|whats-?on|what-s-on)(?:\/|$)/i;

export function urlLooksLikeEventListing(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (EVENT_PATH_RE.test(parsed.pathname)) return true;
    if (/event-details-registration/i.test(parsed.pathname)) return true;
    return false;
  } catch {
    return false;
  }
}

export function detectEventListingCapability(html: string, pageUrl?: string): EventListingCapability {
  const reasons: string[] = [];
  const isWixSite = WIX_SITE_MARKERS.some((re) => re.test(html));
  const hasWixEventsSignals = WIX_EVENTS_MARKERS.some((re) => re.test(html));
  const jsonLd = parseJsonLdPageGraph(html);
  const hasJsonLdEvents = jsonLd.events.length > 0;
  const hasRepeatedEventBlocks =
    (html.match(/data-hook=["']title["']/gi)?.length ?? 0) >= 2 &&
    (html.match(/data-hook=["']short-date["']/gi)?.length ?? 0) >= 2;
  if (pageUrl && urlLooksLikeEventListing(pageUrl)) reasons.push('url_path_eventish');
  if (hasJsonLdEvents) reasons.push(`json_ld_events:${jsonLd.events.length}`);
  if (hasWixEventsSignals) reasons.push('wix_events_markers');
  if (hasRepeatedEventBlocks) reasons.push('repeated_wix_event_cards');
  if (isWixSite && !hasWixEventsSignals && !hasJsonLdEvents) {
    reasons.push('wix_site_without_events_widget');
  }
  const looksLikeEventListing =
    hasJsonLdEvents ||
    hasWixEventsSignals ||
    hasRepeatedEventBlocks ||
    Boolean(pageUrl && urlLooksLikeEventListing(pageUrl));
  return {
    looksLikeEventListing,
    hasJsonLdEvents,
    hasWixEventsSignals,
    hasRepeatedEventBlocks,
    isWixSite,
    reasons,
  };
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#x2F;/gi, '/');
}

function absoluteUrl(href: string | null | undefined, pageUrl: string): string | null {
  if (!href?.trim()) return null;
  try {
    return new URL(href.trim(), pageUrl).href;
  } catch {
    return null;
  }
}

function fingerprintParts(input: {
  eventUrl?: string | null;
  externalId?: string | null;
  title: string;
  startDate: string | null;
  venue: string | null;
}): string {
  if (input.externalId?.trim()) return `id:${input.externalId.trim()}`;
  if (input.eventUrl?.trim()) return `url:${input.eventUrl.trim().toLowerCase()}`;
  return `tvv:${input.title.trim().toLowerCase()}|${input.startDate ?? ''}|${(input.venue ?? '').toLowerCase()}`;
}

function verificationFor(ev: {
  title: string;
  startDate: string | null;
  startDateTime: string | null;
  eventUrl: string | null;
}): ExtractedEventListing['verificationState'] {
  if (!ev.title.trim()) return 'partial';
  if (!ev.startDate && !ev.startDateTime) return 'unresolved_date';
  if (ev.eventUrl || ev.startDate || ev.startDateTime) return 'verified';
  return 'partial';
}

function dedupeEvents(events: ExtractedEventListing[]): ExtractedEventListing[] {
  const seen = new Set<string>();
  const out: ExtractedEventListing[] = [];
  for (const ev of events) {
    const key = fingerprintParts({
      eventUrl: ev.eventUrl,
      externalId: ev.externalId,
      title: ev.title,
      startDate: ev.startDate,
      venue: ev.venue,
    });
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ev);
  }
  return out;
}

function extractFromJsonLd(html: string, pageUrl: string): ExtractedEventListing[] {
  const graph = parseJsonLdPageGraph(html);
  return graph.events.map((ev) => {
    const startDateTime = ev.startDate && ev.startTime ? `${ev.startDate}T${ev.startTime}` : null;
    const endDateTime = ev.endDate && ev.endTime ? `${ev.endDate}T${ev.endTime}` : null;
    const eventUrl = absoluteUrl(ev.url, pageUrl);
    const row: ExtractedEventListing = {
      externalId: null,
      title: ev.name,
      startDate: ev.startDate,
      startDateTime,
      endDate: ev.endDate,
      endDateTime,
      venue: ev.venue,
      address: ev.address,
      city: ev.city,
      regionState: null,
      priceText: null,
      isFree: null,
      eventUrl,
      ticketOrRsvpUrl: eventUrl,
      organizer: ev.publisher,
      isRecurring: false,
      imageUrl: null,
      sourceUrl: pageUrl,
      evidence: ['json_ld_event', ev.startDate ? `start:${ev.startDate}` : 'start:unresolved'],
      method: 'json_ld',
      verificationState: 'partial',
    };
    row.verificationState = verificationFor(row);
    return row;
  });
}

type WixHydratedEvent = {
  id?: string;
  title?: string;
  slug?: string;
  location?: {
    name?: string;
    address?: string;
    fullAddress?: {
      city?: string;
      subdivision?: string;
      formattedAddress?: string;
    };
  };
  scheduling?: {
    config?: {
      startDate?: string;
      endDate?: string;
      timeZoneId?: string;
      recurrences?: { status?: number; occurrences?: unknown[] };
    };
    formatted?: string;
    startDateFormatted?: string;
    startTimeFormatted?: string;
    endDateFormatted?: string;
    endTimeFormatted?: string;
  };
  mainImage?: { id?: string; url?: string };
  registration?: { type?: number };
};

function tryParseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Locate `"events":[{...}]` arrays whose objects look like Wix Events records
 * (title + scheduling and/or location), without calling private Wix APIs.
 */
export function extractWixEventsHydration(html: string): WixHydratedEvent[] {
  const found: WixHydratedEvent[] = [];
  const re = /"events"\s*:\s*\[/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const start = html.indexOf('[', match.index);
    if (start < 0) continue;
    let depth = 0;
    let end = -1;
    for (let i = start; i < Math.min(html.length, start + 800_000); i += 1) {
      const ch = html[i];
      if (ch === '[') depth += 1;
      else if (ch === ']') {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end < 0) continue;
    const arr = tryParseJson<unknown[]>(html.slice(start, end + 1));
    if (!Array.isArray(arr) || arr.length === 0) continue;
    const asEvents = arr.filter((row): row is WixHydratedEvent => {
      if (!row || typeof row !== 'object') return false;
      const rec = row as WixHydratedEvent;
      return Boolean(rec.title && (rec.scheduling || rec.location || rec.slug));
    });
    if (asEvents.length === 0) continue;
    for (const ev of asEvents) found.push(ev);
    if (found.length >= 200) break;
  }
  return found;
}

function isoToDateParts(iso: string | null | undefined): {
  date: string | null;
  dateTime: string | null;
} {
  if (!iso?.trim()) return { date: null, dateTime: null };
  const value = iso.trim();
  const m = value.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?/i);
  if (!m) return { date: null, dateTime: null };
  const date = m[1]!;
  // Preserve the published ISO instant when a clock is present — do not invent local clocks.
  if (m[2]) return { date, dateTime: value };
  return { date, dateTime: null };
}

/** Prefer publisher wall-date text over UTC YMD from an instant (avoids CT→UTC day shift). */
function formattedLocalDate(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const parsed = Date.parse(value.trim());
  if (Number.isNaN(parsed)) return null;
  const d = new Date(parsed);
  // Interpret as a calendar label in local UTC components of the parsed absolute time
  // only when the string is already date-like without zone; prefer explicit YMD match.
  const ymd = value.trim().match(/([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/);
  if (ymd) {
    const monthName = ymd[1]!.toLowerCase();
    const months: Record<string, string> = {
      january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
      july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
    };
    const mm = months[monthName];
    if (!mm) return null;
    return `${ymd[3]}-${mm}-${String(ymd[2]).padStart(2, '0')}`;
  }
  void d;
  return null;
}

function extractFromWixHydration(html: string, pageUrl: string): ExtractedEventListing[] {
  const hydrated = extractWixEventsHydration(html);
  const origin = (() => {
    try {
      return new URL(pageUrl).origin;
    } catch {
      return '';
    }
  })();
  return hydrated.map((ev) => {
    const startIso = ev.scheduling?.config?.startDate ?? null;
    const endIso = ev.scheduling?.config?.endDate ?? null;
    const start = isoToDateParts(startIso);
    const end = isoToDateParts(endIso);
    const localStart = formattedLocalDate(ev.scheduling?.startDateFormatted ?? null);
    const localEnd = formattedLocalDate(ev.scheduling?.endDateFormatted ?? null);
    const slug = ev.slug?.trim() || null;
    const eventUrl =
      slug && origin ? `${origin}/event-details-registration/${slug}` : null;
    const recurrenceStatus = ev.scheduling?.config?.recurrences?.status;
    const isRecurring = typeof recurrenceStatus === 'number' && recurrenceStatus > 0;
    const row: ExtractedEventListing = {
      externalId: ev.id ?? null,
      title: String(ev.title ?? '').trim(),
      startDate: localStart ?? start.date,
      startDateTime: start.dateTime,
      endDate: localEnd ?? end.date,
      endDateTime: end.dateTime,
      venue: ev.location?.name?.trim() || null,
      address:
        ev.location?.fullAddress?.formattedAddress?.trim() ||
        ev.location?.address?.trim() ||
        null,
      city: ev.location?.fullAddress?.city?.trim() || null,
      regionState: ev.location?.fullAddress?.subdivision?.trim() || null,
      priceText: null,
      isFree: null,
      eventUrl,
      ticketOrRsvpUrl: eventUrl,
      organizer: null,
      isRecurring,
      imageUrl: ev.mainImage?.url ?? null,
      sourceUrl: pageUrl,
      evidence: [
        'wix_events_hydration',
        ev.id ? `wix_event_id:${ev.id}` : 'wix_event_id:missing',
        start.date ? `start:${start.date}` : 'start:unresolved',
        isRecurring ? 'recurring:true' : 'recurring:false',
      ],
      method: 'wix_events_hydration',
      verificationState: 'partial',
    };
    row.verificationState = verificationFor(row);
    return row;
  }).filter((ev) => ev.title.length > 0);
}

function extractFromSemanticHtml(html: string, pageUrl: string): ExtractedEventListing[] {
  const events: ExtractedEventListing[] = [];
  // Wix Events viewer cards (SSR).
  const cardRe =
    /data-hook=["']title["'][^>]*href=["']([^"']+)["'][^>]*>([^<]+)<\/a>[\s\S]*?data-hook=["']short-date["'][^>]*>([^<]+)<[\s\S]*?data-hook=["']short-location["'][^>]*>([^<]+)</gi;
  let match: RegExpExecArray | null;
  while ((match = cardRe.exec(html)) !== null) {
    const eventUrl = absoluteUrl(match[1], pageUrl);
    const title = decodeHtmlEntities(match[2]!.trim());
    const shortDate = decodeHtmlEntities(match[3]!.trim());
    const venue = decodeHtmlEntities(match[4]!.trim());
    if (!title) continue;
    const row: ExtractedEventListing = {
      externalId: null,
      title,
      startDate: null,
      startDateTime: null,
      endDate: null,
      endDateTime: null,
      venue: venue || null,
      address: null,
      city: null,
      regionState: null,
      priceText: null,
      isFree: null,
      eventUrl,
      ticketOrRsvpUrl: eventUrl,
      organizer: null,
      isRecurring: /multiple dates/i.test(html.slice(Math.max(0, match.index - 200), match.index)),
      imageUrl: null,
      sourceUrl: pageUrl,
      evidence: ['semantic_html_wix_card', `short_date:${shortDate}`, venue ? `venue:${venue}` : 'venue:missing'],
      method: 'semantic_html_blocks',
      verificationState: 'unresolved_date',
    };
    // Prefer ISO dates from slug when present: ...-2026-09-11-01-00
    const slugDate = eventUrl?.match(/(\d{4})-(\d{2})-(\d{2})(?:-(\d{2})-(\d{2}))?/);
    if (slugDate) {
      row.startDate = `${slugDate[1]}-${slugDate[2]}-${slugDate[3]}`;
      row.evidence.push(`slug_date:${row.startDate}`);
    }
    row.verificationState = verificationFor(row);
    events.push(row);
  }
  return events;
}

/**
 * Extract event listings from HTML. Static strategies only — Playwright is opt-in
 * via `playwrightHtml` when the caller already rendered the page.
 */
export function extractEventListingsFromHtml(input: {
  html: string;
  pageUrl: string;
  playwrightHtml?: string | null;
}): EventListingExtractResult {
  const retrievedAt = new Date().toISOString();
  const strategiesAttempted: EventListingExtractionMethod[] = [];
  const rejectionReasons: string[] = [];
  const capability = detectEventListingCapability(input.html, input.pageUrl);

  strategiesAttempted.push('json_ld');
  let events = extractFromJsonLd(input.html, input.pageUrl);
  let method: EventListingExtractionMethod = events.length > 0 ? 'json_ld' : 'none';
  if (events.length === 0) rejectionReasons.push('json_ld:zero_events');

  if (events.length === 0) {
    strategiesAttempted.push('wix_events_hydration');
    events = extractFromWixHydration(input.html, input.pageUrl);
    if (events.length > 0) method = 'wix_events_hydration';
    else rejectionReasons.push('wix_events_hydration:zero_or_unparseable');
  }

  if (events.length === 0) {
    strategiesAttempted.push('semantic_html_blocks');
    events = extractFromSemanticHtml(input.html, input.pageUrl);
    if (events.length > 0) method = 'semantic_html_blocks';
    else rejectionReasons.push('semantic_html_blocks:zero_cards');
  }

  if (events.length === 0 && input.playwrightHtml?.trim()) {
    strategiesAttempted.push('playwright_dom');
    const rendered = extractEventListingsFromHtml({
      html: input.playwrightHtml,
      pageUrl: input.pageUrl,
    });
    events = rendered.events.map((ev) => ({ ...ev, method: 'playwright_dom' as const }));
    if (events.length > 0) method = 'playwright_dom';
    else rejectionReasons.push('playwright_dom:zero_events');
  }

  const deduped = dedupeEvents(events.filter((ev) => ev.title.trim().length > 0));
  if (deduped.length === 0 && capability.looksLikeEventListing) {
    rejectionReasons.push('capability_positive_but_no_verified_listings');
  }
  if (deduped.length === 0 && !capability.looksLikeEventListing) {
    rejectionReasons.push('page_not_classified_as_event_listing');
  }

  return {
    events: deduped,
    method: deduped.length > 0 ? method : 'none',
    strategiesAttempted,
    rejectionReasons,
    capability,
    retrievedAt,
  };
}

export function stableEventListingFingerprint(ev: ExtractedEventListing): string {
  return fingerprintParts({
    eventUrl: ev.eventUrl,
    externalId: ev.externalId,
    title: ev.title,
    startDate: ev.startDate,
    venue: ev.venue,
  });
}
