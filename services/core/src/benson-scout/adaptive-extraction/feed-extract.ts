import { decodeHtmlEntitiesDeterministic } from '../../text-sanitize/sanitize-scraped-text.js';
import { createHash } from 'node:crypto';
import type {
  EventListingExtractionMethod,
  ExtractedEventListing,
} from '../event-listing-extract.js';

function hashId(parts: string[]): string {
  return createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 16);
}

function decodeEntities(value: string): string {
  return decodeHtmlEntitiesDeterministic(
    value
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

function tag(xml: string, name: string): string | null {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decodeEntities(m[1]!) : null;
}

function attr(tagXml: string, name: string): string | null {
  const m = tagXml.match(new RegExp(`${name}=["']([^"']+)["']`, 'i'));
  return m?.[1] ?? null;
}

function parseDateToYmd(raw: string | null): { date: string | null; dateTime: string | null } {
  if (!raw) return { date: null, dateTime: null };
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    const iso = raw.match(/(\d{4}-\d{2}-\d{2})/);
    return { date: iso?.[1] ?? null, dateTime: null };
  }
  const ymd = d.toISOString().slice(0, 10);
  return { date: ymd, dateTime: d.toISOString() };
}

function looksLikeEventFeedItem(title: string, summary: string): boolean {
  const blob = `${title} ${summary}`;
  return (
    /\b(20\d{2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|doors|showtime|tickets?|concert|comedy|performance|tour)\b/i.test(
      blob,
    ) || Boolean(title.trim())
  );
}

/** WordPress "This page X appeared first on Y" is not an event description. */
function isWordPressSyndicationBoilerplate(summary: string): boolean {
  return /appeared first on/i.test(summary) || /^this page\b/i.test(summary.trim());
}

/** Prefer an explicit event date in title/summary over feed pubDate (often publish time). */
function extractEventDateFromText(title: string, summary: string): string | null {
  const blob = `${title} ${summary}`;
  const iso = blob.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
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
    jan: '01',
    feb: '02',
    mar: '03',
    apr: '04',
    jun: '06',
    jul: '07',
    aug: '08',
    sep: '09',
    sept: '09',
    oct: '10',
    nov: '11',
    dec: '12',
  };
  // "September 15, 2026" or "Sep 15 2026"
  const m = blob.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,)?\s+(20\d{2})\b/i,
  );
  if (m) {
    const mo = months[m[1]!.toLowerCase()];
    if (mo) return `${m[3]}-${mo}-${String(m[2]).padStart(2, '0')}`;
  }
  return null;
}

