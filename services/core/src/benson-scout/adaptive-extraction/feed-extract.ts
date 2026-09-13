/**
 * Generic first-party feed extraction (RSS / Atom / JSON Feed).
 * No domain hard-coding. Titles/dates only from feed fields — never invented.
 */

import { createHash } from 'node:crypto';
import type {
  EventListingExtractionMethod,
  ExtractedEventListing,
} from '../event-listing-extract.js';

function hashId(parts: string[]): string {
  return createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 16);
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&#038;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
    const { date, dateTime } = parseDateToYmd(pub);
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
        pub ? `feed_date:${pub}` : 'feed_date:absent',
        `feed_url:${input.feedUrl}`,
      ],
      method,
      verificationState: date ? 'partial' : 'unresolved_date',
      needsTemporalReview: !date,
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
