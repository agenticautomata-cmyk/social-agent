import {
  dedupeRevenueOpportunities,
  fetchRssFeed,
  normalizeRssRevenueItem,
  parseVisitKcRssItems,
  type NormalizedRevenueOpportunity,
} from './revenue-alignment-shared.js';

export type VisitKcLuxuryExperiencesSourceConfig = {
  feedUrl?: string;
  limit?: number;
  maxAgeDays?: number;
};

const DEFAULT_FEED_URL = 'https://news.visitkc.com/rss.xml';

const LUXURY_EXPERIENCE_RE =
  /\b(luxury experience|VIP|premium|exclusive|pamper|wellness retreat|fine dining|culinary experience|spa|resort|boutique hotel|elevated|indulgent|high-end)\b/i;

const EXCLUDE_RE =
  /\b(restaurant week|free event|family fun|kids|convention center)\b/i;

export function parseVisitKcLuxuryExperiencesSourceConfig(
  raw: unknown,
): VisitKcLuxuryExperiencesSourceConfig {
  const c = (raw ?? {}) as Record<string, unknown>;
  return {
    feedUrl: typeof c.feedUrl === 'string' ? c.feedUrl : DEFAULT_FEED_URL,
    limit: typeof c.limit === 'number' ? c.limit : 50,
    maxAgeDays: typeof c.maxAgeDays === 'number' ? c.maxAgeDays : 730,
  };
}

export async function loadVisitKcLuxuryExperiences(
  config: VisitKcLuxuryExperiencesSourceConfig,
): Promise<NormalizedRevenueOpportunity[]> {
  const parsed = parseVisitKcLuxuryExperiencesSourceConfig(config);
  const results: NormalizedRevenueOpportunity[] = [];
  const limit = parsed.limit ?? 50;

  const xml = await fetchRssFeed(parsed.feedUrl ?? DEFAULT_FEED_URL);
  for (const item of parseVisitKcRssItems(xml).slice(0, limit)) {
    if (EXCLUDE_RE.test(item.title)) continue;
    if (!LUXURY_EXPERIENCE_RE.test(`${item.title} ${item.content}`)) continue;
    const opp = normalizeRssRevenueItem(item, {
      urlSuffix: '#luxury-experience',
      defaultCategory: 'couples_event',
    });
    if (opp) results.push(opp);
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (parsed.maxAgeDays ?? 730));

  return dedupeRevenueOpportunities(results).filter((item) => item.publishedAt >= cutoff);
}