export function extractEventsFromFeedXml(input: {
  xml: string;
  feedUrl: string;
  sourceUrl: string;
  now?: Date;
}): { events: ExtractedEventListing[]; method: EventListingExtractionMethod; notes: string[] } {
  const xml = input.xml ?? '';
  const notes: string[] = [];
  const events: ExtractedEventListing[] = [];

  if (/^\s*\{/.test(xml) && /"version"\s*:\s*"https:\/\/jsonfeed\.org/i.test(xml)) {
    return extractJsonFeed(input);
  }

  const isAtom = /<feed[\s>]/i.test(xml) || /xmlns=["'][^"']*Atom/i.test(xml);
  const method: EventListingExtractionMethod = isAtom ? 'atom_feed' : 'rss_feed';
  const items = isAtom
    ? [...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map((m) => m[0]!)
    : [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((m) => m[0]!);

  if (!items.length) {
    notes.push('feed_no_items');
    return { events, method: isAtom ? 'atom_feed' : 'rss_feed', notes };
  }

  for (const item of items.slice(0, 80)) {
    const title = (isAtom ? tag(item, 'title') : tag(item, 'title')) ?? '';
    if (!title) continue;
    const link =
      (isAtom
        ? attr(item.match(/<link\b[^>]*>/i)?.[0] ?? '', 'href') ?? tag(item, 'id')
        : tag(item, 'link')) ?? input.feedUrl;
    const summary =
      tag(item, 'description') ??
      tag(item, 'summary') ??
      tag(item, 'content') ??
      tag(item, 'content:encoded') ??
      '';
    const pub =
      tag(item, 'pubDate') ??
      tag(item, 'published') ??
      tag(item, 'updated') ??
      tag(item, 'dc:date');
    const pubParsed = parseDateToYmd(pub);
    const fromText = extractEventDateFromText(title, summary);
    const boilerplate = isWordPressSyndicationBoilerplate(summary);
    // Never treat WordPress syndication pubDate as the event start when description is boilerplate.
    const date = fromText ?? (boilerplate ? null : pubParsed.date);
    const dateTime = fromText ? null : boilerplate ? null : pubParsed.dateTime;
    if (!looksLikeEventFeedItem(title, summary)) {
      notes.push(`skip_non_eventish:${title.slice(0, 40)}`);
      continue;
    }
    events.push({
      externalId: hashId(['feed', link, title, date ?? '']),
      title,
      startDate: date,
      startDateTime: dateTime,
      endDate: null,
      endDateTime: null,
      venue: null,
      address: null,
      city: null,
      regionState: null,
      priceText: null,
      isFree: null,
      eventUrl: link,
      ticketOrRsvpUrl: null,
      organizer: null,
      isRecurring: false,
      imageUrl: null,
      sourceUrl: input.sourceUrl,
      evidence: [
        `feed_item:${isAtom ? 'atom' : 'rss'}`,
        fromText ? `event_date_from_text:${fromText}` : 'event_date_from_text:absent',
        pub ? `feed_pubDate:${pub}` : 'feed_pubDate:absent',
        boilerplate ? 'description:wp_syndication_boilerplate' : 'description:present',
        boilerplate && !fromText ? 'start:unresolved_pubDate_not_event' : date ? `start:${date}` : 'start:unresolved',
        `feed_url:${input.feedUrl}`,
      ],
      method,
      verificationState: date ? 'partial' : 'unresolved_date',
      needsTemporalReview: !date || (boilerplate && !fromText),
    });
  }

  notes.push(`feed_items_parsed:${events.length}`);
  return { events, method, notes };
}

function extractJsonFeed(input: {
  xml: string;
  feedUrl: string;
  sourceUrl: string;
}): { events: ExtractedEventListing[]; method: EventListingExtractionMethod; notes: string[] } {
  const notes: string[] = [];
  const events: ExtractedEventListing[] = [];
  try {
    const data = JSON.parse(input.xml) as {
      items?: Array<{
        id?: string;
        url?: string;
        title?: string;
        summary?: string;
        content_text?: string;
        date_published?: string;
        date_modified?: string;
      }>;
    };
    for (const item of data.items ?? []) {
      const title = item.title?.trim();
      if (!title) continue;
      const link = item.url ?? item.id ?? input.feedUrl;
      const { date, dateTime } = parseDateToYmd(item.date_published ?? item.date_modified ?? null);
      events.push({
        externalId: hashId(['jsonfeed', link, title, date ?? '']),
        title,
        startDate: date,
        startDateTime: dateTime,
        endDate: null,
        endDateTime: null,
        venue: null,
        address: null,
        city: null,
        regionState: null,
        priceText: null,
        isFree: null,
        eventUrl: link,
        ticketOrRsvpUrl: null,
        organizer: null,
        isRecurring: false,
        imageUrl: null,
        sourceUrl: input.sourceUrl,
        evidence: [`json_feed_item`, `feed_url:${input.feedUrl}`],
        method: 'json_feed',
        verificationState: date ? 'partial' : 'unresolved_date',
        needsTemporalReview: !date,
      });
    }
  } catch {
    notes.push('json_feed_parse_error');
  }
  notes.push(`json_feed_items:${events.length}`);
  return { events, method: 'json_feed', notes };
}

export function bodyLooksLikeFeed(body: string, contentType?: string | null): boolean {
  if (contentType && /rss|atom|xml|json/i.test(contentType) && /<rss|<feed|"items"\s*:/i.test(body)) {
    return true;
  }
  return /<rss[\s>]|<feed[\s>]|<channel[\s>]|"version"\s*:\s*"https:\/\/jsonfeed\.org/i.test(body);
}
