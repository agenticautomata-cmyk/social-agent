import {
  dedupeAudienceDeals,
  detectClosingSignal,
  fetchRssFeed,
  normalizeClosingArticle,
  parseRss2Items,
  stripHtml,
  type NormalizedAudienceDeal,
} from './closings-deals-shared.js';

export type InKcClosingsSourceConfig = {
  feedUrl?: string;
  limit?: number;
  maxAgeDays?: number;
};

const DEFAULT_FEED_URL = 'https://www.inkansascity.com/feed/';

const INKC_EXCLUDE_RE =
  /\b(this weekend in|how .+ stands out|best views of|skyline|weekend guide|landmarks explained|unique .+ landmarks)\b/i;

export function parseInKcClosingsSourceConfig(raw: unknown): InKcClosingsSourceConfig {
  const c = (raw ?? {}) as Record<string, unknown>;
  return {
    feedUrl: typeof c.feedUrl === 'string' ? c.feedUrl : DEFAULT_FEED_URL,
    limit: typeof c.limit === 'number' ? c.limit : 50,
    maxAgeDays: typeof c.maxAgeDays === 'number' ? c.maxAgeDays : 365,
  };
}

export async function loadInKcClosings(config: InKcClosingsSourceConfig): Promise<NormalizedAudienceDeal[]> {
  const parsed = parseInKcClosingsSourceConfig(config);
  const xml = await fetchRssFeed(parsed.feedUrl ?? DEFAULT_FEED_URL);
  const items = parseRss2Items(xml).slice(0, parsed.limit ?? 50);
  const results: NormalizedAudienceDeal[] = [];

  for (const item of items) {
    const title = stripHtml(item.title);
    if (INKC_EXCLUDE_RE.test(title)) continue;
    if (!detectClosingSignal(title, item.content)) continue;
    const closing = normalizeClosingArticle(item);
    if (closing) results.push(closing);
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (parsed.maxAgeDays ?? 365));

  return dedupeAudienceDeals(results).filter((item) => item.publishedAt >= cutoff);
}
