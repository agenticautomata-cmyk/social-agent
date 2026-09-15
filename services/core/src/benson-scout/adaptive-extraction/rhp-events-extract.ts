/**
 * Rockhouse Partners (rhp-events) WordPress extractor.
 *
 * Signature-based — plugin/DOM markers only. No venue/domain hard-coding.
 */

import { createHash } from 'node:crypto';
import type {
  EventListingCapability,
  EventListingExtractionMethod,
  ExtractedEventListing,
  EventListingExtractResult,
} from '../event-listing-extract.js';
import { detectRhpEventsSignals } from './platform-registry.js';

function rhpCapability(detectable: boolean): EventListingCapability {
  return {
    looksLikeEventListing: detectable,
    hasJsonLdEvents: false,
    hasWixEventsSignals: false,
    hasRepeatedEventBlocks: false,
    isWixSite: false,
    isSquarespaceSite: false,
    hasSquarespaceEventsSignals: false,
    hasTheaterSeasonSignals: false,
    hasIcsLinks: false,
    hasGoogleCalendarLinks: false,
    hasWordpressEventMarkup: detectable,
    hasWordpressTecSignals: false,
    hasWordpressRhpEventsSignals: detectable,
    hasTribeEventsListMarkup: false,
    hasTribeEventsMonthGrid: false,
    hasIframeCalendarEmbed: false,
    needsAdapter: false,
    hasDateGroupedHtmlCalendar: false,
    hasEmbeddedJsonEventCatalog: false,
    siteTimeZone: null,
    reasons: detectable ? ['wordpress_rhp_events_signals'] : ['rhp_events_signals_absent'],
  };
}

const MONTHS: Record<string, number> = {
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
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&#038;/g, '&')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function absUrl(href: string, pageUrl: string): string | null {
  try {
    const u = new URL(href, pageUrl);
    u.hash = '';
    return u.href;
  } catch {
    return null;
  }
}

