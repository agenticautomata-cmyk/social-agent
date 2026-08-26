/**
 * Official event-occurrence authority for Ask Benson URL intake.
 * Multiple explicit event signals outrank topical food/restaurant/shopping labels.
 * Not title-specific — no brand/festival allowlists.
 */

import { parseEventDate, type ExtractedOpportunity } from './listing-extract.js';
import { isPastEventDate } from './qualify-url-opportunity.js';
import { classifyEditorialContainer } from './editorial-container.js';

export const EVENT_OCCURRENCE_SIGNAL_FAMILIES = [
  'event_route',
  'dated',
  'hours',
  'venue',
  'tickets',
  'lexicon',
] as const;

export type EventOccurrenceSignalFamily = (typeof EVENT_OCCURRENCE_SIGNAL_FAMILIES)[number];

export type EventOccurrenceSignals = {
  families: EventOccurrenceSignalFamily[];
  isEventOccurrence: boolean;
  isEventItemPath: boolean;
  isEventIndexPath: boolean;
  isPrimarilyRestaurantPage: boolean;
  startDate: Date | null;
  endDate: Date | null;
  venue: string | null;
  location: string | null;
  ticketUrl: string | null;
};

const MONTH =
  'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';

const DATE_RANGE_RE = new RegExp(
  `\\b(${MONTH})\\s+(\\d{1,2})\\s*[-–—]\\s*(?:(${MONTH})\\s+)?(\\d{1,2})(?:,?\\s*((?:20)\\d{2}))?\\b`,
  'i',
);

const MONTH_DAY_YEAR_RE = new RegExp(`\\b(${MONTH})\\s+(\\d{1,2})(?:,)?\\s*((?:20)\\d{2})\\b`, 'i');

const ISO_DATE_RE = /\b(20\d{2})-(\d{2})-(\d{2})\b/;

const HOURS_RE =
  /\b(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)\s*[-–—to]+\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)|doors?\s+\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i;

const TICKETS_RE =
  /\b(get tickets?(?:\s+now)?|buy tickets?|tickets?\s+now|register(?:\s+now)?|registration|rsvp)\b/i;

const LEXICON_RE =
  /\b(fest(?:ival)?s?|concerts?|shows?|expo|fair|pageant|parade|tour dates?)\b/i;

const EVENT_WORD_RE = /\b(events?)\b/i;

const VENUE_RE =
  /\b([A-Z][A-Za-z0-9'&.-]+(?:\s+[A-Z][A-Za-z0-9'&.-]+){0,4}\s+(?:Field|Park|Arena|Stadium|Center|Centre|Theatre|Theater|Hall|Pavilion|Amphitheatre|Amphitheater|Ballpark|Coliseum|Auditorium|Garden|Plaza))\b/;

const ADDRESS_RE =
  /\b(\d{2,5}\s+[A-Za-z0-9.\s]+(?:Pkwy|Parkway|Rd|Road|St|Street|Ave|Avenue|Blvd|Boulevard|Dr|Drive)\.?),?\s*(Kansas City),\s*(KS|MO)\b/i;

const RESTAURANT_PAGE_RE =
  /\b(our\s+menu|view\s+menu|dinner menu|lunch menu|reservations?|order online|book a table|our restaurant|dining room)\b/i;

const MONTH_INDEX: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

function monthIndex(raw: string): number | null {
  const key = raw.toLowerCase().replace(/\./g, '');
  return MONTH_INDEX[key] ?? MONTH_INDEX[key.slice(0, 3)] ?? null;
}

function utcDate(year: number, month: number, day: number): Date | null {
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month || d.getUTCDate() !== day) return null;
  return d;
}

