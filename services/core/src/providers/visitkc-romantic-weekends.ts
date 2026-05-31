import {
  dedupeRevenueOpportunities,
  fetchRssFeed,
  normalizeRssRevenueItem,
  parseVisitKcRssItems,
  type NormalizedRevenueOpportunity,
} from './revenue-alignment-shared.js';

export type VisitKcRomanticWeekendsSourceConfig = {
  feedUrl?: string;
  limit?: number;
  maxAgeDays?: number;
};

const DEFAULT_FEED_URL = 'https://news.visitkc.com/rss.xml';

const ROMANTIC_WEEKEND_RE =
  /\b(romantic|weekend getaway|weekend escape|staycation|couples|date night|anniversary|honeymoon|special offer|package deal|weekend package|escape package)\b/i;

const EXCLUDE_RE =
  /\b(tourism outlook|black history month|donation to local charity|convention|business travel)\b/i;

export function parseVisitKcRomanticWeekendsSourceConfig(
  raw: unknown,
): VisitKcRomanticWeekendsSourceConfig {
  const c = (raw ?? {}) as Record<string, unknown>;
  return {
    feedUrl: typeof c.feedUrl === 'string' ? c.feedUrl : DEFAULT_FEED_URL,
    limit: typeof c.limit === 'number' ? c.limit : 50,
    maxAgeDays: typeof c.maxAgeDays === 'number' ? c.maxAgeDays : 730,
  };
}

export async function loadVisitKcRomanticWeekends(
  config: VisitKcRomanticWeekendsSourceConfig,
): Promise<NormalizedRevenueOpportunity[]> {
  const parsed = parseVisitKcRomanticWeekendsSourceConfig(config);
  const results: NormalizedRevenueOpportunity[] = [];
  const limit = parsed.limit ?? 50;

  const xml = await fetchRssFeed(parsed.feedUrl ?? DEFAULT_FEED_URL);
  for (const item of parseVisitKcRssItems(xml).slice(0, limit)) {
    if (EXCLUDE_RE.test(item.title)) continue;
    if (!ROMANTIC_WEEKEND_RE.test(`${item.title} ${item.content}`)) continue;
    const opp = normalizeRssRevenueItem(item, {
      urlSuffix: '#romantic-weekend',
      defaultCategory: 'weekend_getaway',
    });
    if (opp) results.push(opp);
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (parsed.maxAgeDays ?? 730));

  return dedupeRevenueOpportunities(results).filter((item) => item.publishedAt >= cutoff);
}
