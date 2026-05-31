import { extractLocationClues } from './reddit.js';

export type RestaurantWeekSourceConfig = {
  feedUrl?: string;
  limit?: number;
  /** KCRW season start (ISO date), e.g. 2026-01-09 */
  seasonStart?: string;
  /** KCRW season end (ISO date), e.g. 2026-01-18 */
  seasonEnd?: string;
};

export type NormalizedRestaurantWeekItem = {
  externalId: string;
  title: string;
  body: string;
  url: string;
  publishedAt: Date;
  venue: string | null;
  address: string | null;
  region: string | null;
  eventStartsAt: Date | null;
  eventEndsAt: Date | null;
  diningCategory: string;
  openingFlag: boolean;
  restaurantWeekFlag: boolean;
  menuTypes: string[];
  locationClues: string[];
  locationHint: string | null;
};

const DEFAULT_USER_AGENT = 'Benson/0.1 (Kellie Assistant; +https://github.com/anthonyonazure/social-agent)';
const DEFAULT_FEED_URL = 'https://www.kcrestaurantweek.com/rss.xml';
const DEFAULT_SEASON_START = '2026-01-09';
const DEFAULT_SEASON_END = '2026-01-18';

const NEWS_SLUGS = new Set(['blog', 'about', 'charity-partners', 'contact-us', 'register']);

export function parseRestaurantWeekSourceConfig(raw: unknown): RestaurantWeekSourceConfig {
  const c = (raw ?? {}) as Record<string, unknown>;
  return {
    feedUrl: typeof c.feedUrl === 'string' ? c.feedUrl : DEFAULT_FEED_URL,
    limit: typeof c.limit === 'number' ? c.limit : 50,
    seasonStart: typeof c.seasonStart === 'string' ? c.seasonStart : DEFAULT_SEASON_START,
    seasonEnd: typeof c.seasonEnd === 'string' ? c.seasonEnd : DEFAULT_SEASON_END,
  };
}

function stripHtml(html: string): string {
  return html
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<!--[\s\S]*?-->/g, ' ')
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

function decodeEntities(raw: string): string {
  return raw
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ');
}

function firstTag(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = block.match(re);
  return m?.[1]?.trim() ?? null;
}

function parseRss2Items(xml: string): Array<{
  title: string;
  link: string;
  pubDate: string;
  description: string;
}> {
  const items: Array<{
    title: string;
    link: string;
    pubDate: string;
    description: string;
  }> = [];

  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;
  while ((match = itemRe.exec(xml)) !== null) {
    const block = match[1]!;
    const title = firstTag(block, 'title');
    const link = firstTag(block, 'link');
    const pubDate = firstTag(block, 'pubDate');
    if (!title || !link || !pubDate) continue;
    const description = firstTag(block, 'description') ?? '';
    items.push({ title, link, pubDate, description });
  }

  return items;
}

function externalIdFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname.replace(/^\/+|\/+$/g, '');
    return path || url;
  } catch {
    return url;
  }
}

function parseRssDate(raw: string): Date {
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d;
  throw new Error(`invalid restaurant week pubDate: ${raw}`);
}

function parseSeasonDates(config: RestaurantWeekSourceConfig): {
  eventStartsAt: Date | null;
  eventEndsAt: Date | null;
} {
  const start = config.seasonStart ? new Date(`${config.seasonStart}T12:00:00Z`) : null;
  const end = config.seasonEnd ? new Date(`${config.seasonEnd}T23:59:59Z`) : null;
  return {
    eventStartsAt: start && !Number.isNaN(start.getTime()) ? start : null,
    eventEndsAt: end && !Number.isNaN(end.getTime()) ? end : null,
  };
}

function isRestaurantListing(url: string, title: string): boolean {
  try {
    const path = new URL(url).pathname.replace(/^\/+|\/+$/g, '');
    const firstSegment = path.split('/')[0] ?? '';
    if (!firstSegment || NEWS_SLUGS.has(firstSegment)) return false;
    if (path.includes('menu-type')) return false;
    // Restaurant slugs are single-segment paths like /em-chamas-brazilian-grill
    return !path.includes('/') && title.length > 0;
  } catch {
    return false;
  }
}

