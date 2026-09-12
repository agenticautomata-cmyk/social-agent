/**
 * WordPress / The Events Calendar (TEC / Tribe) public event extraction.
 *
 * Preference order for callers:
 * 1. Official tribe/events/v1 REST (when body supplied)
 * 2. Event JSON-LD on list pages (handled by shared extractor)
 * 3. TEC list-view markup (production rows — never month-grid cells)
 * 4. Collection ICS (handled by shared ICS path)
 *
 * Granularity: keep production runs as one row when the schema is a date span.
 * Never invent curtain / performance times from midnight placeholders.
 */

import { isTrustworthyListingClock } from '../ask-benson/jsonld-events.js';
import type { ExtractedEventListing, EventListingExtractionMethod } from './event-listing-extract.js';

export type TribeEventsRestEvent = {
  id?: number | string;
  global_id?: string;
  status?: string;
  title?: string;
  url?: string;
  website?: string;
  all_day?: boolean;
  start_date?: string;
  end_date?: string;
  start_date_details?: {
    year?: string;
    month?: string;
    day?: string;
    hour?: string;
    minutes?: string;
    seconds?: string;
  };
  end_date_details?: {
    year?: string;
    month?: string;
    day?: string;
    hour?: string;
    minutes?: string;
    seconds?: string;
  };
  timezone?: string;
  venue?: {
    venue?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
  } | null;
  image?: { url?: string } | string | null;
  cost?: string;
  slug?: string;
};

export type TribeEventsRestPayload = {
  events?: TribeEventsRestEvent[];
  total?: number;
  total_pages?: number;
  rest_url?: string;
};

const TEC_PLUGIN_MARKERS = [
  /the-events-calendar/i,
  /tec-api-version/i,
  /tec-api-origin/i,
  /wp-json\/tribe\/events\/v1/i,
  /tribe-events-view/i,
  /tribe_events/i,
  /tribe-events/i,
  /type-tribe_events/i,
];

const TEC_LIST_MARKERS = [
  /tribe-events-view--list/i,
  /tribe-events-calendar-list__event/i,
  /tribe-events-calendar-list/i,
];

const TEC_MONTH_MARKERS = [
  /tribe-events-view--month/i,
  /tribe-events-calendar-month__calendar-event/i,
];

export function htmlHasWordpressTecSignals(html: string): boolean {
  return TEC_PLUGIN_MARKERS.some((re) => re.test(html));
}

export function htmlHasTribeEventsListMarkup(html: string): boolean {
  return TEC_LIST_MARKERS.some((re) => re.test(html));
}

export function htmlHasTribeEventsMonthGrid(html: string): boolean {
  return TEC_MONTH_MARKERS.some((re) => re.test(html));
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&#038;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#x2F;/gi, '/')
    .replace(/&nbsp;/gi, ' ');
}

function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function absoluteUrl(href: string | null | undefined, pageUrl: string): string | null {
  if (!href?.trim()) return null;
  try {
    return new URL(href.trim(), pageUrl).href;
  } catch {
    return null;
  }
}

function ymdFromDetails(
  details:
    | {
        year?: string;
        month?: string;
        day?: string;
      }
    | null
    | undefined,
): string | null {
  if (!details?.year || !details.month || !details.day) return null;
  return `${details.year}-${details.month.padStart(2, '0')}-${details.day.padStart(2, '0')}`;
}

function clockFromDetails(
  details:
    | {
        hour?: string;
        minutes?: string;
        seconds?: string;
      }
    | null
    | undefined,
): string | null {
  if (details?.hour == null || details.minutes == null) return null;
  const clock = `${String(details.hour).padStart(2, '0')}:${String(details.minutes).padStart(2, '0')}:${String(
    details.seconds ?? '0',
  ).padStart(2, '0')}`;
  return isTrustworthyListingClock(clock) ? clock : null;
}

function parseRestDateTime(raw: string | undefined): { date: string | null; time: string | null } {
  if (!raw?.trim()) return { date: null, time: null };
  const m = raw.trim().match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}:\d{2}))?/);
  if (!m) return { date: null, time: null };
  const date = m[1]!;
  const time = m[2] && isTrustworthyListingClock(m[2]) ? m[2] : null;
  return { date, time };
}

