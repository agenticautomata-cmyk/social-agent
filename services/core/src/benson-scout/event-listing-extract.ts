/**
 * Generic public event-listing extraction for Watchlist web sources.
 *
 * Ordered strategies (no LLM as factual source):
 * 1. Official WordPress / TEC REST (when body supplied)
 * 2. Event JSON-LD / schema.org
 * 3. Direct calendar ICS links on the page
 * 4. Per-event ICS hints (URLs recorded; bodies when supplied)
 * 5. WordPress / TEC list-view HTML (not month-grid cells)
 * 6. Squarespace Events collection metadata / eventlist HTML
 * 7. Theater season / production-performance sections
 * 8. Semantic HTML event blocks / repeated title+date+venue+link groups
 * 9. Wix Events / events-viewer hydration when safely parseable
 * 10. Playwright-rendered DOM only when caller opts in after static miss
 */

import { parseJsonLdPageGraph } from '../ask-benson/jsonld-events.js';
import { icsOccurrenceKey, parseIcsCalendar, type IcsEvent } from './ics-parse.js';
import {
  extractTheaterSeasonListings,
  looksLikeTheaterSeasonPage,
  THEATER_SEASON_TIME_ZONE,
} from './theater-season-extract.js';
import {
  extractFromTribeEventsListHtml,
  extractFromTribeEventsRest,
  htmlHasTribeEventsListMarkup,
  htmlHasTribeEventsMonthGrid,
  htmlHasWordpressTecSignals,
  parseTribeEventsRestJson,
  type TribeEventsRestEvent,
  type TribeEventsRestPayload,
} from './wordpress-tec-extract.js';

export type EventListingExtractionMethod =
  | 'json_ld'
  | 'direct_ics'
  | 'per_event_ics'
  | 'wordpress_tec_rest'
  | 'wordpress_tec_list'
  | 'squarespace_events'
  | 'theater_season'
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
  /** When HTML local and ICS/UTC disagree on calendar date — keep both, mark review. */
  needsTemporalReview?: boolean;
  icsUrl?: string | null;
  platform?: string | null;
  /** Theater-season hierarchy — shared production identity for UI grouping. */
  productionTitle?: string | null;
  productionId?: string | null;
  productionGroupKey?: string | null;
  listingRole?: 'production' | 'performance' | null;
  /** Alias used by some adapters; prefer listingRole. */
  itemKind?: 'production' | 'performance' | 'event' | null;
  performanceLabel?: string | null;
  runStartDate?: string | null;
  runEndDate?: string | null;
};

export type EventListingExtractResult = {
  events: ExtractedEventListing[];
  method: EventListingExtractionMethod;
  strategiesAttempted: EventListingExtractionMethod[];
  rejectionReasons: string[];
  capability: EventListingCapability;
  retrievedAt: string;
  platformSupport: PlatformSupportRow[];
};

export type EventListingCapability = {
  looksLikeEventListing: boolean;
  hasJsonLdEvents: boolean;
  hasWixEventsSignals: boolean;
  hasRepeatedEventBlocks: boolean;
  isWixSite: boolean;
  isSquarespaceSite: boolean;
  hasSquarespaceEventsSignals: boolean;
  hasTheaterSeasonSignals: boolean;
  hasIcsLinks: boolean;
  hasGoogleCalendarLinks: boolean;
  hasWordpressEventMarkup: boolean;
  hasWordpressTecSignals: boolean;
  hasTribeEventsListMarkup: boolean;
  hasTribeEventsMonthGrid: boolean;
  hasIframeCalendarEmbed: boolean;
  needsAdapter: boolean;
  siteTimeZone: string | null;
  reasons: string[];
};

