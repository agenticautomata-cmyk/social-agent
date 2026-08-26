/** Structured Event extraction from JSON-LD / schema.org (no LLM). */

export const JSONLD_EVENT_TYPES = new Set([
  'event',
  'musicevent',
  'theaterevent',
  'screeningevent',
  'educationevent',
  'sportsevent',
  'comedyevent',
  'danceevent',
  'festival',
  'literaryevent',
  'visualartsevent',
  'childrensevent',
  'socialevent',
  'businessevent',
  'exhibitionevent',
]);

export const JSONLD_ARTICLE_TYPES = new Set([
  'article',
  'newsarticle',
  'blogposting',
  'reportage',
  'collectionpage',
  'itemlist',
]);

export type JsonLdEvent = {
  name: string;
  startDate: string | null;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  venue: string | null;
  city: string | null;
  address: string | null;
  url: string | null;
  description: string | null;
  publisher: string | null;
};

export type JsonLdPageGraph = {
  events: JsonLdEvent[];
  schemaTypes: string[];
  hasArticleSchema: boolean;
  hasEventSchema: boolean;
};

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function typeNames(raw: unknown): string[] {
  return asArray(raw as string | string[])
    .map((t) => String(t).split('/').pop()?.toLowerCase() ?? '')
    .filter(Boolean);
}

