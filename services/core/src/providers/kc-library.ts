import { extractLocationClues } from './reddit.js';

export type KcLibrarySourceConfig = {
  calendarUrl?: string;
  limit?: number;
  maxPages?: number;
};

export type NormalizedKcLibraryEvent = {
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

const DEFAULT_USER_AGENT = 'Benson/0.1 (Kellie Assistant; +https://github.com/anthonyonazure/social-agent)';
const DEFAULT_CALENDAR_URL = 'https://kclibrary.org/calendar';
const BASE_URL = 'https://kclibrary.org';

const BRANCH_ADDRESSES: Record<string, string> = {
  'central library': '14 West 10th Street, Kansas City, MO 64105',
  'plaza branch': '4801 Main Street, Kansas City, MO 64112',
  'north-east branch': '6000 Wilson Road, Kansas City, MO 64123',
  'ruiz branch': '2017 West Pennway, Kansas City, MO 64108',
  'southeast branch': '6242 Swope Parkway, Kansas City, MO 64132',
  'waldo branch': '201 East 75th Street, Kansas City, MO 64114',
  'westport branch': '118 Westport Road, Kansas City, MO 64111',
  'bluford branch': '3050 Prospect Avenue, Kansas City, MO 64128',
  'trails west branch': '11401 East 23rd Street, Independence, MO 64052',
  'sugar creek branch': '102 S Sterling Avenue, Sugar Creek, MO 64054',
};

export function parseKcLibrarySourceConfig(raw: unknown): KcLibrarySourceConfig {
  const c = (raw ?? {}) as Record<string, unknown>;
  return {
    calendarUrl: typeof c.calendarUrl === 'string' ? c.calendarUrl : DEFAULT_CALENDAR_URL,
    limit: typeof c.limit === 'number' ? c.limit : 30,
    maxPages: typeof c.maxPages === 'number' ? c.maxPages : 3,
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

function decodeHtmlEntities(raw: string): string {
  return raw
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function externalIdFromPath(path: string): string {
  return path.replace(/^\/+|\/+$/g, '') || path;
}

function parseListingLinks(html: string): Array<{ path: string; title: string }> {
  const rows = html.match(/<div class="views-row">([\s\S]*?)<\/article>/g) ?? [];
  const items: Array<{ path: string; title: string }> = [];

  for (const row of rows) {
    const titleMatch = row.match(/<span>([^<]+)<\/span>\s*<\/a>\s*<\/h3>/);
    const linkMatch = row.match(/href="(\/calendar\/[^"?#]+)"/);
    if (!titleMatch || !linkMatch) continue;
    const path = linkMatch[1]!;
    if (path === '/calendar/online') continue;
    items.push({ path, title: decodeHtmlEntities(stripHtml(titleMatch[1]!)) });
  }

  return items;
}

function parseEventDetail(html: string, fallbackTitle: string, eventUrl: string): NormalizedKcLibraryEvent {
  const ogTitle = html.match(/property="og:title" content="([^"]+)"/)?.[1];
  const h1Title = html.match(
    /<h1>\s*<span>([^<]+)<\/span>\s*<\/h1>/,
  )?.[1];
  const title = stripHtml(ogTitle ?? h1Title ?? fallbackTitle);

  const sidebarMatch = html.match(/<section class="event-sidebar">([\s\S]*?)<\/section>/);
  const sidebar = sidebarMatch?.[1] ?? html;
  const times = [...sidebar.matchAll(/<time datetime="([^"]+)"/g)].map((m) => m[1]!);
  const eventStartsAt = times[0] ? new Date(times[0]) : null;
  const eventEndsAt = times[1] ? new Date(times[1]) : null;

  const branchMatch =
    sidebar.match(
      /event-sidebar__details_date_location_branch_wrapper_branch[^>]*>\s*<a[^>]*>([^<]+)<\/a>/,
    ) ??
    sidebar.match(
      /field--name-field-location[\s\S]*?field__item[^>]*>\s*<a[^>]*>([^<]+)<\/a>/,
    );
  const venue = branchMatch?.[1]?.trim() ?? null;

  let address: string | null = null;
  const icalMatch = html.match(/data:text\/calendar[^"]*LOCATION%3A([^%&"]+)/);
  if (icalMatch?.[1]) {
    address = decodeURIComponent(icalMatch[1].replace(/\+/g, ' '));
  }
  if (venue) {
    address = BRANCH_ADDRESSES[venue.toLowerCase()] ?? address;
  }

  const bodyMatch =
    html.match(/field--name-field-event-description[\s\S]*?field__item[^>]*>([\s\S]*?)<\/div>\s*<\/div>/) ??
    html.match(/field--name-body[\s\S]*?field__item[^>]*>([\s\S]*?)<\/div>/);
  const body = bodyMatch ? stripHtml(bodyMatch[1]!) : '';

  const categoryMatch = html.match(
    /field--name-field-event-category[\s\S]*?field__item[^>]*>\s*<a[^>]*>([^<]+)<\/a>/,
  );
  const eventCategory = categoryMatch?.[1]?.trim().toLowerCase().replace(/\s+/g, '_') ?? 'library_program';

  const neighborhood = inferNeighborhood(title, body, venue, address);
  const locationClues = [
    ...new Set([
      ...(neighborhood ? [neighborhood] : []),
      ...(venue ? [venue.toLowerCase()] : []),
      ...(address ? [address] : []),
      ...extractLocationClues(title, body),
      'kansas city',
      'library',
    ]),
  ];

  const path = new URL(eventUrl).pathname;

  return {
    externalId: externalIdFromPath(path),
    title,
    body,
    url: eventUrl,
    publishedAt: eventStartsAt ?? new Date(),
    eventStartsAt: eventStartsAt && !Number.isNaN(eventStartsAt.getTime()) ? eventStartsAt : null,
    eventEndsAt: eventEndsAt && !Number.isNaN(eventEndsAt.getTime()) ? eventEndsAt : null,
    venue,
    address,
    neighborhood,
    freeEventFlag: true,
    eventCategory,
    locationClues,
    locationHint: venue ?? neighborhood ?? address ?? 'kansas city',
  };
}

function inferNeighborhood(
  title: string,
  body: string,
  venue: string | null,
  address: string | null,
): string | null {
  const text = `${title} ${body} ${venue ?? ''} ${address ?? ''}`.toLowerCase();
  if (text.includes('crossroads')) return 'crossroads';
  if (text.includes('plaza')) return 'country club plaza';
  if (text.includes('northeast') || text.includes('north-east')) return 'northeast';
  if (text.includes('westport')) return 'westport';
  if (text.includes('southeast') || text.includes('swope')) return 'southeast';
  if (text.includes('waldo')) return 'waldo';
  if (text.includes('downtown') || text.includes('10th street')) return 'downtown';
  const clues = extractLocationClues(title, body);
  return clues[0] ?? null;
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': DEFAULT_USER_AGENT,
      Accept: 'text/html',
    },
  });
  if (!res.ok) {
    throw new Error(`kc library fetch failed: ${res.status} ${res.statusText} (${url})`);
  }
  return res.text();
}

export async function loadKcLibraryEvents(config: KcLibrarySourceConfig): Promise<NormalizedKcLibraryEvent[]> {
  const calendarUrl = config.calendarUrl ?? DEFAULT_CALENDAR_URL;
  const limit = Math.min(config.limit ?? 30, 50);
  const maxPages = config.maxPages ?? 3;

  const listingItems: Array<{ path: string; title: string }> = [];

  for (let page = 0; page < maxPages && listingItems.length < limit; page++) {
    const pageUrl = page === 0 ? calendarUrl : `${calendarUrl}?page=${page}`;
    const html = await fetchHtml(pageUrl);
    const items = parseListingLinks(html);
    if (items.length === 0) break;
    listingItems.push(...items);
  }

  const unique = new Map<string, { path: string; title: string }>();
  for (const item of listingItems) {
    if (!unique.has(item.path)) unique.set(item.path, item);
  }

  const results: NormalizedKcLibraryEvent[] = [];
  for (const item of [...unique.values()].slice(0, limit)) {
    const eventUrl = `${BASE_URL}${item.path}`;
    const detailHtml = await fetchHtml(eventUrl);
    results.push(parseEventDetail(detailHtml, item.title, eventUrl));
  }

  return results;
}
