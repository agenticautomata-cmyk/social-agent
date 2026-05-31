import { extractLocationClues } from './reddit.js';

export type KcParksSourceConfig = {
  apiUrl?: string;
  horizonDays?: number;
  limit?: number;
  maxPages?: number;
};

export type NormalizedKcParksEvent = {
  externalId: string;
  title: string;
  body: string;
  url: string;
  publishedAt: Date;
  eventStartsAt: Date | null;
  eventEndsAt: Date | null;
  venue: string | null;
  address: string | null;
  neighborhood: string | null;
  freeEventFlag: boolean;
  eventCategory: string | null;
  locationClues: string[];
  locationHint: string | null;
};

type TecVenue = {
  venue?: string;
  url?: string;
  address?: string;
  city?: string;
  province?: string;
  zip?: string;
};

type TecEvent = {
  id?: number;
  title?: string;
  description?: string;
  url?: string;
  slug?: string;
  start_date?: string;
  end_date?: string;
  cost?: string;
  ticketed?: boolean;
  venue?: TecVenue | TecVenue[] | null;
  categories?: Array<{ name?: string; slug?: string }>;
};

const DEFAULT_USER_AGENT = 'Benson/0.1 (Kellie Assistant; +https://github.com/anthonyonazure/social-agent)';
const DEFAULT_API_URL = 'https://kcparks.org/wp-json/tribe/events/v1/events';

const PAID_VENUE_RE = /starlight|ticketmaster|t-mobile center|kauffman|arvest bank theatre/i;

export function parseKcParksSourceConfig(raw: unknown): KcParksSourceConfig {
  const c = (raw ?? {}) as Record<string, unknown>;
  return {
    apiUrl: typeof c.apiUrl === 'string' ? c.apiUrl : DEFAULT_API_URL,
    horizonDays: typeof c.horizonDays === 'number' ? c.horizonDays : 90,
    limit: typeof c.limit === 'number' ? c.limit : 50,
    maxPages: typeof c.maxPages === 'number' ? c.maxPages : 5,
  };
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function venuesFromEvent(event: TecEvent): TecVenue[] {
  const v = event.venue;
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function formatAddress(venue: TecVenue): string | null {
  const parts = [venue.address, venue.city, venue.province, venue.zip].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}

function primaryVenue(event: TecEvent): TecVenue | null {
  const venues = venuesFromEvent(event);
  return venues[0] ?? null;
}

function parseEventDate(raw: string | undefined): Date | null {
  if (!raw) return null;
  const d = new Date(raw.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d;
}

function inferNeighborhood(title: string, body: string, venue: TecVenue | null): string | null {
  const text = `${title} ${body} ${venue?.venue ?? ''} ${venue?.address ?? ''}`.toLowerCase();
  const clues = extractLocationClues(title, body);
  const neighborhoodHints = [
    'crossroads',
    'historic northeast',
    'northeast',
    'plaza',
    'westport',
    'brookside',
    'swope',
    'northland',
    'midtown',
    'downtown',
    'river market',
    '18th and vine',
  ];
  for (const hint of neighborhoodHints) {
    if (text.includes(hint) || clues.some((c) => c.includes(hint))) return hint;
  }
  return clues[0] ?? null;
}

export function isFreeParkEvent(event: TecEvent): boolean {
  const title = event.title ?? '';
  const body = stripHtml(event.description ?? '');
  const text = `${title} ${body}`.toLowerCase();

  if (/\bfree\b/.test(text)) return true;
  const cost = (event.cost ?? '').toLowerCase();
  if (cost === 'free' || cost === '0') return true;

  const venues = venuesFromEvent(event);
  const venueText = venues
    .map((v) => `${v.venue ?? ''} ${v.url ?? ''} ${v.address ?? ''}`)
    .join(' ')
    .toLowerCase();
  if (PAID_VENUE_RE.test(venueText + text)) return false;
  if (event.ticketed) return false;

  if (venues.some((v) => (v.url ?? '').includes('kcparks.org/venue/'))) return true;

  return false;
}

function inferEventCategory(categories: Array<{ name?: string; slug?: string }> | undefined): string | null {
  if (!categories?.length) return null;
  return categories[0]?.slug ?? categories[0]?.name?.toLowerCase().replace(/\s+/g, '_') ?? null;
}

export function normalizeKcParksEvent(event: TecEvent): NormalizedKcParksEvent {
  const title = stripHtml(event.title ?? '(untitled park event)');
  const body = stripHtml(event.description ?? '');
  const venueObj = primaryVenue(event);
  const venue = venueObj?.venue ?? null;
  const address = venueObj ? formatAddress(venueObj) : null;
  const neighborhood = inferNeighborhood(title, body, venueObj);
  const eventStartsAt = parseEventDate(event.start_date);
  const eventEndsAt = parseEventDate(event.end_date);

  const locationClues = [
    ...new Set([
      ...(neighborhood ? [neighborhood] : []),
      ...(address ? [address] : []),
      ...extractLocationClues(title, body),
      'kansas city',
      'kc parks',
    ]),
  ];

  return {
    externalId: event.slug ?? String(event.id ?? event.url ?? title),
    title,
    body,
    url: event.url ?? `https://kcparks.org/event/${event.slug ?? event.id}`,
    publishedAt: eventStartsAt ?? new Date(),
    eventStartsAt,
    eventEndsAt,
    venue,
    address,
    neighborhood,
    freeEventFlag: true,
    eventCategory: inferEventCategory(event.categories),
    locationClues,
    locationHint: neighborhood ?? venue ?? address ?? 'kansas city',
  };
}

async function fetchEventsPage(
  apiUrl: string,
  startDate: string,
  page: number,
  perPage: number,
): Promise<{ events: TecEvent[]; totalPages: number }> {
  const url = new URL(apiUrl);
  url.searchParams.set('start_date', startDate);
  url.searchParams.set('per_page', String(perPage));
  url.searchParams.set('page', String(page));

  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': DEFAULT_USER_AGENT, Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`kc parks events fetch failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as {
    events?: TecEvent[];
    total_pages?: number;
  };
  return {
    events: data.events ?? [],
    totalPages: data.total_pages ?? 1,
  };
}

export async function loadKcParksEvents(config: KcParksSourceConfig): Promise<NormalizedKcParksEvent[]> {
  const apiUrl = config.apiUrl ?? DEFAULT_API_URL;
  const horizonDays = config.horizonDays ?? 90;
  const limit = Math.min(config.limit ?? 50, 100);
  const maxPages = config.maxPages ?? 5;

  const start = new Date();
  const startDate = start.toISOString().slice(0, 10);
  const horizonEnd = new Date(start.getTime() + horizonDays * 24 * 60 * 60 * 1000);

  const normalized: NormalizedKcParksEvent[] = [];
  let page = 1;

  while (page <= maxPages && normalized.length < limit) {
    const { events, totalPages } = await fetchEventsPage(apiUrl, startDate, page, 50);
    if (events.length === 0) break;

    for (const event of events) {
      if (!isFreeParkEvent(event)) continue;
      const item = normalizeKcParksEvent(event);
      if (item.eventStartsAt && item.eventStartsAt > horizonEnd) continue;
      normalized.push(item);
      if (normalized.length >= limit) break;
    }

    if (page >= totalPages) break;
    page++;
  }

  return normalized.slice(0, limit);
}
