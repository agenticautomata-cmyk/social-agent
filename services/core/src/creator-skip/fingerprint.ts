import { createHash } from 'node:crypto';
import type { InventoryItem } from '../inventory/normalize.js';

function normalizePart(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Stable fingerprint for a discovery occurrence — changes when date/location/offer materially changes. */
export function computeOccurrenceFingerprint(input: {
  title: string;
  eventDate?: string | null;
  eventEndDate?: string | null;
  locationName?: string | null;
  formattedAddress?: string | null;
  venue?: string | null;
  sourceUrl?: string | null;
  summary?: string | null;
}): string {
  const parts = [
    normalizePart(input.title),
    normalizePart(input.eventDate),
    normalizePart(input.eventEndDate),
    normalizePart(input.locationName ?? input.formattedAddress ?? input.venue),
    normalizePart(input.sourceUrl),
  ];
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 32);
}

export function fingerprintFromInventoryItem(item: InventoryItem): string {
  return computeOccurrenceFingerprint({
    title: item.title,
    eventDate: item.eventDate,
    eventEndDate: item.eventEndDate,
    locationName: item.locationName,
    formattedAddress: item.formattedAddress,
    venue: item.venue,
    sourceUrl: item.sourceUrl,
    summary: item.summary,
  });
}

const EVENT_TITLE_NOISE =
  /\b(concert|concerts|show|shows|live|tickets?|event|events|performance|tour|presents|featuring|feat|at|the|a|an|in|on|kc|kansas city)\b/g;

export function decodeEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&mdash;|&ndash;/g, '-')
    .replace(/&amp;/g, '&')
    .replace(/&quot;|&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

/**
 * Day bucket for matching. Midnight-UTC values are date-only markers from feeds
 * that carry no clock time, so their UTC date is already the intended local day.
 */
function eventDayKey(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const isDateOnly =
    date.getUTCHours() === 0 && date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0;
  if (isDateOnly) return date.toISOString().slice(0, 10);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Title reduced to its distinguishing words — no punctuation, entities, or filler. */
export function coreTitle(title: string): string {
  const cleaned = normalizePart(decodeEntities(title))
    .replace(EVENT_TITLE_NOISE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || normalizePart(decodeEntities(title));
}

function cityKey(input: { locationName?: string | null; formattedAddress?: string | null; venue?: string | null }): string {
  const raw = input.locationName ?? input.formattedAddress ?? input.venue ?? '';
  return normalizePart(raw.split(',')[0] ?? raw);
}

function venueKey(input: { locationName?: string | null; formattedAddress?: string | null; venue?: string | null }): string {
  const venue = normalizePart(input.venue ?? input.locationName ?? '');
  if (!venue) return '';
  const city = cityKey(input);
  if (!city || venue === city || city.includes(venue) || venue.includes(city)) return '';
  return venue;
}

export type SkipMatchIdentity = {
  /** Hash of core title + day + city (+ venue when disambiguating). Same real event, same string. */
  key: string;
  /** Core title tokens, for matching titles that add a venue or subtitle. */
  tokens: string[];
  day: string;
  city: string;
  venue: string;
};

/**
 * Loose identity that survives the same real-world event being ingested twice with
 * different titles and source URLs (e.g. "Don Felder" vs "Don Felder Concert").
 * Only meaningful when the item has an event date — otherwise returns null.
 */
export function computeSkipMatchIdentity(input: {
  title: string;
  eventDate?: string | null;
  locationName?: string | null;
  formattedAddress?: string | null;
  venue?: string | null;
}): SkipMatchIdentity | null {
  const day = eventDayKey(input.eventDate);
  if (!day) return null;
  const core = coreTitle(input.title);
  if (!core) return null;
  const city = cityKey(input);
  const venue = venueKey(input);
  const keyParts = [core, day, city];
  if (venue) keyParts.push(venue);
  return {
    key: createHash('sha256').update(keyParts.join('|')).digest('hex').slice(0, 32),
    tokens: core.split(' ').filter(Boolean),
    day,
    city,
    venue,
  };
}

export function computeSkipMatchKey(input: {
  title: string;
  eventDate?: string | null;
  locationName?: string | null;
  formattedAddress?: string | null;
  venue?: string | null;
}): string | null {
  return computeSkipMatchIdentity(input)?.key ?? null;
}

/**
 * Same day, same city, and one title's core tokens contain the other's — the case
 * where one feed says "Don Felder" and another says "Don Felder LIVE at Ameristar".
 * Requires two tokens so generic one-word titles can't swallow a whole day.
 */
export function skipIdentitiesMatch(a: SkipMatchIdentity, b: SkipMatchIdentity): boolean {
  if (a.key === b.key) return true;
  if (a.day !== b.day || a.city !== b.city) return false;
  if (a.venue && b.venue && a.venue !== b.venue) return false;

  const [shorter, longer] = a.tokens.length <= b.tokens.length ? [a, b] : [b, a];
  if (shorter.tokens.length < 2) return false;

  const longerTokens = new Set(longer.tokens);
  return shorter.tokens.every((token) => longerTokens.has(token));
}