function parseAddressFromDescription(html: string): {
  address: string | null;
  region: string | null;
  menuTypes: string[];
} {
  const decoded = decodeEntities(html);
  const line1 = decoded.match(/address-line1[^>]*>([^<]+)/)?.[1]?.trim() ?? null;
  const locality = decoded.match(/class="locality"[^>]*>([^<]+)/)?.[1]?.trim() ?? null;
  const state = decoded.match(/administrative-area[^>]*>([^<]+)/)?.[1]?.trim() ?? null;
  const postal = decoded.match(/postal-code[^>]*>([^<]+)/)?.[1]?.trim() ?? null;

  const parts = [line1, locality, state, postal].filter(Boolean);
  const address = parts.length > 0 ? parts.join(', ') : null;

  const regionBlock = decoded.match(
    /field--name-field-regions[\s\S]*?(?:field--items[\s\S]*?)<\/div>\s*<\/div>/,
  );
  const region =
    regionBlock?.[0].match(/field--item[^>]*>([^<]+)/)?.[1]?.trim() || null;

  const menuTypes = [...decoded.matchAll(/menu-type\/([^"/]+)/g)].map((m) =>
    m[1]!.replace(/-/g, ' '),
  );

  return { address, region, menuTypes };
}

function inferDiningCategory(
  title: string,
  body: string,
  isListing: boolean,
  menuTypes: string[],
): string {
  const text = `${title} ${body}`.toLowerCase();
  if (!isListing) {
    if (text.includes('charit') || text.includes('donate')) return 'charity';
    if (text.includes('new participant') || text.includes('new & noteworthy')) return 'announcement';
    return 'announcement';
  }
  if (menuTypes.some((m) => m.includes('brunch'))) return 'brunch';
  if (menuTypes.some((m) => m.includes('lunch'))) return 'lunch';
  if (menuTypes.some((m) => m.includes('dinner'))) return 'dinner';
  return 'restaurant_week';
}

function detectOpeningFlag(title: string, body: string): boolean {
  const text = `${title} ${body}`.toLowerCase();
  return (
    text.includes('new participant') ||
    text.includes('new & noteworthy') ||
    text.includes('first time') ||
    text.includes('debut')
  );
}

export function normalizeRestaurantWeekItem(
  item: { title: string; link: string; pubDate: string; description: string },
  config: RestaurantWeekSourceConfig,
): NormalizedRestaurantWeekItem {
  const title = stripHtml(item.title);
  const body = stripHtml(decodeEntities(item.description));
  const { address, region, menuTypes } = parseAddressFromDescription(item.description);
  const listing = isRestaurantListing(item.link, title);
  const { eventStartsAt, eventEndsAt } = parseSeasonDates(config);

  const locationParts = [region, address].filter(Boolean) as string[];
  const locationClues = [
    ...new Set([
      ...locationParts,
      ...extractLocationClues(title, body),
      'kansas city',
      'restaurant week',
    ]),
  ];

  const diningCategory = inferDiningCategory(title, body, listing, menuTypes);
  const openingFlag = detectOpeningFlag(title, body);

  return {
    externalId: externalIdFromUrl(item.link),
    title: listing ? title : `KC Restaurant Week: ${title}`,
    body,
    url: item.link,
    publishedAt: parseRssDate(item.pubDate),
    venue: listing ? title : null,
    address,
    region,
    eventStartsAt: listing || diningCategory !== 'charity' ? eventStartsAt : null,
    eventEndsAt: listing || diningCategory !== 'charity' ? eventEndsAt : null,
    diningCategory,
    openingFlag,
    restaurantWeekFlag: true,
    menuTypes,
    locationClues,
    locationHint: region ?? address ?? locationClues[0] ?? 'kansas city',
  };
}

export async function fetchRestaurantWeekRssItems(
  config: RestaurantWeekSourceConfig,
): Promise<NormalizedRestaurantWeekItem[]> {
  const url = config.feedUrl ?? DEFAULT_FEED_URL;
  const limit = Math.min(config.limit ?? 50, 100);

  const res = await fetch(url, {
    headers: {
      'User-Agent': DEFAULT_USER_AGENT,
      Accept: 'application/rss+xml, application/xml, text/xml',
    },
  });

  if (!res.ok) {
    throw new Error(`restaurant week rss fetch failed: ${res.status} ${res.statusText}`);
  }

  const xml = await res.text();
  return parseRss2Items(xml)
    .slice(0, limit)
    .map((item) => normalizeRestaurantWeekItem(item, config));
}

export async function loadRestaurantWeekPosts(
  config: RestaurantWeekSourceConfig,
): Promise<NormalizedRestaurantWeekItem[]> {
  return fetchRestaurantWeekRssItems(config);
}