function parseMonthDayYear(raw: string, fallbackYear?: number): string | null {
  const long = raw.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/i,
  );
  if (long) {
    const month = MONTHS[long[1]!.toLowerCase()];
    if (!month) return null;
    const day = Number(long[2]);
    const year = long[3] ? Number(long[3]) : fallbackYear;
    if (!year || !day) return null;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  // Compact list labels: "Thu, Oct 01" / "Fri, Sep 25"
  const compact = raw.match(
    /\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\.?,?\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+(\d{1,2})\b/i,
  );
  if (compact) {
    const month = MONTHS[compact[1]!.toLowerCase()];
    const day = Number(compact[2]);
    const year = fallbackYear;
    if (!month || !day || !year) return null;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  return null;
}

function parseClock(raw: string): string | null {
  const m = raw.match(/\b(\d{1,2})(?::(\d{2}))?\s*([ap]m)\b/i);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  const ap = m[3]!.toLowerCase();
  if (ap === 'pm' && hour < 12) hour += 12;
  if (ap === 'am' && hour === 12) hour = 0;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function parseDoorsShow(text: string): { doors: string | null; show: string | null } {
  const doorsM = text.match(/Doors:\s*([^/]+?)(?:\/\/|$)/i);
  const showM = text.match(/Show:\s*(.+)$/i);
  return {
    doors: doorsM ? parseClock(doorsM[1]!) : null,
    show: showM ? parseClock(showM[1]!) : parseClock(text),
  };
}

function fingerprint(parts: string[]): string {
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 24);
}

function yearHint(_html: string, now = new Date()): number {
  // Do not scrape cache-buster / asset versions (?ver=20xxxxxx). Listing cards often omit year.
  return now.getFullYear();
}

function resolveListingDate(raw: string, now: Date): string | null {
  const baseYear = now.getFullYear();
  const parsed = parseMonthDayYear(raw, baseYear);
  if (!parsed) return null;
  const today = now.toISOString().slice(0, 10);
  // Compact labels without year: if implied date is >60 days in the past, roll forward one year.
  const parsedTime = Date.parse(`${parsed}T12:00:00Z`);
  const ageDays = (now.getTime() - parsedTime) / 86_400_000;
  if (ageDays > 60) {
    const rolled = parseMonthDayYear(raw, baseYear + 1);
    return rolled ?? parsed;
  }
  // Ignore absurd future from bad year scrape
  if (parsed.slice(0, 4) > String(baseYear + 1)) {
    return parseMonthDayYear(raw, baseYear) ?? parsed;
  }
  void today;
  return parsed;
}

type PerfDraft = {
  title: string;
  startDate: string | null;
  startTimeLocal: string | null;
  doorsTimeLocal: string | null;
  endDate: string | null;
  venue: string | null;
  city: string | null;
  regionState: string | null;
  priceText: string | null;
  ageRestriction: string | null;
  eventUrl: string | null;
  ticketUrl: string | null;
  evidence: string[];
  engagementKey: string | null;
};

function extractTitle(html: string): string | null {
  const h1 = html.match(/id=["']eventTitle["'][\s\S]{0,300}?<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1?.[1]) return decodeEntities(h1[1]);
  const titled = html.match(/id=["']eventTitle["'][^>]*title=["']([^"']+)["']/i);
  if (titled?.[1]) return decodeEntities(titled[1]);
  return null;
}

function extractAge(html: string): string | null {
  const m = html.match(/class=["'][^"']*eventAgeRestriction[^"']*["'][^>]*>([\s\S]*?)<\//i);
  return m?.[1] ? decodeEntities(m[1]) : null;
}

function extractPrice(html: string): string | null {
  const m = html.match(/class=["'][^"']*eventCost[^"']*["'][^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i);
  return m?.[1] ? decodeEntities(m[1]) : null;
}

function extractVenue(html: string): string | null {
  const m =
    html.match(/class=["'][^"']*rhpVenueContent[^"']*["'][^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i) ||
    html.match(/class=["'][^"']*eventVenue[^"']*["'][\s\S]{0,200}?<a[^>]*>([\s\S]*?)<\/a>/i);
  return m?.[1] ? decodeEntities(m[1]) : null;
}

function extractTicketUrl(html: string, pageUrl: string): string | null {
  const m = html.match(/https?:\/\/[^"'>\s]+\/ticket\/p\/[^"'>\s]+/i);
  if (m?.[0]) return m[0].replace(/&amp;/g, '&');
  const buy = html.match(/href=["']([^"']+)["'][^>]*>\s*BUY TICKETS/i);
  return buy?.[1] ? absUrl(buy[1], pageUrl) : null;
}

function extractMultiPerformances(html: string, pageUrl: string, title: string, now: Date): PerfDraft[] {
  const age = extractAge(html);
  const price = extractPrice(html);
  const venue = extractVenue(html);
  const engagementKey = `rhp:${title.toLowerCase().replace(/\s+/g, '-')}`;
  const blocks = [
    ...html.matchAll(
      /class=["'][^"']*eventDoorStartDate[^"']*["'][^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/gi,
    ),
  ];
  const out: PerfDraft[] = [];
  for (const block of blocks) {
    const text = decodeEntities(block[1] || '');
    if (!/Doors:|Show:/i.test(text) && !parseClock(text)) continue;
    const date = resolveListingDate(text, now);
    const { doors, show } = parseDoorsShow(text);
    if (!date && !show) continue;
    // Nearby ticket link after this span
    const idx = block.index ?? 0;
    const window = html.slice(idx, idx + 800);
    const ticket = extractTicketUrl(window, pageUrl) ?? extractTicketUrl(html, pageUrl);
    out.push({
      title,
      startDate: date,
      startTimeLocal: show,
      doorsTimeLocal: doors,
      endDate: null,
      venue,
      city: null,
      regionState: null,
      priceText: price,
      ageRestriction: age,
      eventUrl: pageUrl,
      ticketUrl: ticket,
      evidence: [
        `rhp_doors_show:${text.slice(0, 120)}`,
        ...(ticket ? [`ticket:${ticket}`] : []),
        ...(price ? [`price:${price}`] : []),
        ...(age ? [`age:${age}`] : []),
      ],
      engagementKey,
    });
  }
  return out;
}

function extractSingleDetail(html: string, pageUrl: string, now: Date): PerfDraft[] {
  const title = extractTitle(html);
  if (!title) return [];
  const multi = extractMultiPerformances(html, pageUrl, title, now);
  if (multi.length > 0) return multi;

  const dateBlock =
    html.match(/class=["'][^"']*eventStDate[^"']*["'][^>]*>([\s\S]*?)<\//i)?.[1] || '';
  const doorBlock =
    html.match(/class=["'][^"']*eventDoorStartDate[^"']*["'][\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i)?.[1] ||
    '';
  const startDate = resolveListingDate(decodeEntities(dateBlock), now);
  const { doors, show } = parseDoorsShow(decodeEntities(doorBlock));
  return [
    {
      title,
      startDate,
      startTimeLocal: show,
      doorsTimeLocal: doors,
      endDate: null,
      venue: extractVenue(html),
      city: null,
      regionState: null,
      priceText: extractPrice(html),
      ageRestriction: extractAge(html),
      eventUrl: pageUrl,
      ticketUrl: extractTicketUrl(html, pageUrl),
      evidence: [
        ...(startDate ? [`eventStDate:${startDate}`] : []),
        ...(doorBlock ? [`doors_show:${decodeEntities(doorBlock).slice(0, 80)}`] : []),
      ],
      engagementKey: `rhp:${title.toLowerCase().replace(/\s+/g, '-')}`,
    },
  ];
}

function extractListingCards(html: string, pageUrl: string, now: Date): PerfDraft[] {
  const out: PerfDraft[] = [];
  const seen = new Set<string>();

  // Prefer semantic event thumb / bookmark anchors used by rhp-events list/grid.
  const anchorRe =
    /<a[^>]+href=["']([^"']*\/event\/[^"']+)["'][^>]*title=["']([^"']+)["'][^>]*>/gi;
  for (const m of html.matchAll(anchorRe)) {
    const href = m[1]!;
    const title = decodeEntities(m[2]!);
    const eventUrl = absUrl(href, pageUrl);
    if (!title || !eventUrl || seen.has(eventUrl)) continue;
    seen.add(eventUrl);
    const startIdx = m.index ?? 0;
    const chunk = html.slice(startIdx, startIdx + 1800);
    const dateText = decodeEntities(
      chunk.match(
        /class=["'][^"']*(?:singleEventDate|eventMonth|eventStDate|rhp-event__date)[^"']*["'][^>]*>([\s\S]*?)<\//i,
      )?.[1] ||
        chunk.match(/eventDateListTop[\s\S]{0,200}?>([\s\S]*?)<\//i)?.[1] ||
        '',
    );
    const doorText = decodeEntities(
      chunk.match(
        /class=["'][^"']*eventDoorStartDate[^"']*["'][\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i,
      )?.[1] || '',
    );
    const startDate = resolveListingDate(dateText, now);
    const { doors, show } = parseDoorsShow(doorText);
    out.push({
      title,
      startDate,
      startTimeLocal: show,
      doorsTimeLocal: doors,
      endDate: null,
      venue: extractVenue(chunk),
      city: null,
      regionState: null,
      priceText: extractPrice(chunk),
      ageRestriction: extractAge(chunk),
      eventUrl,
      ticketUrl: extractTicketUrl(chunk, pageUrl),
      evidence: [
        'rhp_listing_card',
        ...(startDate ? [`date:${startDate}`] : []),
        ...(dateText ? [`date_label:${dateText.slice(0, 40)}`] : []),
        ...(doorText ? [`doors_show:${doorText.slice(0, 80)}`] : []),
      ],
      engagementKey: `rhp:${title.toLowerCase().replace(/\s+/g, '-')}`,
    });
  }

  if (out.length > 0) return out;

  // Fallback: older eventWrapper card markup.
  const cards = html.split(/class=["'][^"']*eventWrapper[^"']*["']/i).slice(1);
  for (const card of cards) {
    const chunk = card.slice(0, 2500);
    const title =
      decodeEntities(
        chunk.match(/title=["']([^"']+)["']/i)?.[1] ||
          chunk.match(/<a[^>]*class=["'][^"']*url[^"']*["'][^>]*>([\s\S]*?)<\/a>/i)?.[1] ||
          '',
      ) || null;
    if (!title || title.length < 2) continue;
    const href =
      chunk.match(/href=["']([^"']*\/event\/[^"']+)["']/i)?.[1] ||
      chunk.match(/href=["']([^"']+)["']/i)?.[1] ||
      null;
    const eventUrl = href ? absUrl(href, pageUrl) : null;
    if (eventUrl && seen.has(eventUrl)) continue;
    if (eventUrl) seen.add(eventUrl);
    const dateText = decodeEntities(
      chunk.match(/class=["'][^"']*(?:eventStDate|singleEventDate|eventMonth)[^"']*["'][^>]*>([\s\S]*?)<\//i)?.[1] ||
        '',
    );
    const doorText = decodeEntities(
      chunk.match(/class=["'][^"']*eventDoorStartDate[^"']*["'][\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i)?.[1] ||
        '',
    );
    const startDate = resolveListingDate(dateText, now);
    const { doors, show } = parseDoorsShow(doorText);
    out.push({
      title,
      startDate,
      startTimeLocal: show,
      doorsTimeLocal: doors,
      endDate: null,
      venue: extractVenue(chunk),
      city: null,
      regionState: null,
      priceText: extractPrice(chunk),
      ageRestriction: extractAge(chunk),
      eventUrl,
      ticketUrl: extractTicketUrl(chunk, pageUrl),
      evidence: [
        'rhp_listing_card',
        ...(startDate ? [`date:${startDate}`] : []),
        ...(doorText ? [`doors_show:${doorText.slice(0, 80)}`] : []),
      ],
      engagementKey: `rhp:${title.toLowerCase().replace(/\s+/g, '-')}`,
    });
  }
  return out;
}

function toListing(draft: PerfDraft, pageUrl: string, now: Date): ExtractedEventListing {
  const startDateTime =
    draft.startDate && draft.startTimeLocal
      ? `${draft.startDate}T${draft.startTimeLocal}:00`
      : null;
  const externalId = fingerprint([
    draft.title,
    draft.startDate ?? '',
    draft.startTimeLocal ?? '',
    draft.eventUrl ?? pageUrl,
  ]);
  const verificationState =
    draft.startDate && draft.title
      ? draft.startTimeLocal
        ? 'verified'
        : 'partial'
      : 'unresolved_date';
  return {
    externalId: `rhp:${externalId}`,
    title: draft.title,
    startDate: draft.startDate,
    startDateTime,
    endDate: draft.endDate,
    endDateTime: null,
    venue: draft.venue,
    address: null,
    city: draft.city,
    regionState: draft.regionState,
    priceText: draft.priceText,
    isFree: draft.priceText ? /free/i.test(draft.priceText) : null,
    eventUrl: draft.eventUrl,
    ticketOrRsvpUrl: draft.ticketUrl,
    ticketUrl: draft.ticketUrl,
    organizer: null,
    isRecurring: false,
    imageUrl: null,
    sourceUrl: pageUrl,
    evidence: draft.evidence,
    method: 'wordpress_rhp_events',
    verificationState,
    platform: 'wordpress_rhp_events',
    productionTitle: draft.engagementKey ? draft.title : null,
    productionGroupKey: draft.engagementKey,
    listingRole: draft.engagementKey ? 'performance' : null,
    itemKind: draft.engagementKey ? 'performance' : 'event',
    startTimeLocal: draft.startTimeLocal,
    ageRestriction: draft.ageRestriction,
    configuredUrl: pageUrl,
    effectiveExtractionUrl: pageUrl,
    description: draft.doorsTimeLocal ? `Doors ${draft.doorsTimeLocal}` : null,
  };
}

export function extractRhpEventListings(input: {
  html: string;
  pageUrl: string;
  now?: Date;
}): EventListingExtractResult {
  const now = input.now ?? new Date();
  const retrievedAt = now.toISOString();
  const strategiesAttempted: EventListingExtractionMethod[] = ['wordpress_rhp_events'];
  if (!detectRhpEventsSignals(input.html)) {
    return {
      events: [],
      method: 'none',
      rejectionReasons: ['rhp_events_signals_absent'],
      strategiesAttempted,
      capability: rhpCapability(false),
      retrievedAt,
      platformSupport: [
        {
          platform: 'wordpress_rhp_events',
          detectable: false,
          extractable: false,
          status: 'absent',
          notes: 'No rhp-events markers',
        },
      ],
    };
  }

  let drafts =
    /id=["']RhpEventsSingle["']/i.test(input.html) || /single-rhp_events/i.test(input.html)
      ? extractSingleDetail(input.html, input.pageUrl, now)
      : extractListingCards(input.html, input.pageUrl, now);

  if (drafts.length === 0) {
    drafts = [
      ...extractListingCards(input.html, input.pageUrl, now),
      ...extractSingleDetail(input.html, input.pageUrl, now),
    ];
  }

  // Drop empty titles / pure nav residue
  drafts = drafts.filter((d) => d.title && d.title.length >= 2 && !/^buy tickets$/i.test(d.title));

  const events = drafts.map((d) => toListing(d, input.pageUrl, now));
  const groups = new Set(events.map((e) => e.productionGroupKey).filter(Boolean));

  return {
    events,
    method: events.length > 0 ? 'wordpress_rhp_events' : 'none',
    rejectionReasons: events.length === 0 ? ['rhp_events_no_parseable_occurrences'] : [],
    strategiesAttempted,
    capability: rhpCapability(true),
    retrievedAt,
    platformSupport: [
      {
        platform: 'wordpress_rhp_events',
        detectable: true,
        extractable: events.length > 0,
        status: events.length > 0 ? 'supported' : 'partial',
        notes: `${events.length} occurrences / ${groups.size} engagements`,
      },
    ],
    diagnostics: {
      candidatesDetected: drafts.length,
      groupedNights: groups.size,
    },
  };
}

export function htmlLooksLikeRhpEvents(html: string): boolean {
  return detectRhpEventsSignals(html);
}
