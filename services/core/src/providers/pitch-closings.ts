import {
  dedupeAudienceDeals,
  extractSippsClosings,
  fetchRssFeed,
  normalizeClosingArticle,
  parseRss2Items,
  type NormalizedAudienceDeal,
} from './closings-deals-shared.js';

export type PitchClosingsSourceConfig = {
  feedUrls?: string[];
  limit?: number;
  maxAgeDays?: number;
};

const DEFAULT_FEED_URLS = [
  'https://www.thepitchkc.com/tag/kc-sipps/feed/',
  'https://www.thepitchkc.com/tag/closing/feed/',
  'https://www.thepitchkc.com/tag/closings/feed/',
  'https://www.thepitchkc.com/tag/restaurant-closings/feed/',
  'https://www.thepitchkc.com/category/dining/feed/',
];

export function parsePitchClosingsSourceConfig(raw: unknown): PitchClosingsSourceConfig {
  const c = (raw ?? {}) as Record<string, unknown>;
  return {
    feedUrls: Array.isArray(c.feedUrls)
      ? c.feedUrls.filter((u): u is string => typeof u === 'string')
      : DEFAULT_FEED_URLS,
    limit: typeof c.limit === 'number' ? c.limit : 40,
    maxAgeDays: typeof c.maxAgeDays === 'number' ? c.maxAgeDays : 730,
  };
}

function isSippsArticle(link: string, title: string): boolean {
  return /kc-sipps/i.test(link) || /^KC Sipps:/i.test(title);
}

export async function loadPitchClosings(config: PitchClosingsSourceConfig): Promise<NormalizedAudienceDeal[]> {
  const parsed = parsePitchClosingsSourceConfig(config);
  const results: NormalizedAudienceDeal[] = [];

  for (const feedUrl of parsed.feedUrls ?? DEFAULT_FEED_URLS) {
    const xml = await fetchRssFeed(feedUrl);
    const items = parseRss2Items(xml).slice(0, parsed.limit ?? 40);

    for (const item of items) {
      if (isSippsArticle(item.link, item.title)) {
        results.push(...extractSippsClosings(item));
        continue;
      }
      const closing = normalizeClosingArticle(item);
      if (closing) results.push(closing);
    }
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (parsed.maxAgeDays ?? 730));

  return dedupeAudienceDeals(results).filter((item) => item.publishedAt >= cutoff);
}
