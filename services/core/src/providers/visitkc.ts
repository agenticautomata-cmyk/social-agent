import { extractLocationClues } from './reddit.js';

export type VisitKcSourceConfig = {
  feedUrl?: string;
  limit?: number;
};

export type NormalizedVisitKcItem = {
  externalId: string;
  title: string;
  body: string;
  url: string;
  publishedAt: Date;
  contentType: string | null;
  locationClues: string[];
  locationHint: string | null;
};

const DEFAULT_USER_AGENT = 'Benson/0.1 (Kellie Assistant; +https://github.com/anthonyonazure/social-agent)';
const DEFAULT_FEED_URL = 'https://news.visitkc.com/rss.xml';

export function parseVisitKcSourceConfig(raw: unknown): VisitKcSourceConfig {
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

function parseRss2Items(xml: string): Array<{
  title: string;
  link: string;
  pubDate: string;
  content: string;
  contentType: string | null;
}> {
  const items: Array<{
    title: string;
    link: string;
    pubDate: string;
    content: string;
    contentType: string | null;
  }> = [];

  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;
  while ((match = itemRe.exec(xml)) !== null) {
    const block = match[1]!;
    const title = firstTag(block, 'title');
    const link = firstTag(block, 'link');
    const pubDate = firstTag(block, 'pubDate');
    if (!title || !link || !pubDate) continue;
    const content = firstTag(block, 'content') ?? firstTag(block, 'description') ?? '';
    const contentType = firstTag(block, 'contentType');
    items.push({ title, link, pubDate, content, contentType });
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
  throw new Error(`invalid visitkc pubDate: ${raw}`);
}

export function normalizeVisitKcItem(item: {
  title: string;
  link: string;
  pubDate: string;
  content: string;
  contentType: string | null;
}): NormalizedVisitKcItem {
  const title = stripHtml(item.title);
  const body = stripHtml(item.content);
  const locationClues = extractLocationClues(title, body);

  return {
    externalId: externalIdFromUrl(item.link),
    title,
    body,
    url: item.link,
    publishedAt: parseRssDate(item.pubDate),
    contentType: item.contentType,
    locationClues,
    locationHint: locationClues[0] ?? 'kansas city',
  };
}

export async function fetchVisitKcRssItems(config: VisitKcSourceConfig): Promise<NormalizedVisitKcItem[]> {
  const url = config.feedUrl ?? DEFAULT_FEED_URL;
  const limit = Math.min(config.limit ?? 50, 100);

  const res = await fetch(url, {
    headers: {
      'User-Agent': DEFAULT_USER_AGENT,
      Accept: 'application/rss+xml, application/xml, text/xml',
    },
  });

  if (!res.ok) {
    throw new Error(`visitkc rss fetch failed: ${res.status} ${res.statusText}`);
  }

  const xml = await res.text();
  return parseRss2Items(xml)
    .slice(0, limit)
    .map(normalizeVisitKcItem);
}

export async function loadVisitKcPosts(config: VisitKcSourceConfig): Promise<NormalizedVisitKcItem[]> {
  return fetchVisitKcRssItems(config);
}
