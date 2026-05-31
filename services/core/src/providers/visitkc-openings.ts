import {
  dedupeOpenings,
  fetchRssFeed,
  firstTag,
  normalizeArticleOpening,
  stripHtml,
  type NormalizedBusinessOpening,
} from './business-openings-shared.js';

export type VisitKcOpeningsSourceConfig = {
  feedUrl?: string;
  limit?: number;
  maxAgeDays?: number;
};

const DEFAULT_FEED_URL = 'https://news.visitkc.com/rss.xml';

const OPENING_FILTER_RE =
  /\b(open(?:ing|s|ed)?|now open|grand opening|new (?:restaurant|hotel|shop|store|venue|business|location|museum|attraction|passport|program|experience)|debut|launches?|set to open|just opened|returns? to)\b/i;

export function parseVisitKcOpeningsSourceConfig(raw: unknown): VisitKcOpeningsSourceConfig {
  const c = (raw ?? {}) as Record<string, unknown>;
  return {
    feedUrl: typeof c.feedUrl === 'string' ? c.feedUrl : DEFAULT_FEED_URL,
    limit: typeof c.limit === 'number' ? c.limit : 50,
    maxAgeDays: typeof c.maxAgeDays === 'number' ? c.maxAgeDays : 730,
  };
}

function parseVisitKcRssItems(xml: string): Array<{
  title: string;
  link: string;
  pubDate: string;
  content: string;
  rawContent: string;
}> {
  const items: Array<{
    title: string;
    link: string;
    pubDate: string;
    content: string;
    rawContent: string;
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
    const content = firstTag(block, 'content') ?? '';
    const rawContent = `${description}\n${content}`;
    items.push({
      title,
      link,
      pubDate,
      content: stripHtml(`${description} ${content}`),
      rawContent,
    });
  }

  return items;
}

export async function loadVisitKcOpenings(config: VisitKcOpeningsSourceConfig): Promise<NormalizedBusinessOpening[]> {
  const parsed = parseVisitKcOpeningsSourceConfig(config);
  const xml = await fetchRssFeed(parsed.feedUrl ?? DEFAULT_FEED_URL);
  const items = parseVisitKcRssItems(xml).slice(0, parsed.limit ?? 50);
  const results: NormalizedBusinessOpening[] = [];

  for (const item of items) {
    if (!OPENING_FILTER_RE.test(`${item.title} ${item.content}`)) continue;
    const opening = normalizeArticleOpening(item, { urlSuffix: '#business-opening' });
    if (opening) results.push(opening);
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (parsed.maxAgeDays ?? 730));

  return dedupeOpenings(results).filter((item) => item.publishedAt >= cutoff);
}
