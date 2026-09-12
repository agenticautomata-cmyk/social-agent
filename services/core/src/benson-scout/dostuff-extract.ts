/**
 * DoStuff / Do816 public collection extraction.
 * Prefer SSR event cards / structured public JSON; no private APIs.
 */

import { stripTrackingParams } from './event-listing-outcomes.js';

export type DostuffExtractionMethod = 'dostuff_html' | 'dostuff_html' | 'dostuff_json' | 'none';

export type ExtractedDostuffEvent = {
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
  organizer: string | null;
  eventUrl: string;
  ticketOrRsvpUrl: string | null;
  imageUrl: string | null;
  evidence: string[];
  method: DostuffExtractionMethod;
  verificationState: 'verified' | 'partial' | 'unresolved_date';
};

export type DoStuffJsonPayload = {
  user?: { id?: number; name?: string; permalink?: string };
  event_groups?: Array<{ date?: string; events?: Array<Record<string, unknown>> }>;
  paging?: { count?: number; total_pages?: number; current_page?: number; page_size?: number };
};

export type DostuffExtractResult = {
  events: ExtractedDostuffEvent[];
  method: DostuffExtractionMethod;
  rejectionReasons: string[];
  pagination: {
    bounded: boolean;
    emptyListing: boolean;
    incompleteRender: boolean;
    hasNextPage: boolean;
    resultContainerRendered: boolean;
    paginationComplete: boolean;
  };
  capability: DostuffCapability;
};

export type DostuffCapability = {
  looksLikeDostuffListing: boolean;
  hasEventCards: boolean;
  hasListingChrome: boolean;
  needsAdapter: boolean;
  reasons: string[];
};

export function isDostuffWatchUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return /do\d+\.com$/i.test(u.hostname) || /dostuffmedia\.com$/i.test(u.hostname);
  } catch {
    return false;
  }
}

/** Public twin of a DoStuff collection page — preferred over HTML when available. */
export function dostuffJsonUrlFor(pageUrl: string): string | null {
  try {
    const u = new URL(pageUrl);
    if (!isDostuffWatchUrl(pageUrl)) return null;
    return `${u.origin}${u.pathname.replace(/\/$/, '')}.json${u.search}`;
  } catch {
    return null;
  }
}

export function stripDostuffTrackingParams(url: string): string {
  try {
    const u = new URL(url);
    for (const key of [...u.searchParams.keys()]) {
      if (
        /^utm_/i.test(key) ||
        ['fbclid', 'gclid', 'cid', 'sharedid', 'ref', 'ref_src'].includes(key.toLowerCase())
      ) {
        u.searchParams.delete(key);
      }
    }
    return u.toString();
  } catch {
    return stripTrackingParams(url);
  }
}

export function unwrapAffiliateTicketUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const nested = u.searchParams.get('u') || u.searchParams.get('url');
    if (nested) {
      return stripDostuffTrackingParams(decodeURIComponent(nested));
    }
    return stripDostuffTrackingParams(url);
  } catch {
    return null;
  }
}

export function detectDostuffCapability(html: string, pageUrl?: string): DostuffCapability {
  const reasons: string[] = [];
  const hasListingChrome =
    /ds-event-listings|ds-listings-main|ds-user-listing|dostuffmedia/i.test(html) ||
    Boolean(pageUrl && isDostuffWatchUrl(pageUrl));
  const hasEventCards =
    /ds-listing\s+event-card/i.test(html) ||
    /itemtype=["']https?:\/\/schema\.org\/Event["']/i.test(html);
  if (hasListingChrome) reasons.push('dostuff_listing_chrome');
  if (hasEventCards) reasons.push('dostuff_event_cards');
  const looksLikeDostuffListing = hasListingChrome || hasEventCards;
  const needsAdapter = looksLikeDostuffListing && !hasEventCards && /loading|spinner/i.test(html);
  if (needsAdapter) reasons.push('incomplete_dostuff_render');
  return {
    looksLikeDostuffListing,
    hasEventCards,
    hasListingChrome,
    needsAdapter,
    reasons,
  };
}

function absoluteUrl(href: string | null | undefined, pageUrl: string): string | null {
  if (!href?.trim()) return null;
  try {
    return new URL(href.trim(), pageUrl).href;
  } catch {
    return null;
  }
}

function splitBegin(iso: string | null | undefined): { date: string | null; dateTime: string | null } {
  if (!iso?.trim()) return { date: null, dateTime: null };
  const m = iso
    .trim()
    .match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2})?)([+-]\d{2}:?\d{2}|Z)?)?/);
  if (!m) return { date: null, dateTime: null };
  return {
    date: m[1]!,
    dateTime: m[2] ? `${m[1]}T${m[2]}${m[3] ?? ''}` : iso.trim().includes('T') ? iso.trim() : null,
  };
}

