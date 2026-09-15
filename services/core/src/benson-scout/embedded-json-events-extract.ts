/**
 * Generalized embedded JSON / hydration catalog extraction.
 *
 * Finds event-like objects inside `__NEXT_DATA__`, Sitecore/JSS component props,
 * and similar first-party hydration blobs. No publisher-domain hard-coding —
 * structural fields only (title/name + start epoch/ISO + optional venue/url).
 */

import { createHash } from 'node:crypto';
import { decodeHtmlEntitiesDeterministic } from '../text-sanitize/sanitize-scraped-text.js';
import { localYmdInTimeZone } from './event-listing-outcomes.js';
import type { ExtractedEventListing, EventListingExtractionMethod } from './event-listing-extract.js';

const DEFAULT_TZ = 'America/Chicago';

function hashId(parts: string[]): string {
  return createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 16);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = decodeHtmlEntitiesDeterministic(value).replace(/\s+/g, ' ').trim();
  return cleaned || null;
}

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim())) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Project an epoch (sec or ms) or ISO string to local YMD + optional clock in site TZ. */
export function wallDateFromInstant(
  raw: unknown,
  timeZone = DEFAULT_TZ,
): { date: string | null; dateTime: string | null; clock: string | null } {
  let ms: number | null = null;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    ms = raw < 1e12 ? Math.round(raw * 1000) : Math.round(raw);
  } else if (typeof raw === 'string' && raw.trim()) {
    if (/^\d{4}-\d{2}-\d{2}/.test(raw.trim())) {
      const m = raw.trim().match(/^(\d{4}-\d{2}-\d{2})(?:[T\s](\d{2}:\d{2}(?::\d{2})?))?/);
      if (m) {
        return {
          date: m[1]!,
          dateTime: m[2] ? `${m[1]}T${m[2]!.length === 5 ? `${m[2]}:00` : m[2]}` : null,
          clock: m[2] ? (m[2]!.length === 5 ? `${m[2]}:00` : m[2]!) : null,
        };
      }
    }
    const parsed = Date.parse(raw);
    if (!Number.isNaN(parsed)) ms = parsed;
  }
  if (ms == null) return { date: null, dateTime: null, clock: null };

  const date = localYmdInTimeZone(new Date(ms), timeZone);
  const clockParts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(ms));
  const get = (type: string) => clockParts.find((p) => p.type === type)?.value ?? '00';
  const clock = `${get('hour')}:${get('minute')}:${get('second')}`;
  const midnight = clock === '00:00:00';
  return {
    date,
    dateTime: midnight ? null : `${date}T${clock}`,
    clock: midnight ? null : clock,
  };
}

function titleOf(obj: Record<string, unknown>): string | null {
  return (
    str(obj.title) ||
    str(obj.name) ||
    str(obj.long_title) ||
    str(obj.short_title) ||
    str(obj.eventTitle) ||
    str(obj.event_name) ||
    null
  );
}

function urlOf(obj: Record<string, unknown>, pageUrl: string): string | null {
  const raw =
    str(obj.url) ||
    str(obj.event_url) ||
    str(obj.eventUrl) ||
    str(obj.link) ||
    str(obj.href) ||
    null;
  if (!raw) return null;
  try {
    return new URL(raw, pageUrl).href;
  } catch {
    return null;
  }
}

function venueOf(obj: Record<string, unknown>): string | null {
  return (
    str(obj.venue_name) ||
    str(obj.venueName) ||
    str(obj.venue) ||
    str(obj.location_name) ||
    str(obj.property_name) ||
    null
  );
}

function startRawOf(obj: Record<string, unknown>): unknown {
  return (
    obj.event_start ??
    obj.eventStart ??
    obj.startDate ??
    obj.start_date ??
    obj.start ??
    obj.startTime ??
    obj.start_time ??
    null
  );
}

function endRawOf(obj: Record<string, unknown>): unknown {
  return (
    obj.event_end ??
    obj.eventEnd ??
    obj.endDate ??
    obj.end_date ??
    obj.end ??
    obj.endTime ??
    obj.end_time ??
    null
  );
}

function looksLikeEventObject(obj: Record<string, unknown>): boolean {
  const title = titleOf(obj);
  if (!title || title.length < 2) return false;
  const start = startRawOf(obj);
  if (start == null || start === '') return false;
  // Avoid nav/menu blobs: require at least one eventish key.
  const keys = Object.keys(obj).join('|').toLowerCase();
  return /event_start|eventstart|startdate|start_date|event_url|venue_name|venuename|event_end/.test(
    keys,
  );
}

function collectEventArrays(root: unknown, out: unknown[][], depth = 0): void {
  if (depth > 12 || root == null) return;
  if (Array.isArray(root)) {
    if (root.length >= 2) {
      const sample = root.slice(0, 8).map(asRecord).filter(Boolean) as Record<string, unknown>[];
      const eventish = sample.filter(looksLikeEventObject).length;
      if (eventish >= Math.min(2, sample.length) && eventish / Math.max(sample.length, 1) >= 0.5) {
        out.push(root);
      }
    }
    for (const item of root.slice(0, 40)) collectEventArrays(item, out, depth + 1);
    return;
  }
  const rec = asRecord(root);
  if (!rec) return;
  for (const [key, value] of Object.entries(rec)) {
    if (/initialevents|events|eventlist|upcomingevents|calendaritems/i.test(key) && Array.isArray(value)) {
      collectEventArrays(value, out, depth + 1);
    } else if (typeof value === 'object' && value) {
      collectEventArrays(value, out, depth + 1);
    }
  }
}

