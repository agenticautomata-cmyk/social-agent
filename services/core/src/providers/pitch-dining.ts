import { extractLocationClues } from './reddit.js';

export type PitchDiningSourceConfig = {
  feedUrl?: string;
  limit?: number;
};

export type NormalizedPitchDiningItem = {
  externalId: string;
  title: string;
  body: string;
  url: string;
  publishedAt: Date;
  venue: string | null;
  address: string | null;
  eventStartsAt: Date | null;
  eventEndsAt: Date | null;
  diningCategory: string;
  openingFlag: boolean;
  restaurantWeekFlag: boolean;
  locationClues: string[];
  locationHint: string | null;
};

const DEFAULT_USER_AGENT = 'Benson/0.1 (Kellie Assistant; +https://github.com/anthonyonazure/social-agent)';
const DEFAULT_FEED_URL = 'https://www.thepitchkc.com/tag/kc-sipps/feed/';

const OPENING_RE =
  /\b(open(?:ing|s|ed)?|now open|grand opening|soft[- ]opening|ribbon[- ]cutting|debut|new location|new spot|expands?|expanded)\b/i;
const RESTAURANT_WEEK_RE = /\brestaurant week\b/i;
const FESTIVAL_RE = /\b(festival|fest\b|restaurant week|sandwich week)\b/i;
const CHEF_RE = /\b(chef|pop-up|popup)\b/i;
const TASTING_RE = /\b(tasting|wine|brew|beer hall|cocktail|mocktail)\b/i;
const CLOSING_RE = /\b(clos(?:ing|es|ed)|shut(?:ting)? down)\b/i;