export type PlatformSupportRow = {
  platform: string;
  detectable: boolean;
  extractable: boolean;
  status: 'supported' | 'partial' | 'needs_adapter' | 'absent';
  notes: string;
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

const SQUARESPACE_SITE_MARKERS = [
  /squarespace\.com/i,
  /Static\.SQUARESPACE_CONTEXT/i,
  /squarespace-cdn\.com/i,
  /generator["']\s+content=["']Squarespace/i,
];

const SQUARESPACE_EVENTS_MARKERS = [
  /collection-type-events/i,
  /eventlist-event/i,
  /sqs-events-collection/i,
  /squarespace-events-collection/i,
  /eventlist\s+eventlist--upcoming/i,
];

const WP_EVENT_MARKERS = [
  /tribe-events/i,
  /tribe_events/i,
  /eo-events/i,
  /eventon_/i,
  /class=["'][^"']*type-tribe_events/i,
  /tec-api-version/i,
  /tec-api-origin/i,
  /the-events-calendar/i,
  /wp-json\/tribe\/events\/v1/i,
];

const EVENT_PATH_RE =
  /(?:^|\/)(?:events?|live-music(?:-events)?|concerts?|shows?|calendar|upcoming|whats-?on|what-s-on|current-season|past-seasons|now-playing|season(?:-tickets)?)(?:\/|$)/i;

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

function extractSquarespaceTimeZone(html: string): string | null {
  const m = html.match(/"timeZone"\s*:\s*"([^"]+)"/);
  if (m?.[1]) return m[1];
  const abbr = html.match(/"i18nContext"\s*:\s*\{[^}]*"timeZoneData"\s*:\s*\{[^}]*"id"\s*:\s*"([^"]+)"/);
  return abbr?.[1] ?? null;
}

export function detectEventListingCapability(html: string, pageUrl?: string): EventListingCapability {
  const reasons: string[] = [];
  const isWixSite = WIX_SITE_MARKERS.some((re) => re.test(html));
  const hasWixEventsSignals = WIX_EVENTS_MARKERS.some((re) => re.test(html));
  const isSquarespaceSite = SQUARESPACE_SITE_MARKERS.some((re) => re.test(html));
  const hasSquarespaceEventsSignals = SQUARESPACE_EVENTS_MARKERS.some((re) => re.test(html));
  const jsonLd = parseJsonLdPageGraph(html);
  const hasJsonLdEvents = jsonLd.events.length > 0;
  const hasRepeatedEventBlocks =
    ((html.match(/data-hook=["']title["']/gi)?.length ?? 0) >= 2 &&
      (html.match(/data-hook=["']short-date["']/gi)?.length ?? 0) >= 2) ||
    (html.match(/eventlist-event/gi)?.length ?? 0) >= 2;
  const hasIcsLinks =
    /\.ics(?:["'?]|$)/i.test(html) ||
    /format=ical/i.test(html) ||
    /text\/calendar/i.test(html) ||
    /rel=["']alternate["'][^>]+ical/i.test(html);
  const hasGoogleCalendarLinks = /google\.com\/calendar/i.test(html);
  const hasWordpressEventMarkup = WP_EVENT_MARKERS.some((re) => re.test(html));
  const hasWordpressTecSignals = htmlHasWordpressTecSignals(html) || hasWordpressEventMarkup;
  const hasTribeEventsListMarkup = htmlHasTribeEventsListMarkup(html);
  const hasTribeEventsMonthGrid = htmlHasTribeEventsMonthGrid(html);
  const hasIframeCalendarEmbed =
    /<iframe[^>]+(calendar|eventbrite|google\.com\/calendar|localist|libcal)/i.test(html);
  // Prefer TEC capability over generic theater-season heuristics on TEC pages.
  const hasTheaterSeasonSignals =
    !hasWordpressTecSignals && looksLikeTheaterSeasonPage(html, pageUrl);
  const siteTimeZone =
    extractSquarespaceTimeZone(html) ??
    (hasTheaterSeasonSignals ? THEATER_SEASON_TIME_ZONE : null);

  if (pageUrl && urlLooksLikeEventListing(pageUrl)) reasons.push('url_path_eventish');
  if (hasJsonLdEvents) reasons.push(`json_ld_events:${jsonLd.events.length}`);
  if (hasWixEventsSignals) reasons.push('wix_events_markers');
  if (hasRepeatedEventBlocks) reasons.push('repeated_event_cards');
  if (isWixSite && !hasWixEventsSignals && !hasJsonLdEvents) {
    reasons.push('wix_site_without_events_widget');
  }
  if (isSquarespaceSite) reasons.push('squarespace_site');
  if (hasSquarespaceEventsSignals) reasons.push('squarespace_events_collection');
  if (isSquarespaceSite && !hasSquarespaceEventsSignals && !hasJsonLdEvents && !hasIcsLinks) {
    reasons.push('squarespace_site_without_events_collection');
  }
  if (hasTheaterSeasonSignals) reasons.push('theater_season_production_sections');
  if (hasIcsLinks) reasons.push('ics_links');
  if (hasGoogleCalendarLinks) reasons.push('google_calendar_links');
  if (hasWordpressEventMarkup) reasons.push('wordpress_event_markup');
  if (hasWordpressTecSignals) reasons.push('wordpress_tec_signals');
  if (hasTribeEventsListMarkup) reasons.push('tribe_events_list_markup');
  if (hasTribeEventsMonthGrid) reasons.push('tribe_events_month_grid');
  if (hasIframeCalendarEmbed) reasons.push('iframe_calendar_embed');
  if (siteTimeZone) reasons.push(`site_tz:${siteTimeZone}`);

  const looksLikeEventListing =
    hasJsonLdEvents ||
    hasWixEventsSignals ||
    hasSquarespaceEventsSignals ||
    hasTheaterSeasonSignals ||
    hasWordpressEventMarkup ||
    hasWordpressTecSignals ||
    hasIcsLinks ||
    hasRepeatedEventBlocks ||
    Boolean(pageUrl && urlLooksLikeEventListing(pageUrl));

  // Recognizable calendar surface we do not fully extract yet.
  const needsAdapter =
    looksLikeEventListing === false &&
    (hasIframeCalendarEmbed ||
      (isSquarespaceSite && !hasSquarespaceEventsSignals && Boolean(pageUrl && urlLooksLikeEventListing(pageUrl))));

  if (needsAdapter) reasons.push('needs_adapter');

  return {
    looksLikeEventListing: looksLikeEventListing || needsAdapter,
    hasJsonLdEvents,
    hasWixEventsSignals,
    hasRepeatedEventBlocks,
    isWixSite,
    isSquarespaceSite,
    hasSquarespaceEventsSignals,
    hasTheaterSeasonSignals,
    hasIcsLinks,
    hasGoogleCalendarLinks,
    hasWordpressEventMarkup,
    hasWordpressTecSignals,
    hasTribeEventsListMarkup,
    hasTribeEventsMonthGrid,
    hasIframeCalendarEmbed,
    needsAdapter,
    siteTimeZone,
    reasons,
  };
}

export function buildPlatformSupportMatrix(capability: EventListingCapability): PlatformSupportRow[] {
  return [
    {
      platform: 'json_ld',
      detectable: true,
      extractable: capability.hasJsonLdEvents,
      status: capability.hasJsonLdEvents ? 'supported' : 'absent',
      notes: 'schema.org Event graph when present',
    },
    {
      platform: 'ics',
      detectable: capability.hasIcsLinks,
      extractable: capability.hasIcsLinks,
      status: capability.hasIcsLinks ? 'supported' : 'absent',
      notes: 'Direct feed or per-event ?format=ical / .ics',
    },
    {
      platform: 'google_calendar',
      detectable: capability.hasGoogleCalendarLinks,
      extractable: capability.hasGoogleCalendarLinks,
      status: capability.hasGoogleCalendarLinks ? 'partial' : 'absent',
      notes: 'TEMPLATE links used as evidence; local HTML preferred over UTC dates',
    },
    {
      platform: 'squarespace_events',
      detectable: capability.isSquarespaceSite || capability.hasSquarespaceEventsSignals,
      extractable: capability.hasSquarespaceEventsSignals,
      status: capability.hasSquarespaceEventsSignals
        ? 'supported'
        : capability.isSquarespaceSite
          ? 'absent'
          : 'absent',
      notes: capability.isSquarespaceSite && !capability.hasSquarespaceEventsSignals
        ? 'Squarespace site without events collection — not misclassified as events'
        : 'eventlist upcoming articles + local times',
    },
    {
      platform: 'wix_events',
      detectable: capability.isWixSite || capability.hasWixEventsSignals,
      extractable: capability.hasWixEventsSignals,
      status: capability.hasWixEventsSignals
        ? 'supported'
        : capability.isWixSite
          ? 'absent'
          : 'absent',
      notes: 'events-viewer hydration + SSR cards',
    },
    {
      platform: 'theater_season',
      detectable: capability.hasTheaterSeasonSignals,
      extractable: capability.hasTheaterSeasonSignals,
      status: capability.hasTheaterSeasonSignals ? 'supported' : 'absent',
      notes:
        'Production sections with dated performances; group by production, identity ignores shared ticket URL alone',
    },
    {
      platform: 'eventbrite',
      detectable: false,
      extractable: false,
      status: 'absent',
      notes: 'Handled by dedicated Eventbrite directory adapter',
    },
    {
      platform: 'wordpress_tec',
      detectable: capability.hasWordpressTecSignals || capability.hasWordpressEventMarkup,
      extractable:
        capability.hasTribeEventsListMarkup ||
        capability.hasJsonLdEvents ||
        capability.hasIcsLinks ||
        capability.hasWordpressTecSignals,
      status:
        capability.hasTribeEventsListMarkup || capability.hasWordpressTecSignals
          ? 'supported'
          : capability.hasWordpressEventMarkup
            ? 'partial'
            : 'absent',
      notes:
        'The Events Calendar REST + list HTML + JSON-LD/ICS; month-grid cells are never expanded',
    },
    {
      platform: 'iframe_embed',
      detectable: capability.hasIframeCalendarEmbed,
      extractable: false,
      status: capability.hasIframeCalendarEmbed ? 'needs_adapter' : 'absent',
      notes: 'Calendar iframe embeds need source-specific follow-up',
    },
    {
      platform: 'unsupported_custom',
      detectable: capability.needsAdapter,
      extractable: false,
      status: capability.needsAdapter ? 'needs_adapter' : 'absent',
      notes: 'Honest degraded / needs_adapter when recognizable but unparsed',
    },
  ];
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#x2F;/gi, '/')
    .replace(/&nbsp;/gi, ' ');
}

function absoluteUrl(href: string | null | undefined, pageUrl: string): string | null {
  if (!href?.trim()) return null;
  try {
    return new URL(href.trim(), pageUrl).href;
  } catch {
    return null;
  }
}

function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function parseClockToHms(text: string): string | null {
  const m = text.match(/(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?/);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = m[2]!;
  const ap = (m[3] ?? '').toUpperCase();
  if (ap === 'PM' && hour < 12) hour += 12;
  if (ap === 'AM' && hour === 12) hour = 0;
  if (!ap && hour > 23) return null;
  return `${String(hour).padStart(2, '0')}:${minute}:00`;
}

function fingerprintParts(input: {
  eventUrl?: string | null;
  externalId?: string | null;
  title: string;
  startDate: string | null;
  startDateTime?: string | null;
  venue: string | null;
}): string {
  // Dedupe order: ICS UID+occurrence → platform ID → detail URL → title+local start+venue
  if (input.externalId?.trim()) return `id:${input.externalId.trim()}`;
  // Shared ticket-platform show URLs (e.g. onthestage) must not collapse distinct
  // performances — fall through to title+local start+venue when a local start exists.
  const url = input.eventUrl?.trim() ?? '';
  const sharedTicketPlatform =
    /onthestage\.tickets\/show\//i.test(url) ||
    /\/tickets(?:#|$|\?)/i.test(url);
  if (url && !(sharedTicketPlatform && (input.startDateTime || input.startDate))) {
    return `url:${url.toLowerCase()}`;
  }
  const start = input.startDateTime ?? input.startDate ?? '';
  return `tvv:${input.title.trim().toLowerCase()}|${start}|${(input.venue ?? '').toLowerCase()}`;
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
      startDateTime: ev.startDateTime,
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
      platform: 'json_ld',
    };
    row.verificationState = verificationFor(row);
    return row;
  });
}

function icsEventToListing(
  ev: IcsEvent,
  pageUrl: string,
  method: EventListingExtractionMethod,
): ExtractedEventListing | null {
  const title = (ev.summary ?? '').trim();
  if (!title) return null;
  const startDate = ev.dtstart?.date || null;
  const endDate = ev.dtend?.date || null;
  const startDateTime =
    ev.dtstart && !ev.dtstart.allDay && ev.dtstart.date && ev.dtstart.time
      ? `${ev.dtstart.date}T${ev.dtstart.time}${ev.dtstart.tzid === 'UTC' || ev.dtstart.utcIso?.endsWith('Z') ? 'Z' : ''}`
      : ev.dtstart?.utcIso ?? null;
  const endDateTime =
    ev.dtend && !ev.dtend.allDay && ev.dtend.date && ev.dtend.time
      ? `${ev.dtend.date}T${ev.dtend.time}${ev.dtend.tzid === 'UTC' || ev.dtend.utcIso?.endsWith('Z') ? 'Z' : ''}`
      : ev.dtend?.utcIso ?? null;
  const eventUrl = absoluteUrl(ev.url, pageUrl);
  const occ = icsOccurrenceKey(ev);
  const row: ExtractedEventListing = {
    externalId: occ,
    title,
    startDate,
    startDateTime,
    endDate,
    endDateTime,
    venue: ev.location?.trim() || null,
    address: null,
    city: null,
    regionState: null,
    priceText: null,
    isFree: null,
    eventUrl,
    ticketOrRsvpUrl: eventUrl,
    organizer: null,
    isRecurring: Boolean(ev.recurrenceId || ev.rawProps.RRULE),
    imageUrl: null,
    sourceUrl: pageUrl,
    evidence: [
      method,
      ev.uid ? `ics_uid:${ev.uid}` : 'ics_uid:missing',
      startDate ? `start:${startDate}` : 'start:unresolved',
      ev.dtstart?.allDay ? 'all_day:true' : 'all_day:false',
    ],
    method,
    verificationState: 'partial',
    platform: 'ics',
  };
  row.verificationState = verificationFor(row);
  return row;
}

/** Extract listings from ICS body text (direct feed or supplied per-event bodies). */
export function extractEventListingsFromIcs(input: {
  icsText: string;
  pageUrl: string;
  preferTimeZone?: string | null;
  method?: EventListingExtractionMethod;
}): ExtractedEventListing[] {
  const parsed = parseIcsCalendar(input.icsText, { preferTimeZone: input.preferTimeZone ?? null });
  const method = input.method ?? 'direct_ics';
  const out: ExtractedEventListing[] = [];
  for (const ev of parsed.events) {
    const row = icsEventToListing(ev, input.pageUrl, method);
    if (row) out.push(row);
  }
  return out;
}

export function findIcsUrlsInHtml(html: string, pageUrl: string): string[] {
  const found = new Set<string>();
  const hrefRe = /href=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = hrefRe.exec(html)) !== null) {
    const href = m[1]!;
    if (/\.ics(?:$|\?)/i.test(href) || /format=ical/i.test(href) || /text\/calendar/i.test(href)) {
      const abs = absoluteUrl(href, pageUrl);
      if (abs) found.add(abs);
    }
  }
  return [...found];
}

function parseGoogleCalendarDates(
  href: string,
  preferTimeZone?: string | null,
): { startDate: string | null; endDate: string | null; startUtc: string | null; endUtc: string | null } {
  try {
    const u = new URL(href, 'https://www.google.com');
    const dates = u.searchParams.get('dates') ?? '';
    const [startRaw, endRaw] = dates.split('/');
    const parse = (raw: string | undefined) => {
      if (!raw) return { date: null as string | null, utc: null as string | null };
      const m = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
      if (!m) {
        const d = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
        if (!d) return { date: null, utc: null };
        return { date: `${d[1]}-${d[2]}-${d[3]}`, utc: null };
      }
      const utc = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
      if (preferTimeZone) {
        const zoned = new Intl.DateTimeFormat('en-CA', {
          timeZone: preferTimeZone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date(utc));
        return { date: zoned, utc };
      }
      return { date: `${m[1]}-${m[2]}-${m[3]}`, utc };
    };
    const s = parse(startRaw);
    const e = parse(endRaw);
    return { startDate: s.date, endDate: e.date, startUtc: s.utc, endUtc: e.utc };
  } catch {
    return { startDate: null, endDate: null, startUtc: null, endUtc: null };
  }
}

/**
 * Squarespace Events collection — upcoming list only.
 * Prefer localized HTML dates/times over Google Calendar UTC to avoid CT→UTC day shifts.
 * Multi-day spans stay as one row (no day explosion).
 */
export function extractFromSquarespaceEvents(
  html: string,
  pageUrl: string,
  siteTimeZone?: string | null,
): ExtractedEventListing[] {
  const events: ExtractedEventListing[] = [];
  const upcomingSectionMatch = html.match(
    /<div[^>]*class="[^"]*eventlist\s+eventlist--upcoming[^"]*"[^>]*>([\s\S]*?)(?:<div[^>]*class="[^"]*eventlist\s+eventlist--past|<\/div>\s*<\/div>\s*<footer|$)/i,
  );
  const scope = upcomingSectionMatch?.[1] ?? html;
  // Only upcoming articles when the section exists; otherwise require upcoming class.
  const articleRe =
    /<article[^>]*class="([^"]*eventlist-event[^"]*)"[^>]*>([\s\S]*?)<\/article>/gi;
  let match: RegExpExecArray | null;
  while ((match = articleRe.exec(scope)) !== null) {
    const classNames = match[1] ?? '';
    const body = match[2] ?? '';
    if (/eventlist-event--past/i.test(classNames)) continue;
    if (upcomingSectionMatch && !/upcoming/i.test(classNames)) continue;

    const titleMatch =
      body.match(/eventlist-title-link[^>]*>([\s\S]*?)<\/a>/i) ||
      body.match(/<h1[^>]*class="[^"]*eventlist-title[^"]*"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i);
    const title = titleMatch ? stripTags(titleMatch[1]!) : '';
    if (!title) continue;

    const detailHref =
      body.match(/eventlist-title-link[^>]*href=["']([^"']+)["']/i)?.[1] ||
      body.match(/href=["'](\/events\/[^"'?]+)["']/i)?.[1] ||
      null;
    const eventUrl = absoluteUrl(detailHref, pageUrl);

    const dateTimes = [...body.matchAll(/<time[^>]*class="([^"]*)"[^>]*datetime=["']([^"']+)["'][^>]*>([\s\S]*?)<\/time>/gi)];
    let startDate: string | null = null;
    let endDate: string | null = null;
    let startTime: string | null = null;
    let endTime: string | null = null;
    for (const dt of dateTimes) {
      const cls = dt[1] ?? '';
      const datetime = dt[2] ?? '';
      const text = stripTags(dt[3] ?? '');
      const ymd = datetime.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
      if (/event-date/i.test(cls) && ymd) {
        if (!startDate) startDate = ymd;
        else endDate = ymd;
      }
      if (/event-time/i.test(cls)) {
        const clock = parseClockToHms(text);
        if (clock) {
          if (!startTime) startTime = clock;
          else endTime = clock;
        }
      }
    }

    // Some Squarespace layouts put start/end clocks in adjacent meta without class split.
    if (startDate && !startTime) {
      const metaDate = body.match(/eventlist-meta-date[\s\S]*?<\/li>/i)?.[0] ?? '';
      const clocks = [...metaDate.matchAll(/(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm))/g)].map((c) =>
        parseClockToHms(c[1]!),
      );
      if (clocks[0]) startTime = clocks[0];
      if (clocks[1]) endTime = clocks[1];
    }

    const icsHref =
      body.match(/href=["']([^"']*format=ical[^"']*)["']/i)?.[1] ||
      body.match(/href=["']([^"']+\.ics[^"']*)["']/i)?.[1] ||
      null;
    const icsUrl = absoluteUrl(icsHref, pageUrl);
    const gcalHref = body.match(/href=["'](https?:\/\/(?:www\.)?google\.com\/calendar\/[^"']+)["']/i)?.[1] ?? null;

    let needsTemporalReview = false;
    if (gcalHref && startDate) {
      const gcal = parseGoogleCalendarDates(gcalHref, siteTimeZone ?? 'America/Chicago');
      if (gcal.startDate && gcal.startDate !== startDate) {
        needsTemporalReview = true;
      }
    }

    const venueMatch =
      body.match(/eventlist-meta-address[\s\S]*?<\/li>/i) ||
      body.match(/event-address[^>]*>([\s\S]*?)<\//i) ||
      body.match(/eventlist-meta-item[^>]*location[\s\S]*?<\/li>/i);
    const venue = venueMatch ? stripTags(venueMatch[0]!).replace(/^location\s*/i, '') || null : null;

    const isMultiday = /eventlist-event--multiday/i.test(classNames) || Boolean(endDate && endDate !== startDate);
    const startDateTime = startDate && startTime ? `${startDate}T${startTime}` : null;
    const endDateTime = (endDate ?? startDate) && endTime ? `${endDate ?? startDate}T${endTime}` : null;

    const row: ExtractedEventListing = {
      externalId: null,
      title,
      startDate,
      startDateTime,
      endDate: endDate ?? (isMultiday ? endDate : null),
      endDateTime,
      venue,
      address: null,
      city: null,
      regionState: null,
      priceText: null,
      isFree: null,
      eventUrl,
      ticketOrRsvpUrl: eventUrl,
      organizer: null,
      isRecurring: false,
      imageUrl: null,
      sourceUrl: pageUrl,
      evidence: [
        'squarespace_events',
        startDate ? `start:${startDate}` : 'start:unresolved',
        startTime ? `start_time:${startTime}` : 'start_time:missing',
        endDate ? `end:${endDate}` : 'end:same_or_missing',
        icsUrl ? `ics_url:${icsUrl}` : 'ics_url:missing',
        gcalHref ? 'gcal_link:present' : 'gcal_link:missing',
        needsTemporalReview ? 'temporal_conflict_review:html_preferred_over_gcal_utc' : 'temporal_ok',
        isMultiday ? 'multiday_span:single_row' : 'multiday_span:false',
      ],
      method: 'squarespace_events',
      verificationState: 'partial',
      needsTemporalReview,
      icsUrl,
      platform: 'squarespace_events',
    };
    row.verificationState = verificationFor(row);
    events.push(row);
  }
  return events;
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
  const m = value.match(
    /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?/i,
  );
  if (!m) return { date: null, dateTime: null };
  const date = m[1]!;
  if (m[2]) return { date, dateTime: value };
  return { date, dateTime: null };
}

/** Prefer publisher wall-date text over UTC YMD from an instant (avoids CT→UTC day shift). */
function formattedLocalDate(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const ymd = value.trim().match(/([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/);
  if (ymd) {
    const monthName = ymd[1]!.toLowerCase();
    const months: Record<string, string> = {
      january: '01',
      february: '02',
      march: '03',
      april: '04',
      may: '05',
      june: '06',
      july: '07',
      august: '08',
      september: '09',
      october: '10',
      november: '11',
      december: '12',
    };
    const mm = months[monthName];
    if (!mm) return null;
    return `${ymd[3]}-${mm}-${String(ymd[2]).padStart(2, '0')}`;
  }
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
  return hydrated
    .map((ev) => {
      const startIso = ev.scheduling?.config?.startDate ?? null;
      const endIso = ev.scheduling?.config?.endDate ?? null;
      const start = isoToDateParts(startIso);
      const end = isoToDateParts(endIso);
      const localStart = formattedLocalDate(ev.scheduling?.startDateFormatted ?? null);
      const localEnd = formattedLocalDate(ev.scheduling?.endDateFormatted ?? null);
      const slug = ev.slug?.trim() || null;
      const eventUrl = slug && origin ? `${origin}/event-details-registration/${slug}` : null;
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
        platform: 'wix_events',
      };
      row.verificationState = verificationFor(row);
      return row;
    })
    .filter((ev) => ev.title.length > 0);
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
      evidence: [
        'semantic_html_wix_card',
        `short_date:${shortDate}`,
        venue ? `venue:${venue}` : 'venue:missing',
      ],
      method: 'semantic_html_blocks',
      verificationState: 'unresolved_date',
      platform: 'semantic_html',
    };
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

function extractFromTheaterSeason(
  html: string,
  pageUrl: string,
  now?: Date,
): ExtractedEventListing[] {
  const extracted = extractTheaterSeasonListings({ html, pageUrl, now });
  return extracted.performances.map((perf) => {
    const row: ExtractedEventListing = {
      externalId: perf.externalId,
      title: perf.title,
      startDate: perf.startDate,
      startDateTime: perf.startDateTime,
      endDate: perf.endDate,
      endDateTime: perf.endDateTime,
      venue: perf.venue,
      address: null,
      city: null,
      regionState: null,
      priceText: null,
      isFree: null,
      eventUrl: perf.eventUrl,
      ticketOrRsvpUrl: perf.ticketOrRsvpUrl,
      organizer: null,
      isRecurring: true,
      imageUrl: null,
      sourceUrl: pageUrl,
      evidence: [...perf.evidence, ...extracted.evidence.filter((e) => e.startsWith('tz:'))],
      method: 'theater_season',
      verificationState: 'verified',
      platform: 'theater_season',
      productionTitle: perf.productionTitle,
      productionId: perf.productionId,
      productionGroupKey: perf.productionGroupKey,
      listingRole: perf.listingRole,
      performanceLabel: perf.performanceLabel,
      runStartDate: perf.runStartDate,
      runEndDate: perf.runEndDate,
    };
    row.verificationState = verificationFor(row);
    return row;
  });
}

/**
 * Extract event listings from HTML. Static strategies only — Playwright is opt-in
 * via `playwrightHtml` when the caller already rendered the page.
 * Optional `icsBodies` supplies already-fetched ICS documents (direct or per-event).
 * Optional `tecRestPayload` supplies official tribe/events/v1 JSON (preferred for WP/TEC).
 */
export function extractEventListingsFromHtml(input: {
  html: string;
  pageUrl: string;
  playwrightHtml?: string | null;
  icsBodies?: Array<{ url: string; text: string }> | null;
  tecRestPayload?: TribeEventsRestPayload | TribeEventsRestEvent[] | string | null;
  now?: Date;
}): EventListingExtractResult {
  const retrievedAt = new Date().toISOString();
  const strategiesAttempted: EventListingExtractionMethod[] = [];
  const rejectionReasons: string[] = [];
  const capability = detectEventListingCapability(input.html, input.pageUrl);
  const platformSupport = buildPlatformSupportMatrix(capability);
  const preferTz = capability.siteTimeZone;

  let events: ExtractedEventListing[] = [];
  let method: EventListingExtractionMethod = 'none';

  // 1. Official TEC REST when caller supplied the public plugin payload.
  const restPayload =
    typeof input.tecRestPayload === 'string'
      ? parseTribeEventsRestJson(input.tecRestPayload)
      : input.tecRestPayload ?? null;
  if (restPayload) {
    strategiesAttempted.push('wordpress_tec_rest');
    events = extractFromTribeEventsRest(restPayload, input.pageUrl);
    if (events.length > 0) method = 'wordpress_tec_rest';
    else rejectionReasons.push('wordpress_tec_rest:zero_or_unparseable');
  }

  if (events.length === 0) {
    strategiesAttempted.push('json_ld');
    events = extractFromJsonLd(input.html, input.pageUrl);
    if (events.length > 0) method = 'json_ld';
    else rejectionReasons.push('json_ld:zero_events');
  }

  const feedIcsBodies =
    input.icsBodies?.filter((b) => {
      try {
        const u = new URL(b.url);
        const path = u.pathname;
        const isIcalQuery = /[?&]ical=1\b/i.test(u.search) || /[?&]outlook-ical=1\b/i.test(u.search);
        const isIcsFile = /\.ics$/i.test(path);
        // Collection feeds: root/archive ?ical=1 or .ics — not single-event detail paths.
        const isEventDetail = /\/event\/[^/]+/i.test(path) || /\/events\/[^/]+\/[^/]+/i.test(path);
        return (isIcalQuery || isIcsFile) && !isEventDetail;
      } catch {
        return (
          (/[?&]ical=1\b/i.test(b.url) || /\.ics(?:$|\?)/i.test(b.url)) && !/format=ical/i.test(b.url)
        );
      }
    }) ?? [];
  const perEventIcsBodies =
    input.icsBodies?.filter((b) => !feedIcsBodies.some((f) => f.url === b.url)) ?? [];

  // Direct collection/feed ICS only — not per-event ?format=ical (those enrich later).
  if (events.length === 0 && feedIcsBodies.length > 0) {
    strategiesAttempted.push('direct_ics');
    const fromIcs: ExtractedEventListing[] = [];
    for (const body of feedIcsBodies) {
      fromIcs.push(
        ...extractEventListingsFromIcs({
          icsText: body.text,
          pageUrl: input.pageUrl,
          preferTimeZone: preferTz,
          method: 'direct_ics',
        }).map((ev) => ({
          ...ev,
          icsUrl: body.url,
          evidence: [...ev.evidence, `ics_fetched:${body.url}`],
        })),
      );
    }
    events = fromIcs;
    if (events.length > 0) method = 'direct_ics';
    else rejectionReasons.push('direct_ics:zero_or_unparseable');
  } else if (events.length === 0 && capability.hasIcsLinks && feedIcsBodies.length === 0) {
    strategiesAttempted.push('direct_ics');
    rejectionReasons.push('direct_ics:links_present_bodies_not_supplied');
  }

  // TEC list-view HTML (never month-grid cells).
  if (
    events.length === 0 &&
    (capability.hasTribeEventsListMarkup || capability.hasWordpressTecSignals)
  ) {
    strategiesAttempted.push('wordpress_tec_list');
    events = extractFromTribeEventsListHtml(input.html, input.pageUrl);
    if (events.length > 0) method = 'wordpress_tec_list';
    else if (capability.hasTribeEventsMonthGrid && !capability.hasTribeEventsListMarkup) {
      rejectionReasons.push('wordpress_tec_list:month_grid_refused_no_day_expansion');
    } else {
      rejectionReasons.push('wordpress_tec_list:zero_cards');
    }
  }

  if (events.length === 0 && capability.hasSquarespaceEventsSignals) {
    strategiesAttempted.push('squarespace_events');
    events = extractFromSquarespaceEvents(input.html, input.pageUrl, preferTz);
    if (events.length > 0) method = 'squarespace_events';
    else rejectionReasons.push('squarespace_events:zero_cards');
  }

  // Per-event ICS as primary only when HTML/Squarespace/JSON-LD produced nothing.
  if (events.length === 0 && perEventIcsBodies.length > 0) {
    strategiesAttempted.push('per_event_ics');
    const fromIcs: ExtractedEventListing[] = [];
    for (const body of perEventIcsBodies) {
      fromIcs.push(
        ...extractEventListingsFromIcs({
          icsText: body.text,
          pageUrl: input.pageUrl,
          preferTimeZone: preferTz,
          method: 'per_event_ics',
        }).map((ev) => ({
          ...ev,
          icsUrl: body.url,
          evidence: [...ev.evidence, `ics_fetched:${body.url}`],
        })),
      );
    }
    events = fromIcs;
    if (events.length > 0) method = 'per_event_ics';
    else rejectionReasons.push('per_event_ics:zero_or_unparseable');
  }

  if (events.length === 0 && capability.hasTheaterSeasonSignals) {
    strategiesAttempted.push('theater_season');
    events = extractFromTheaterSeason(input.html, input.pageUrl, input.now);
    if (events.length > 0) method = 'theater_season';
    else rejectionReasons.push('theater_season:zero_upcoming_performances');
  }

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

  // Enrich rows with UID / conflict flags from per-event ICS bodies when provided.
  if (events.length > 0 && perEventIcsBodies.length > 0) {
    const byUrl = new Map(
      perEventIcsBodies.map((b) => {
        const parsed = parseIcsCalendar(b.text, { preferTimeZone: preferTz });
        return [b.url.replace(/\/$/, ''), parsed.events[0] ?? null] as const;
      }),
    );
    for (const ev of events) {
      if (!ev.icsUrl) continue;
      const icsEv = byUrl.get(ev.icsUrl.replace(/\/$/, ''));
      if (!icsEv?.uid) continue;
      const occ = icsOccurrenceKey(icsEv);
      if (occ) {
        ev.externalId = occ;
        ev.evidence.push(`ics_uid_enriched:${icsEv.uid}`);
      }
      // Prefer HTML local date; if ICS zoned date conflicts, mark review and keep HTML.
      if (icsEv.dtstart?.date && ev.startDate && icsEv.dtstart.date !== ev.startDate) {
        ev.needsTemporalReview = true;
        ev.evidence.push(
          `temporal_conflict:html=${ev.startDate};ics_zoned=${icsEv.dtstart.date};preference=html_local`,
        );
      }
    }
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
  if (deduped.length === 0 && capability.needsAdapter) {
    rejectionReasons.push('needs_adapter:recognizable_calendar_without_extractor');
  }
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
    platformSupport,
  };
}

export function stableEventListingFingerprint(ev: ExtractedEventListing): string {
  return fingerprintParts({
    eventUrl: ev.eventUrl,
    externalId: ev.externalId,
    title: ev.title,
    startDate: ev.startDate,
    startDateTime: ev.startDateTime,
    venue: ev.venue,
  });
}