function looksLikeAllDayProduction(input: {
  allDayFlag?: boolean;
  startTime: string | null;
  endTime: string | null;
  startDate: string | null;
  endDate: string | null;
}): boolean {
  if (input.allDayFlag) return true;
  if (!input.startTime && !input.endTime && input.startDate) return true;
  // TEC often encodes all-day as 00:00:00 → 23:59:59 (clocks already stripped as untrustworthy).
  if (!input.startTime && input.startDate && input.endDate) return true;
  return false;
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

function imageUrlOf(image: TribeEventsRestEvent['image']): string | null {
  if (!image) return null;
  if (typeof image === 'string') return image || null;
  return image.url ?? null;
}

/**
 * Map official tribe/events/v1 JSON into listings.
 * Multi-day productions stay one row; midnight placeholders never become curtain times.
 */
export function extractFromTribeEventsRest(
  payload: TribeEventsRestPayload | TribeEventsRestEvent[],
  pageUrl: string,
): ExtractedEventListing[] {
  const events = Array.isArray(payload) ? payload : payload.events ?? [];
  const out: ExtractedEventListing[] = [];

  for (const ev of events) {
    if (ev.status && ev.status !== 'publish') continue;
    const title = stripTags(String(ev.title ?? '')).trim();
    if (!title) continue;

    const startFromDetails = ymdFromDetails(ev.start_date_details);
    const endFromDetails = ymdFromDetails(ev.end_date_details);
    const startParsed = parseRestDateTime(ev.start_date);
    const endParsed = parseRestDateTime(ev.end_date);
    const startDate = startFromDetails ?? startParsed.date;
    const endDate = endFromDetails ?? endParsed.date;
    const startClock = clockFromDetails(ev.start_date_details) ?? startParsed.time;
    const endClock = clockFromDetails(ev.end_date_details) ?? endParsed.time;
    const allDay = looksLikeAllDayProduction({
      allDayFlag: Boolean(ev.all_day),
      startTime: startClock,
      endTime: endClock,
      startDate,
      endDate,
    });

    // Never invent performance times for all-day / production-run spans.
    const startDateTime = !allDay && startDate && startClock ? `${startDate}T${startClock}` : null;
    const endDateTime = !allDay && endDate && endClock ? `${endDate}T${endClock}` : null;
    const eventUrl = absoluteUrl(ev.url ?? null, pageUrl);
    const ticketOrRsvpUrl = absoluteUrl(ev.website || ev.url || null, pageUrl);
    const venue = ev.venue?.venue?.trim() || null;
    const city = ev.venue?.city?.trim() || null;
    const regionState = ev.venue?.state?.trim() || null;
    const address = [ev.venue?.address, city, regionState, ev.venue?.zip].filter(Boolean).join(', ') || null;
    const externalId =
      (ev.global_id && String(ev.global_id).trim()) ||
      (ev.id != null ? `tribe_events:${ev.id}` : null);

    const isMultiday = Boolean(startDate && endDate && endDate !== startDate);
    const method: EventListingExtractionMethod = 'wordpress_tec_rest';
    const row: ExtractedEventListing = {
      externalId,
      title,
      startDate,
      startDateTime,
      endDate: endDate ?? null,
      endDateTime,
      venue,
      address: address && address !== venue ? address : ev.venue?.address?.trim() || null,
      city,
      regionState,
      priceText: ev.cost?.trim() ? stripTags(ev.cost) : null,
      isFree: ev.cost != null && /^\s*free\s*$/i.test(ev.cost) ? true : ev.cost === '' ? null : null,
      eventUrl,
      ticketOrRsvpUrl,
      organizer: null,
      isRecurring: false,
      imageUrl: imageUrlOf(ev.image),
      sourceUrl: pageUrl,
      evidence: [
        'wordpress_tec_rest',
        externalId ? `tribe_id:${externalId}` : 'tribe_id:missing',
        startDate ? `start:${startDate}` : 'start:unresolved',
        endDate ? `end:${endDate}` : 'end:missing',
        allDay ? 'granularity:production_run_all_day' : 'granularity:timed_occurrence',
        allDay ? 'performance_time:not_published' : startClock ? `start_time:${startClock}` : 'start_time:missing',
        isMultiday ? 'multiday_span:single_row' : 'multiday_span:false',
        'month_grid_expansion:forbidden',
      ],
      method,
      verificationState: 'partial',
      platform: 'wordpress_tec',
      listingRole: allDay || isMultiday ? 'production' : 'performance',
      productionTitle: title,
      productionId: externalId,
      productionGroupKey: externalId,
      runStartDate: startDate,
      runEndDate: endDate,
    };
    row.verificationState = verificationFor(row);
    out.push(row);
  }

  return out;
}

export function parseTribeEventsRestJson(raw: string): TribeEventsRestPayload | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return { events: parsed as TribeEventsRestEvent[] };
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as TribeEventsRestPayload).events)) {
      return parsed as TribeEventsRestPayload;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * TEC list-view articles only. Skips month-grid day cells to avoid multi-day duplicates.
 */
export function extractFromTribeEventsListHtml(html: string, pageUrl: string): ExtractedEventListing[] {
  if (htmlHasTribeEventsMonthGrid(html) && !htmlHasTribeEventsListMarkup(html)) {
    // Month-only markup — refuse cell scraping (would duplicate productions per day).
    return [];
  }

  const events: ExtractedEventListing[] = [];
  const articleRe =
    /<article[^>]*class="([^"]*\btype-tribe_events\b[^"]*)"[^>]*>([\s\S]*?)<\/article>/gi;
  let match: RegExpExecArray | null;
  while ((match = articleRe.exec(html)) !== null) {
    const classNames = match[1] ?? '';
    const body = match[2] ?? '';
    // Explicitly reject month-grid cell articles.
    if (/tribe-events-calendar-month__/i.test(classNames)) continue;

    const titleMatch =
      body.match(
        /tribe-events-calendar-list__event-title[\s\S]*?<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i,
      ) ||
      body.match(
        /<h[12][^>]*class="[^"]*tribe-events-calendar-list__event-title[^"]*"[^>]*>[\s\S]*?<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i,
      );
    if (!titleMatch) continue;
    const eventUrl = absoluteUrl(titleMatch[1]!, pageUrl);
    const title = stripTags(titleMatch[2]!).trim();
    if (!title) continue;

    const timeMatch = body.match(/<time[^>]*datetime=["']([^"']+)["'][^>]*>([\s\S]*?)<\/time>/i);
    const datetime = timeMatch?.[1] ?? '';
    const timeText = stripTags(timeMatch?.[2] ?? '');
    let startDate: string | null = datetime.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
    let endDate: string | null = null;

    // "August 20 - September 13" style range in the time label (common for production runs).
    const range = timeText.match(
      /([A-Za-z]+)\s+(\d{1,2})(?:\s*[–—-]\s*([A-Za-z]+)?\s*(\d{1,2}))?(?:\s*,?\s*(\d{4}))?/,
    );
    if (startDate && range?.[4]) {
      const startMonth = Number(startDate.slice(5, 7));
      const endMonthName = (range[3] ?? range[1] ?? '').toLowerCase();
      const months: Record<string, number> = {
        january: 1,
        february: 2,
        march: 3,
        april: 4,
        may: 5,
        june: 6,
        july: 7,
        august: 8,
        september: 9,
        october: 10,
        november: 11,
        december: 12,
      };
      const endMonth = months[endMonthName] ?? startMonth;
      const endDay = Number(range[4]);
      const year = Number(range[5] ?? startDate.slice(0, 4));
      if (endMonth >= 1 && endDay >= 1) {
        endDate = `${year}-${String(endMonth).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;
      }
    }

    const venue =
      stripTags(
        body.match(/tribe-events-calendar-list__event-venue-title[^>]*>([\s\S]*?)<\//i)?.[1] ?? '',
      ) || null;

    const postId = classNames.match(/\bpost-(\d+)\b/)?.[1] ?? null;
    const row: ExtractedEventListing = {
      externalId: postId ? `tribe_events:${postId}` : null,
      title,
      startDate,
      startDateTime: null, // list cards for theater runs do not publish curtain times
      endDate: endDate && endDate !== startDate ? endDate : null,
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
      isRecurring: false,
      imageUrl: absoluteUrl(
        body.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] ?? null,
        pageUrl,
      ),
      sourceUrl: pageUrl,
      evidence: [
        'wordpress_tec_list_html',
        startDate ? `start:${startDate}` : 'start:unresolved',
        endDate ? `end:${endDate}` : 'end:same_or_missing',
        'granularity:production_run_list_card',
        'performance_time:not_published',
        'month_grid_expansion:forbidden',
      ],
      method: 'wordpress_tec_list',
      verificationState: 'partial',
      platform: 'wordpress_tec',
      listingRole: 'production',
      productionTitle: title,
      productionId: postId ? `tribe_events:${postId}` : null,
      productionGroupKey: postId ? `tribe_events:${postId}` : eventUrl,
      runStartDate: startDate,
      runEndDate: endDate && endDate !== startDate ? endDate : startDate,
    };
    row.verificationState = verificationFor(row);
    events.push(row);
  }

  return events;
}

