import {
  dedupeRevenueOpportunities,
  fetchRssFeed,
  normalizeRssRevenueItem,
  parseRss2Items,
  type NormalizedRevenueOpportunity,
} from './revenue-alignment-shared.js';

export type RomanticRestaurantEventsSourceConfig = {
  feedUrls?: string[];
  limit?: number;
  maxAgeDays?: number;
};

const DEFAULT_FEED_URLS = [
  'https://www.thepitchkc.com/category/dining/feed/',
  'https://www.thepitchkc.com/tag/food/feed/',
  'https://www.thepitchkc.com/tag/kc-sipps/feed/',
  'https://www.thepitchkc.com/tag/restaurant/feed/',
];

const ROMANTIC_DINING_RE =
  /\b(romantic|date night|couples|valentine|anniversary|wine dinner|chef'?s table|tasting menu|prix fixe|special dinner|candlelit|intimate dining|dinner for two)\b/i;

const EXCLUDE_RE =
  /\b(clos(?:ing|es|ed)|shut(?:ting)? down|restaurant week|food recall|health inspection)\b/i;

export function parseRomanticRestaurantEventsSourceConfig(
  raw: unknown,
): RomanticRestaurantEventsSourceConfig {
  const c = (raw ?? {}) as Record<string, unknown>;
  return {
    feedUrls: Array.isArray(c.feedUrls)
      ? c.feedUrls.filter((u): u is string => typeof u === 'string')
      : DEFAULT_FEED_URLS,
    limit: typeof c.limit === 'number' ? c.limit : 40,
    maxAgeDays: typeof c.maxAgeDays === 'number' ? c.maxAgeDays : 730,
  };
}

export async function loadRomanticRestaurantEvents(
  config: RomanticRestaurantEventsSourceConfig,
): Promise<NormalizedRevenueOpportunity[]> {
  const parsed = parseRomanticRestaurantEventsSourceConfig(config);
  const results: NormalizedRevenueOpportunity[] = [];

  for (const feedUrl of parsed.feedUrls ?? DEFAULT_FEED_URLS) {
    const xml = await fetchRssFeed(feedUrl);
    for (const item of parseRss2Items(xml).slice(0, parsed.limit ?? 40)) {
      if (EXCLUDE_RE.test(item.title)) continue;
      if (!ROMANTIC_DINING_RE.test(`${item.title} ${item.content}`)) continue;
      const opp = normalizeRssRevenueItem(item, {
        urlSuffix: '#romantic-restaurant',
        defaultCategory: 'couples_event',
      });
      if (opp) results.push(opp);
    }
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (parsed.maxAgeDays ?? 730));

  return dedupeRevenueOpportunities(results).filter((item) => item.publishedAt >= cutoff);
}
