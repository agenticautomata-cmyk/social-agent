import {
  dedupeAudienceDeals,
  fetchRssFeed,
  firstTag,
  normalizeLuxuryArticle,
  stripHtml,
  type NormalizedAudienceDeal,
} from './closings-deals-shared.js';

export type VisitKcLuxurySourceConfig = {
  feedUrl?: string;
  inkcFeedUrl?: string;
  limit?: number;
  maxAgeDays?: number;
};

const DEFAULT_FEED_URL = 'https://news.visitkc.com/rss.xml';
const DEFAULT_INKC_FEED_URL = 'https://www.inkansascity.com/feed/';

const LUXURY_FILTER_RE =
  /\b(luxury|spa|hotel|resort|staycation|getaway|package|romantic|rooftop|fine dining|weekend escape|pamper|wellness retreat|VIP)\b/i;

export function parseVisitKcLuxurySourceConfig(raw: unknown): VisitKcLuxurySourceConfig {
  const c = (raw ?? {}) as Record<string, unknown>;
  return {
    feedUrl: typeof c.feedUrl === 'string' ? c.feedUrl : DEFAULT_FEED_URL,
    inkcFeedUrl: typeof c.inkcFeedUrl === 'string' ? c.inkcFeedUrl : DEFAULT_INKC_FEED_URL,
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

function parseStandardRssItems(xml: string): Array<{
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
    const rawContent =
      firstTag(block, 'content:encoded') ??
      firstTag(block, 'description') ??
      '';
    items.push({
      title,
      link,
      pubDate,
      content: stripHtml(rawContent),
      rawContent,
    });
  }
  return items;
}

export async function loadVisitKcLuxuryDeals(
  config: VisitKcLuxurySourceConfig,
): Promise<NormalizedAudienceDeal[]> {
  const parsed = parseVisitKcLuxurySourceConfig(config);
  const results: NormalizedAudienceDeal[] = [];
  const limit = parsed.limit ?? 50;

  const visitXml = await fetchRssFeed(parsed.feedUrl ?? DEFAULT_FEED_URL);
  for (const item of parseVisitKcRssItems(visitXml).slice(0, limit)) {
    if (!LUXURY_FILTER_RE.test(`${item.title} ${item.content}`)) continue;
    const deal = normalizeLuxuryArticle(item, { urlSuffix: '#luxury-deal' });
    if (deal) results.push(deal);
  }

  const inkcXml = await fetchRssFeed(parsed.inkcFeedUrl ?? DEFAULT_INKC_FEED_URL);
  for (const item of parseStandardRssItems(inkcXml).slice(0, limit)) {
    if (!LUXURY_FILTER_RE.test(`${item.title} ${item.content}`)) continue;
    const deal = normalizeLuxuryArticle(item, { urlSuffix: '#luxury-deal' });
    if (deal) results.push(deal);
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (parsed.maxAgeDays ?? 730));

  return dedupeAudienceDeals(results).filter((item) => item.publishedAt >= cutoff);
}
