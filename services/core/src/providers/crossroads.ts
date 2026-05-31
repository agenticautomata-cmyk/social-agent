import { extractLocationClues } from './reddit.js';

export type CrossroadsSourceConfig = {
  feedUrl?: string;
  limit?: number;
};

export type NormalizedCrossroadsItem = {
  externalId: string;
  title: string;
  body: string;
  url: string;
  publishedAt: Date;
  contentType: string | null;
  categories: string[];
  locationClues: string[];
  locationHint: string | null;
};

const DEFAULT_USER_AGENT = 'Benson/0.1 (Kellie Assistant; +https://github.com/anthonyonazure/social-agent)';
const DEFAULT_FEED_URL = 'https://kccrossroads.org/feed/';

export function parseCrossroadsSourceConfig(raw: unknown): CrossroadsSourceConfig {
  const c = (raw ?? {}) as Record<string, unknown>;
  return {
    feedUrl: typeof c.feedUrl === 'string' ? c.feedUrl : DEFAULT_FEED_URL,
    limit: typeof c.limit === 'number' ? c.limit : 50,
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

function allTags(block: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  const values: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    const v = m[1]?.trim();
    if (v) values.push(v);
  }
  return values;
}

function parseRss2Items(xml: string): Array<{
  title: string;
  link: string;
  pubDate: string;
  content: string;
  categories: string[];
}> {
  const items: Array<{
    title: string;
    link: string;
    pubDate: string;
    content: string;
    categories: string[];
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
    const categories = allTags(block, 'category').map(stripHtml);
    items.push({ title, link, pubDate, content, categories });
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
  throw new Error(`invalid crossroads pubDate: ${raw}`);
}

function inferContentType(categories: string[], url: string): string | null {
  if (categories.length > 0) {
    return categories[0]!.toLowerCase().replace(/\s+/g, '_');
  }
  const path = url.toLowerCase();
  if (path.includes('/events/') || path.includes('/crossroads-events/')) return 'event';
  if (path.includes('/first-friday')) return 'first_friday';
  return 'news';
}

function buildLocationClues(title: string, body: string): string[] {
  const clues = extractLocationClues(title, body);
  const normalized = clues.map((c) => c.toLowerCase());
  if (!normalized.includes('crossroads')) {
    return ['crossroads', ...clues];
  }
  return clues;
}

export function normalizeCrossroadsItem(item: {
  title: string;
  link: string;
  pubDate: string;
  content: string;
  categories: string[];
}): NormalizedCrossroadsItem {
  const title = stripHtml(item.title);
  const body = stripHtml(item.content);
  const locationClues = buildLocationClues(title, body);
  const contentType = inferContentType(item.categories, item.link);

  return {
    externalId: externalIdFromUrl(item.link),
    title,
    body,
    url: item.link,
    publishedAt: parseRssDate(item.pubDate),
    contentType,
    categories: item.categories,
    locationClues,
    locationHint: locationClues[0] ?? 'crossroads',
  };
}

export async function fetchCrossroadsRssItems(
  config: CrossroadsSourceConfig,
): Promise<NormalizedCrossroadsItem[]> {
  const url = config.feedUrl ?? DEFAULT_FEED_URL;
  const limit = Math.min(config.limit ?? 50, 100);

  const res = await fetch(url, {
    headers: {
      'User-Agent': DEFAULT_USER_AGENT,
      Accept: 'application/rss+xml, application/xml, text/xml',
    },
  });

  if (!res.ok) {
    throw new Error(`crossroads rss fetch failed: ${res.status} ${res.statusText}`);
  }

  const xml = await res.text();
  return parseRss2Items(xml)
    .slice(0, limit)
    .map(normalizeCrossroadsItem);
}

export async function loadCrossroadsPosts(
  config: CrossroadsSourceConfig,
): Promise<NormalizedCrossroadsItem[]> {
  return fetchCrossroadsRssItems(config);
}