export function parseOfficialEventDates(text: string): { start: Date | null; end: Date | null } {
  const range = DATE_RANGE_RE.exec(text);
  if (range) {
    const startMonth = monthIndex(range[1]!);
    const endMonth = range[3] ? monthIndex(range[3]) : startMonth;
    const year = range[5] ? Number(range[5]) : new Date().getUTCFullYear();
    if (startMonth != null && endMonth != null) {
      return {
        start: utcDate(year, startMonth, Number(range[2])),
        end: utcDate(year, endMonth, Number(range[4])),
      };
    }
  }

  const monthDayYear = MONTH_DAY_YEAR_RE.exec(text);
  if (monthDayYear) {
    const month = monthIndex(monthDayYear[1]!);
    if (month != null) {
      const start = utcDate(Number(monthDayYear[3]), month, Number(monthDayYear[2]));
      return { start, end: null };
    }
  }

  const iso = ISO_DATE_RE.exec(text);
  if (iso) {
    const start = utcDate(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return { start, end: null };
  }

  return { start: null, end: null };
}

export function isEventIndexPath(pageUrl: string): boolean {
  try {
    const path = new URL(pageUrl).pathname.toLowerCase().replace(/\/+$/, '') || '/';
    return /\/events?$/.test(path) || /\/calendar$/.test(path);
  } catch {
    return false;
  }
}

/** Single event page under an events/calendar collection (e.g. /events-1/slug). */
export function isEventItemPath(pageUrl: string): boolean {
  try {
    const path = new URL(pageUrl).pathname.toLowerCase();
    return /\/events?(?:[-_][\w]+)?\/.+/.test(path) || /\/calendar\/.+/.test(path);
  } catch {
    return false;
  }
}

function extractVenue(text: string): string | null {
  const venue = text
    .match(VENUE_RE)?.[1]
    ?.replace(/\s+/g, ' ')
    .replace(/^(LOCATION|VENUE|ADDRESS|WHERE)\s+/i, '')
    .trim();
  return venue && venue.length >= 4 ? venue : null;
}

function extractLocation(text: string): string | null {
  const addr = ADDRESS_RE.exec(text);
  if (addr) {
    const city = addr[2]!;
    const state = addr[3]!.toUpperCase();
    return state === 'KS' ? `${city}, KS` : `${city}, MO`;
  }
  if (/\bkansas city,\s*ks\b/i.test(text) || /\bks\s*66\d{3}\b/i.test(text)) {
    return 'Kansas City, KS';
  }
  if (/\bkansas city,\s*mo\b/i.test(text)) return 'Kansas City, MO';
  if (/\bkansas city\b/i.test(text)) return 'Kansas City';
  return null;
}

function extractTicketUrl(text: string, pageUrl: string): string | null {
  const urls = text.match(/https?:\/\/[^\s<>"')\]]+/gi) ?? [];
  for (const raw of urls) {
    const cleaned = raw.replace(/[.,;:!?)]+$/, '');
    if (/eventbrite|ticketmaster|tickets?|get-tickets|buy-tickets/i.test(cleaned)) {
      return cleaned;
    }
  }
  if (TICKETS_RE.test(text)) return pageUrl;
  return null;
}

export function scoreEventOccurrenceSignals(input: {
  pageUrl?: string | null;
  pageTitle?: string | null;
  pageText?: string | null;
  businessName?: string | null;
}): EventOccurrenceSignals {
  const pageUrl = input.pageUrl ?? '';
  const text = `${input.pageTitle ?? ''} ${input.pageText ?? ''} ${input.businessName ?? ''}`;
  const families = new Set<EventOccurrenceSignalFamily>();
  const itemPath = pageUrl ? isEventItemPath(pageUrl) : false;
  const indexPath = pageUrl ? isEventIndexPath(pageUrl) : false;
  if (itemPath) families.add('event_route');

  const dates = parseOfficialEventDates(text);
  if (dates.start) families.add('dated');
  if (HOURS_RE.test(text)) families.add('hours');
  const venue = extractVenue(text);
  const location = extractLocation(text);
  if (venue || location) families.add('venue');
  if (TICKETS_RE.test(text)) families.add('tickets');
  if (LEXICON_RE.test(text) || (EVENT_WORD_RE.test(text) && (dates.start || itemPath))) {
    families.add('lexicon');
  }

  const restaurantPage = RESTAURANT_PAGE_RE.test(text);
  const festivalOrTickets = LEXICON_RE.test(text) || TICKETS_RE.test(text);
  const isPrimarilyRestaurantPage = restaurantPage && !festivalOrTickets;

  const familyList = EVENT_OCCURRENCE_SIGNAL_FAMILIES.filter((f) => families.has(f));
  const container = classifyEditorialContainer({
    url: pageUrl,
    title: input.pageTitle,
    pageText: input.pageText,
  });
  const isEventOccurrence =
    !isPrimarilyRestaurantPage &&
    !container.isContainer &&
    (familyList.length >= 3 ||
      (itemPath && Boolean(dates.start) && (families.has('tickets') || families.has('venue') || families.has('lexicon'))));

  return {
    families: familyList,
    isEventOccurrence,
    isEventItemPath: itemPath,
    isEventIndexPath: indexPath,
    isPrimarilyRestaurantPage,
    startDate: dates.start,
    endDate: dates.end,
    venue,
    location,
    ticketUrl: extractTicketUrl(text, pageUrl),
  };
}

export function isOfficialEventOccurrencePage(input: {
  pageUrl: string;
  pageTitle?: string | null;
  pageText?: string | null;
  businessName?: string | null;
}): boolean {
  return scoreEventOccurrenceSignals(input).isEventOccurrence;
}

export function buildFallbackEventOpportunity(input: {
  pageUrl: string;
  pageTitle?: string | null;
  pageText?: string | null;
  businessName?: string | null;
}): ExtractedOpportunity | null {
  const signals = scoreEventOccurrenceSignals(input);
  if (!signals.isEventOccurrence || !signals.startDate) return null;
  if (isPastEventDate(signals.startDate)) return null;

  const title =
    (input.pageTitle ?? '')
      .replace(/\s*[|].*$/, '')
      .replace(/\s*[—–]\s*/g, ' — ')
      .trim() ||
    input.businessName?.trim() ||
    null;
  if (!title || title.length < 4) return null;

  return {
    title: title.slice(0, 200),
    summary: (input.pageText ?? '').replace(/\s+/g, ' ').trim().slice(0, 400) || null,
    location: signals.location,
    venue: signals.venue,
    businessName: input.businessName ?? title,
    eventDate: signals.startDate.toISOString().slice(0, 10),
    eventEndDate: signals.endDate ? signals.endDate.toISOString().slice(0, 10) : null,
    category: LEXICON_RE.test(`${input.pageTitle ?? ''} ${input.pageText ?? ''}`)
      ? 'festival'
      : 'local_event',
    sourceUrl: input.pageUrl,
    tags: signals.families,
    confidence: 0.82,
  };
}

export function isTicketVendorUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    return host === 'eventbrite.com' || host === 'ticketmaster.com' || host.endsWith('.eventbrite.com');
  } catch {
    return /eventbrite|ticketmaster/i.test(url);
  }
}

export function isTicketVendorTitle(title: string | null | undefined): boolean {
  return /\beventbrite\b|\bticketmaster\b|\btickets,\s*multiple dates\b/i.test(title ?? '');
}

export function officialOccurrenceTitle(input: {
  pageTitle?: string | null;
  businessName?: string | null;
  fallbackTitle?: string | null;
}): string | null {
  const candidates = [input.pageTitle, input.businessName, input.fallbackTitle];
  for (const raw of candidates) {
    const title = (raw ?? '')
      .replace(/\s*[|].*$/, '')
      .replace(/\s*[—–]\s*/g, ' — ')
      .trim();
    if (title.length >= 4 && !isTicketVendorTitle(title)) return title.slice(0, 200);
  }
  return null;
}

export function officialEventCategory(signals: EventOccurrenceSignals, title: string): string {
  if (/\bfest(?:ival)?\b/i.test(title) || signals.families.includes('lexicon')) {
    if (/\bfest(?:ival)?\b/i.test(title)) return 'festival';
  }
  return 'local_event';
}

export { parseEventDate };
