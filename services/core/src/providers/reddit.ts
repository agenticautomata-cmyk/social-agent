
export type RedditOpportunityCategory =
  | 'event'
  | 'festival'
  | 'attraction'
  | 'restaurant_opening'
  | 'discussion'
  | 'deal';

export type RedditSourceConfig = {
  subreddit: string;
  sort?: 'hot' | 'new' | 'top' | 'rising';
  limit?: number;
  /** Always `rss` for Phase 2A production ingest. */
  format?: 'rss';
  titleBlocklist?: string[];
};

export type NormalizedRedditPost = {
  externalId: string;
  title: string;
  body: string;
  permalink: string;
  subreddit: string;
  publishedAt: Date;
  category: RedditOpportunityCategory;
  locationClues: string[];
  locationHint: string | null;
};

const DEFAULT_USER_AGENT = 'Benson/0.1 (Kellie Assistant; +https://github.com/anthonyonazure/social-agent)';

const KC_NEIGHBORHOODS = [
  'crossroads',
  'westport',
  'plaza',
  'country club plaza',
  'brookside',
  'west bottoms',
  'river market',
  'downtown',
  'midtown',
  'union station',
  'power & light',
  'power and light',
  '18th and vine',
  'north kc',
  'northland',
  'overland park',
  'olathe',
  'independence',
  'lee\'s summit',
  'lees summit',
  'liberty',
  'shawnee',
  'mission',
  'prairie village',
  'waldo',
  'south kc',
  'east kc',
  'northeast',
  'arrowhead',
  'geha field',
  'kauffman',
  'kauffman center',
  'nelson-atkins',
  'union hill',
  'crown center',
  'zona rosa',
  'liberty memorial',
];

const CATEGORY_KEYWORDS: Record<RedditOpportunityCategory, string[]> = {
  festival: ['festival', 'first fridays', 'art fair', 'street fair', 'parade', 'fest '],
  event: ['event', 'concert', 'show', 'meetup', 'game day', 'watch party', 'this weekend', 'tonight'],
  attraction: ['museum', 'exhibit', 'gallery', 'zoo', 'attraction', 'things to do', 'visit', 'market'],
  restaurant_opening: [
    'restaurant',
    'opening',
    'soft open',
    'grand opening',
    'new spot',
    'new cafe',
    'new bar',
    'food hall',
  ],
  deal: ['deal', 'discount', 'free', 'happy hour', 'special', 'coupon', 'sale', 'giveaway', 'BOGO'],
  discussion: [],
};

export function parseRedditSourceConfig(raw: unknown): RedditSourceConfig {
  const c = (raw ?? {}) as Record<string, unknown>;
  return {
    subreddit: String(c.subreddit ?? 'kansascity').replace(/^r\//, ''),
    sort: (c.sort as RedditSourceConfig['sort']) ?? 'hot',
    limit: typeof c.limit === 'number' ? c.limit : 50,
    format: 'rss',
    titleBlocklist: Array.isArray(c.titleBlocklist)
      ? c.titleBlocklist.map(String)
      : ['for sale', 'housing', 'job posting', 'lost/found', 'employment'],
  };
}

export function classifyRedditPost(title: string, body: string): RedditOpportunityCategory {
  const text = `${title} ${body}`.toLowerCase();

  for (const cat of [
    'festival',
    'restaurant_opening',
    'deal',
    'event',
    'attraction',
  ] as RedditOpportunityCategory[]) {
    if (CATEGORY_KEYWORDS[cat].some((kw) => text.includes(kw))) return cat;
  }

  return 'discussion';
}

export function extractLocationClues(title: string, body: string): string[] {
  const text = `${title} ${body}`.toLowerCase();
  const found = new Set<string>();

  for (const hood of KC_NEIGHBORHOODS) {
    if (text.includes(hood)) found.add(hood);
  }

  if (/\bkansas city\b|\bkcmo\b|\bk\.c\.?\b/.test(text)) {
    found.add('kansas city');
  }

  const streetMatch = text.match(/\b([a-z0-9 .]+ (?:st|street|ave|avenue|blvd|boulevard|rd|road|dr|drive))\b/i);
  if (streetMatch?.[1]) found.add(streetMatch[1].trim());

  return [...found];
}

function stripHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstTag(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = block.match(re);
  return m?.[1]?.trim() ?? null;
}

function linkHref(block: string): string | null {
  const m = block.match(/<link[^>]+href="([^"]+)"/i);
  return m?.[1]?.trim() ?? null;
}