function parseNextDataJson(html: string): unknown | null {
  const m = html.match(
    /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  if (!m?.[1]) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

function mapEventObject(
  obj: Record<string, unknown>,
  pageUrl: string,
  timeZone: string,
): ExtractedEventListing | null {
  const title = titleOf(obj);
  if (!title) return null;
  const start = wallDateFromInstant(startRawOf(obj), timeZone);
  if (!start.date) return null;
  const end = wallDateFromInstant(endRawOf(obj), timeZone);
  const eventUrl = urlOf(obj, pageUrl);
  const venue = venueOf(obj);
  const address = str(obj.location_address) || str(obj.address) || null;
  const image =
    str(asRecord(obj.teaser_image)?.url) ||
    str(asRecord(obj.main_image_field)?.url) ||
    str(obj.image) ||
    str(obj.imageUrl) ||
    null;
  const tz = str(obj.timezone) || str(obj.timeZone) || timeZone;
  const externalId =
    str(obj.id) ||
    str(obj.source_id) ||
    str(obj.page_id) ||
    hashId(['embedded', title, start.date, eventUrl ?? '']);

  const row: ExtractedEventListing = {
    externalId: `embedded:${externalId}`,
    title,
    startDate: start.date,
    startDateTime: start.dateTime,
    endDate: end.date && end.date !== start.date ? end.date : null,
    endDateTime: end.dateTime,
    venue,
    address,
    city: null,
    regionState: null,
    priceText: null,
    isFree: null,
    eventUrl,
    ticketOrRsvpUrl: eventUrl,
    organizer: null,
    isRecurring: false,
    imageUrl: image,
    sourceUrl: pageUrl,
    evidence: [
      'embedded_json_events',
      `tz:${tz}`,
      start.date ? `start:${start.date}` : 'start:unresolved',
      start.clock ? `start_time:${start.clock}` : 'start_time:unpublished_or_midnight',
      venue ? `venue:${venue}` : 'venue:unpublished',
      eventUrl ? 'detail_url:present' : 'detail_url:missing',
    ],
    method: 'embedded_json_events',
    verificationState: title && start.date && (eventUrl || venue) ? 'verified' : 'partial',
    platform: 'embedded_json',
    listingRole: 'performance',
    productionTitle: title,
    productionId: externalId,
    productionGroupKey: eventUrl || externalId,
    runStartDate: start.date,
    runEndDate: end.date && end.date !== start.date ? end.date : start.date,
  };
  return row;
}

export type EmbeddedJsonExtractResult = {
  events: ExtractedEventListing[];
  method: EventListingExtractionMethod | 'none';
  notes: string[];
  arrayCount: number;
};

/**
 * Extract upcoming/past listings from first-party hydration JSON embedded in HTML.
 */
export function extractFromEmbeddedJsonEvents(
  html: string,
  pageUrl: string,
  opts?: { timeZone?: string },
): EmbeddedJsonExtractResult {
  const notes: string[] = [];
  const timeZone = opts?.timeZone || DEFAULT_TZ;
  const roots: unknown[] = [];
  const next = parseNextDataJson(html);
  if (next) {
    roots.push(next);
    notes.push('next_data:present');
  }

  // Also scan large JSON script blobs that look like event catalogs.
  for (const m of html.matchAll(
    /<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    const body = m[1]?.trim() ?? '';
    if (body.length < 200 || body.length > 2_000_000) continue;
    if (!/event_start|startDate|"events"/i.test(body)) continue;
    try {
      roots.push(JSON.parse(body));
      notes.push('application_json:present');
    } catch {
      /* ignore */
    }
  }

  if (!roots.length) {
    return { events: [], method: 'none', notes: ['embedded_json:absent'], arrayCount: 0 };
  }

  const arrays: unknown[][] = [];
  for (const root of roots) collectEventArrays(root, arrays);
  const events: ExtractedEventListing[] = [];
  const seen = new Set<string>();
  for (const arr of arrays) {
    for (const item of arr) {
      const rec = asRecord(item);
      if (!rec || !looksLikeEventObject(rec)) continue;
      const mapped = mapEventObject(rec, pageUrl, timeZone);
      if (!mapped) continue;
      const key = `${mapped.title}|${mapped.startDate}|${mapped.eventUrl ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      events.push(mapped);
    }
  }

  if (!events.length) {
    notes.push('embedded_json:zero_event_arrays');
    return { events: [], method: 'none', notes, arrayCount: arrays.length };
  }

  notes.push(`embedded_json_arrays:${arrays.length}`, `embedded_json_events:${events.length}`);
  return {
    events,
    method: 'embedded_json_events',
    notes,
    arrayCount: arrays.length,
  };
}

export function htmlHasEmbeddedJsonEventCatalog(html: string): boolean {
  if (/__NEXT_DATA__/i.test(html) && /initialEvents|"event_start"/i.test(html)) return true;
  if (/<script[^>]*type=["']application\/json["'][^>]*>[\s\S]*?(?:event_start|startDate)[\s\S]*?<\/script>/i.test(html)) {
    return true;
  }
  return false;
}