function textOf(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (value && typeof value === 'object' && 'name' in value) {
    const name = (value as { name?: unknown }).name;
    if (typeof name === 'string' && name.trim()) return name.trim();
  }
  return null;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Midnight JSON-LD is a date-only placeholder; other clocks stay intact. */
export function isTrustworthyListingClock(clockHms: string | null | undefined): boolean {
  const m = (clockHms ?? '').trim().match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return false;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  const second = Number(m[3] ?? '0');
  if (!Number.isFinite(hour) || hour > 23 || minute > 59 || second > 59) return false;
  if (hour === 0 && minute === 0 && second === 0) return false;
  return true;
}

function splitDateTime(raw: string | null): { date: string | null; time: string | null } {
  if (!raw?.trim()) return { date: null, time: null };
  const value = raw.trim();
  const iso = value.match(
    /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/i,
  );
  if (iso) {
    const date = iso[1]!;
    if (!iso[2]) return { date, time: null };
    const time = `${iso[2]}:${iso[3]}:${iso[4] ?? '00'}`;
    if (!isTrustworthyListingClock(time)) return { date, time: null };
    return { date, time };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return { date: value, time: null };
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return { date: null, time: null };
  const d = new Date(parsed);
  const date = d.toISOString().slice(0, 10);
  const hasClock = /T\d{2}:\d{2}|\d{1,2}:\d{2}\s*(am|pm)/i.test(value);
  const time = hasClock
    ? `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
    : null;
  if (!isTrustworthyListingClock(time)) return { date, time: null };
  return { date, time };
}

function placeOf(location: unknown): { venue: string | null; city: string | null; address: string | null } {
  if (!location) return { venue: null, city: null, address: null };
  const loc = asArray(location)[0] as Record<string, unknown> | string | undefined;
  if (typeof loc === 'string') return { venue: loc.trim() || null, city: null, address: null };
  if (!loc || typeof loc !== 'object') return { venue: null, city: null, address: null };
  const addr = (loc.address ?? null) as Record<string, unknown> | string | null;
  const city =
    (typeof addr === 'object' && addr && typeof addr.addressLocality === 'string' && addr.addressLocality) ||
    (typeof loc.addressLocality === 'string' && loc.addressLocality) ||
    null;
  const street =
    typeof addr === 'object' && addr && typeof addr.streetAddress === 'string' ? addr.streetAddress : null;
  const region =
    typeof addr === 'object' && addr && typeof addr.addressRegion === 'string' ? addr.addressRegion : null;
  const address =
    typeof addr === 'string'
      ? addr
      : [street, city, region].filter(Boolean).join(', ') || null;
  return {
    venue: textOf(loc.name) ?? textOf(loc),
    city: city?.trim() || null,
    address,
  };
}

function eventFromNode(node: Record<string, unknown>): JsonLdEvent | null {
  const types = typeNames(node['@type']);
  if (!types.some((t) => JSONLD_EVENT_TYPES.has(t))) return null;
  const name = textOf(node.name);
  if (!name) return null;
  const start = splitDateTime(typeof node.startDate === 'string' ? node.startDate : null);
  const end = splitDateTime(typeof node.endDate === 'string' ? node.endDate : null);
  const place = placeOf(node.location);
  const publisher =
    textOf((node.publisher as Record<string, unknown> | undefined)?.name) ||
    textOf(node.organizer) ||
    null;
  return {
    name,
    startDate: start.date,
    endDate: end.date,
    startTime: start.time,
    endTime: end.time,
    venue: place.venue,
    city: place.city,
    address: place.address,
    url: typeof node.url === 'string' ? node.url.trim() : null,
    description: typeof node.description === 'string' ? node.description.trim().slice(0, 800) : null,
    publisher,
  };
}

function addOneCalendarDay(ymd: string): string | null {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const utc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1);
  return new Date(utc).toISOString().slice(0, 10);
}

/**
 * Compose JSON-LD start/end into opportunity date strings.
 * Preserves wall clocks; bumps end date +1 when same-day end clock is before start (overnight).
 * Date-only values stay date-only (no invented clock).
 */
export function composeJsonLdOpportunityDates(ev: Pick<JsonLdEvent, 'startDate' | 'endDate' | 'startTime' | 'endTime'>): {
  eventDate: string | null;
  eventEndDate: string | null;
} {
  const eventDate = ev.startTime && ev.startDate ? `${ev.startDate}T${ev.startTime}` : ev.startDate;
  if (!ev.endDate) return { eventDate, eventEndDate: null };
  if (!ev.endTime) return { eventDate, eventEndDate: ev.endDate };

  let endDate = ev.endDate;
  if (
    ev.startDate &&
    ev.startTime &&
    endDate === ev.startDate &&
    ev.endTime < ev.startTime
  ) {
    endDate = addOneCalendarDay(endDate) ?? endDate;
  }
  return { eventDate, eventEndDate: `${endDate}T${ev.endTime}` };
}

function walk(node: unknown, events: JsonLdEvent[], types: Set<string>): void {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const child of node) walk(child, events, types);
    return;
  }
  if (typeof node !== 'object') return;
  const rec = node as Record<string, unknown>;
  for (const t of typeNames(rec['@type'])) types.add(t);
  const asEvent = eventFromNode(rec);
  if (asEvent) events.push(asEvent);
  if (rec['@graph']) walk(rec['@graph'], events, types);
  if (rec.itemListElement) {
    for (const item of asArray(rec.itemListElement)) {
      const recItem = item as Record<string, unknown>;
      walk(recItem.item ?? recItem, events, types);
    }
  }
  for (const key of ['mainEntity', 'about', 'mentions', 'hasPart', 'event']) {
    if (rec[key]) walk(rec[key], events, types);
  }
}

function parseJsonCandidate(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function extractJsonLdBlocks(input: string): unknown[] {
  const blocks: unknown[] = [];
  const scriptRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = scriptRe.exec(input)) !== null) {
    const parsed = parseJsonCandidate(match[1]!.trim());
    if (parsed) blocks.push(parsed);
  }
  if (blocks.length > 0) return blocks;

  const objectRe = /\{[\s\S]*?"@type"\s*:\s*"([^"]+)"[\s\S]*?\}/g;
  while ((match = objectRe.exec(input)) !== null) {
    const parsed = parseJsonCandidate(match[0]);
    if (parsed) blocks.push(parsed);
    if (blocks.length >= 24) break;
  }
  return blocks;
}

export function parseJsonLdPageGraph(input: string | null | undefined): JsonLdPageGraph {
  const events: JsonLdEvent[] = [];
  const types = new Set<string>();
  if (!input?.trim()) {
    return { events, schemaTypes: [], hasArticleSchema: false, hasEventSchema: false };
  }
  for (const block of extractJsonLdBlocks(input)) {
    walk(block, events, types);
  }
  const seen = new Set<string>();
  const unique = events.filter((ev) => {
    const key = `${ev.name.toLowerCase()}|${ev.startDate ?? ''}|${ev.venue ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const schemaTypes = [...types];
  return {
    events: unique,
    schemaTypes,
    hasArticleSchema: schemaTypes.some((t) => JSONLD_ARTICLE_TYPES.has(t)),
    hasEventSchema: unique.length > 0 || schemaTypes.some((t) => JSONLD_EVENT_TYPES.has(t)),
  };
}