function authorName(block: string): string | null {
  const m = block.match(/<author>\s*<name>([^<]+)<\/name>/i);
  return m?.[1]?.trim() ?? null;
}

function parseAtomEntries(xml: string): Array<{
  id: string;
  title: string;
  link: string;
  published: string;
  content: string;
  author: string | null;
}> {
  const entries: Array<{
    id: string;
    title: string;
    link: string;
    published: string;
    content: string;
    author: string | null;
  }> = [];

  const entryRe = /<entry>([\s\S]*?)<\/entry>/gi;
  let match: RegExpExecArray | null;
  while ((match = entryRe.exec(xml)) !== null) {
    const block = match[1]!;
    const id = firstTag(block, 'id');
    const title = firstTag(block, 'title');
    const link = linkHref(block);
    const published = firstTag(block, 'published') ?? firstTag(block, 'updated');
    const content = firstTag(block, 'content') ?? '';
    if (!id || !title || !link || !published) continue;
    entries.push({ id, title, link, published, content, author: authorName(block) });
  }

  return entries;
}

export function normalizeRssEntry(
  entry: {
    id: string;
    title: string;
    link: string;
    published: string;
    content: string;
    author: string | null;
  },
  subreddit: string,
): NormalizedRedditPost {
  const title = entry.title.trim();
  const body = stripHtml(entry.content);
  const locationClues = extractLocationClues(title, body);
  const externalId = entry.id.startsWith('t3_') ? entry.id.slice(3) : entry.id;

  return {
    externalId,
    title,
    body,
    permalink: entry.link,
    subreddit,
    publishedAt: new Date(entry.published),
    category: classifyRedditPost(title, body),
    locationClues,
    locationHint: locationClues[0] ?? null,
  };
}

function passesFilters(post: NormalizedRedditPost, config: RedditSourceConfig): boolean {
  const title = post.title.toLowerCase();
  if (config.titleBlocklist?.some((b) => title.includes(b.toLowerCase()))) {
    return false;
  }
  return true;
}

export function buildRedditRssUrl(config: RedditSourceConfig): string {
  const sub = config.subreddit.replace(/^r\//, '');
  const sort = config.sort ?? 'hot';
  const limit = Math.min(config.limit ?? 50, 100);
  return `https://www.reddit.com/r/${sub}/${sort}.rss?limit=${limit}`;
}

export async function fetchRedditRssPosts(config: RedditSourceConfig): Promise<NormalizedRedditPost[]> {
  const sub = config.subreddit.replace(/^r\//, '');
  const url = buildRedditRssUrl(config);

  const res = await fetch(url, {
    headers: { 'User-Agent': DEFAULT_USER_AGENT, Accept: 'application/atom+xml, application/xml, text/xml' },
  });

  if (!res.ok) {
    throw new Error(`reddit rss fetch failed: ${res.status} ${res.statusText}`);
  }

  const xml = await res.text();
  const entries = parseAtomEntries(xml);

  return entries
    .map((e) => normalizeRssEntry(e, sub))
    .filter((p) => passesFilters(p, config));
}

/** Production ingest — r/kansascity RSS only, no mocks. */
export async function loadRedditPosts(config: RedditSourceConfig): Promise<NormalizedRedditPost[]> {
  return fetchRedditRssPosts(config);
}