export function parsePitchDiningSourceConfig(raw: unknown): PitchDiningSourceConfig {
  const c = (raw ?? {}) as Record<string, unknown>;
  return {
    feedUrl: typeof c.feedUrl === 'string' ? c.feedUrl : DEFAULT_FEED_URL,
    limit: typeof c.limit === 'number' ? c.limit : 30,
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

function firstTag(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = block.match(re);
  return m?.[1]?.trim() ?? null;
}

function parseRss2Items(xml: string): Array<{
  title: string;
  link: string;
  pubDate: string;
  content: string;
}> {
  const items: Array<{
    title: string;
    link: string;
    pubDate: string;
    content: string;
  }> = [];

  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;
  while ((match = itemRe.exec(xml)) !== null) {
    const block = match[1]!;
    const title = firstTag(block, 'title');
    const link = firstTag(block, 'link');
    const pubDate = firstTag(block, 'pubDate');
    if (!title || !link || !pubDate) continue;
    const content =
      firstTag(block, 'content:encoded') ??
      firstTag(block, 'content') ??
      firstTag(block, 'description') ??
      '';
    items.push({ title, link, pubDate, content });
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
  throw new Error(`invalid pitch dining pubDate: ${raw}`);
}

function extractAddress(body: string): string | null {
  const located = body.match(
    /\bis located at ([^.]+(?:Avenue|Street|St\.|Road|Rd\.|Boulevard|Blvd\.|Terrace|Drive|Dr\.|Lane|Ln\.|Way|Place|Pl\.|Parkway|Pkwy)[^.]*)/i,
  );
  if (located?.[1]) return located[1].trim();

  const atPattern = body.match(
    /\bat (\d+[^.]+\b(?:MO|KS|Missouri|Kansas)\b[^.]*)/i,
  );
  if (atPattern?.[1]) return atPattern[1].trim();

  return null;
}

function extractVenueNames(title: string, body: string): string | null {
  const sippsMatch = title.match(/^KC Sipps:\s*(.+)$/i);
  if (!sippsMatch) return null;

  const headline = sippsMatch[1]!;
  const firstClause = headline.split(/,|\band\b/i)[0]?.trim();
  if (!firstClause || firstClause.length > 80) return null;

  const named = body.match(/<b>([^<:]+):<\/b>/i) ?? body.match(/\*\*([^*:]+):\*\*/);
  if (named?.[1]) return named[1].trim();

  return firstClause.length <= 60 ? firstClause : null;
}

function inferDiningCategory(title: string, body: string, openingFlag: boolean): string {
  const text = `${title} ${body}`;
  if (RESTAURANT_WEEK_RE.test(text)) return 'restaurant_week';
  if (openingFlag) return 'opening';
  if (CLOSING_RE.test(text)) return 'closing';
  if (FESTIVAL_RE.test(text)) return 'food_festival';
  if (CHEF_RE.test(text)) return 'chef_event';
  if (TASTING_RE.test(text)) return 'tasting';
  return 'dining';
}

function detectOpeningFlag(title: string, body: string): boolean {
  const text = `${title} ${body}`;
  if (OPENING_RE.test(text)) return true;
  if (/\bnew location\b/i.test(text)) return true;
  if (/\bthree openings\b/i.test(text)) return true;
  if (/\btwo openings\b/i.test(text)) return true;
  return false;
}

function detectRestaurantWeekFlag(title: string, body: string): boolean {
  return RESTAURANT_WEEK_RE.test(`${title} ${body}`);
}

function parseEventDates(body: string): { eventStartsAt: Date | null; eventEndsAt: Date | null } {
  const monthDay = body.match(
    /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})(?:\s*[–—-]\s*(\d{1,2}))?\b/i,
  );
  if (!monthDay) return { eventStartsAt: null, eventEndsAt: null };

  const year = new Date().getFullYear();
  const startStr = `${monthDay[1]} ${monthDay[2]}, ${year}`;
  const start = new Date(startStr);
  if (Number.isNaN(start.getTime())) return { eventStartsAt: null, eventEndsAt: null };

  let end: Date | null = null;
  if (monthDay[3]) {
    const endCandidate = new Date(`${monthDay[1]} ${monthDay[3]}, ${year}`);
    if (!Number.isNaN(endCandidate.getTime())) end = endCandidate;
  }

  return { eventStartsAt: start, eventEndsAt: end };
}

export function normalizePitchDiningItem(item: {
  title: string;
  link: string;
  pubDate: string;
  content: string;
}): NormalizedPitchDiningItem {
  const title = stripHtml(item.title);
  const body = stripHtml(item.content);
  const openingFlag = detectOpeningFlag(title, body);
  const restaurantWeekFlag = detectRestaurantWeekFlag(title, body);
  const diningCategory = inferDiningCategory(title, body, openingFlag);
  const address = extractAddress(item.content);
  const venue = extractVenueNames(title, item.content);
  const { eventStartsAt, eventEndsAt } = parseEventDates(body);

  const locationClues = [
    ...new Set([...extractLocationClues(title, body), ...(address ? [address] : [])]),
  ];

  return {
    externalId: externalIdFromUrl(item.link),
    title,
    body,
    url: item.link,
    publishedAt: parseRssDate(item.pubDate),
    venue,
    address,
    eventStartsAt,
    eventEndsAt,
    diningCategory,
    openingFlag,
    restaurantWeekFlag,
    locationClues,
    locationHint: address ?? locationClues[0] ?? 'kansas city',
  };
}

export async function fetchPitchDiningRssItems(
  config: PitchDiningSourceConfig,
): Promise<NormalizedPitchDiningItem[]> {
  const url = config.feedUrl ?? DEFAULT_FEED_URL;
  const limit = Math.min(config.limit ?? 30, 100);

  const res = await fetch(url, {
    headers: {
      'User-Agent': DEFAULT_USER_AGENT,
      Accept: 'application/rss+xml, application/xml, text/xml',
    },
  });

  if (!res.ok) {
    throw new Error(`pitch dining rss fetch failed: ${res.status} ${res.statusText}`);
  }

  const xml = await res.text();
  return parseRss2Items(xml)
    .slice(0, limit)
    .map(normalizePitchDiningItem);
}

export async function loadPitchDiningPosts(
  config: PitchDiningSourceConfig,
): Promise<NormalizedPitchDiningItem[]> {
  return fetchPitchDiningRssItems(config);
}