export function extractDostuffEventsFromHtml(html: string, pageUrl: string): DostuffExtractResult {
  const capability = detectDostuffCapability(html, pageUrl);
  const rejectionReasons: string[] = [];
  const events: ExtractedDostuffEvent[] = [];
  const cardRe =
    /<div[^>]*class="[^"]*ds-listing\s+event-card[^"]*"[^>]*>[\s\S]*?(?=<div[^>]*class="[^"]*ds-listing\s+event-card|$)/gi;
  let match: RegExpExecArray | null;
  while ((match = cardRe.exec(html)) !== null) {
    const body = match[0] ?? '';
    const title =
      body.match(/itemprop=["']name["'][^>]*>([^<]+)/i)?.[1]?.trim() ||
      body.match(/class="[^"]*ds-listing-event-title[^"]*"[\s\S]*?<span[^>]*class="[^"]*ds-normalized-string[^"]*"[^>]*>([^<]+)/i)?.[1]?.trim() ||
      body.match(/ds-listing-event-title[\s\S]*?<span[^>]*>([^<]+)/i)?.[1]?.trim() ||
      '';
    if (!title) continue;
    const permalink =
      body.match(/data-permalink=["']([^"']+)["']/i)?.[1] ||
      body.match(/itemprop=["']url["'][^>]*href=["']([^"']+)["']/i)?.[1] ||
      body.match(/href=["'](\/events\/[^"']+)["']/i)?.[1] ||
      null;
    const startRaw =
      body.match(/itemprop=["']startDate["'][^>]*content=["']([^"']+)["']/i)?.[1] || null;
    const begin = splitBegin(startRaw);
    const venue =
      body.match(/itemprop=["']location["'][^>]*>\s*<[^>]+itemprop=["']name["'][^>]*>([^<]+)/i)?.[1]?.trim() ||
      body.match(/itemprop=["']location["'][^>]*>([^<]+)/i)?.[1]?.trim() ||
      body.match(/ds-venue-name[^>]*>([^<]+)/i)?.[1]?.trim() ||
      null;
    const eventUrlRaw = absoluteUrl(permalink, pageUrl);
    if (!eventUrlRaw) continue;
    const eventUrl = stripDostuffTrackingParams(eventUrlRaw);
    const buy =
      body.match(/href=["'](https?:\/\/[^"']*(?:axs|ticketmaster|eventbrite)[^"']*)["']/i)?.[1] ||
      null;
    const ticketOrRsvpUrl = buy ? unwrapAffiliateTicketUrl(buy) : eventUrl;
    events.push({
      externalId: permalink ? `dostuff:${permalink}` : null,
      title,
      startDate: begin.date,
      startDateTime: begin.dateTime,
      endDate: null,
      endDateTime: null,
      venue,
      address: null,
      city: null,
      regionState: null,
      organizer: null,
      eventUrl,
      ticketOrRsvpUrl,
      imageUrl: body.match(/background-image:url\(['"]?([^'")\s]+)/i)?.[1] ?? null,
      evidence: [
        'dostuff_html',
        permalink ? `permalink:${permalink}` : 'permalink:missing',
        begin.date ? `start:${begin.date}` : 'start:unresolved',
        venue ? `venue:${venue}` : 'venue:missing',
      ],
      method: 'dostuff_html',
      verificationState: title && begin.date ? 'verified' : begin.date ? 'partial' : 'unresolved_date',
    });
  }

  const resultContainerRendered =
    /id=["']ds-events-list["']/i.test(html) ||
    /ds-listings\s+ds-listings-list/i.test(html) ||
    /ds-event-listings/i.test(html) ||
    events.length > 0;
  // Empty collection chrome with zero cards ≠ incomplete JS shell.
  const emptyListing = resultContainerRendered && events.length === 0;
  const incompleteRender =
    capability.hasListingChrome && !resultContainerRendered && events.length === 0;

  if (events.length === 0 && emptyListing) rejectionReasons.push('empty_dostuff_listing');
  if (events.length === 0 && incompleteRender) rejectionReasons.push('incomplete_dostuff_render');
  if (events.length === 0 && !emptyListing && !incompleteRender) {
    rejectionReasons.push('dostuff_zero_cards');
  }

  return {
    events,
    method: events.length > 0 ? 'dostuff_html' : 'none',
    rejectionReasons,
    pagination: {
      bounded: true,
      emptyListing,
      incompleteRender,
      hasNextPage: /rel=["']next["']|page=2|Load more/i.test(html),
      resultContainerRendered,
      paginationComplete: true,
    },
    capability,
  };
}

export function stableDostuffFingerprint(ev: ExtractedDostuffEvent): string {
  if (ev.externalId) return `id:${ev.externalId}`;
  return `url:${ev.eventUrl.toLowerCase()}|${ev.startDate ?? ''}|${ev.title.toLowerCase()}`;
}

export function extractDostuffEventsFromJson(
  payload: DoStuffJsonPayload | string,
  pageUrl: string,
): DostuffExtractResult {
  const capability = detectDostuffCapability('', pageUrl);
  try {
    const json: DoStuffJsonPayload =
      typeof payload === 'string' ? (JSON.parse(payload) as DoStuffJsonPayload) : payload;
    const events: ExtractedDostuffEvent[] = [];
    for (const group of json.event_groups ?? []) {
      for (const raw of group.events ?? []) {
        if (raw.past === true) continue;
        const title = String(raw.title ?? '').trim();
        if (!title) continue;
        const permalink = String(raw.permalink ?? '');
        const eventUrlRaw = absoluteUrl(permalink, pageUrl);
        if (!eventUrlRaw) continue;
        const begin = splitBegin(String(raw.begin_time ?? raw.begin_date ?? ''));
        const venueObj = (raw.venue ?? {}) as Record<string, unknown>;
        events.push({
          externalId: raw.id != null ? `dostuff:${raw.id}` : null,
          title,
          startDate: begin.date ?? (typeof raw.begin_date === 'string' ? raw.begin_date : null),
          startDateTime: begin.dateTime,
          endDate: null,
          endDateTime: null,
          venue: typeof venueObj.title === 'string' ? venueObj.title : null,
          address: typeof venueObj.full_address === 'string' ? venueObj.full_address : null,
          city: typeof venueObj.city === 'string' ? venueObj.city : null,
          regionState: typeof venueObj.state === 'string' ? venueObj.state : null,
          organizer: typeof raw.presented_by === 'string' ? raw.presented_by : null,
          eventUrl: stripDostuffTrackingParams(eventUrlRaw),
          ticketOrRsvpUrl:
            typeof raw.buy_url === 'string' ? unwrapAffiliateTicketUrl(String(raw.buy_url)) : eventUrlRaw,
          imageUrl: null,
          evidence: ['dostuff_json', begin.date ? `start:${begin.date}` : 'start:unresolved'],
          method: 'dostuff_json',
          verificationState: begin.date ? 'verified' : 'unresolved_date',
        });
      }
    }
    const totalPages = Number(json.paging?.total_pages ?? 1);
    const currentPage = Number(json.paging?.current_page ?? 1);
    return {
      events,
      method: events.length > 0 ? 'dostuff_json' : 'none',
      rejectionReasons: events.length === 0 ? ['dostuff_json_zero'] : [],
      pagination: {
        bounded: true,
        emptyListing: events.length === 0,
        incompleteRender: false,
        hasNextPage: totalPages > currentPage,
        resultContainerRendered: true,
        paginationComplete: currentPage >= totalPages,
      },
      capability: { ...capability, looksLikeDostuffListing: true, hasEventCards: events.length > 0 },
    };
  } catch {
    return {
      events: [],
      method: 'none',
      rejectionReasons: ['dostuff_json_parse_failed'],
      pagination: {
        bounded: true,
        emptyListing: false,
        incompleteRender: true,
        hasNextPage: false,
        resultContainerRendered: false,
        paginationComplete: false,
      },
      capability,
    };
  }
}
