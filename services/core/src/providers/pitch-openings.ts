import {
  dedupeOpenings,
  extractSippsOpenings,
  fetchRssFeed,
  normalizeArticleOpening,
  parseRss2Items,
  type NormalizedBusinessOpening,
  type OpeningCategory,
} from './business-openings-shared.js';

export type PitchOpeningsSourceConfig = {
  feedUrls?: string[];
  categoryFeedUrls?: Partial<Record<OpeningCategory, string>>;
  limit?: number;
  maxAgeDays?: number;
};

const DEFAULT_FEED_URLS = [
  'https://www.thepitchkc.com/tag/kc-sipps/feed/',
  'https://www.thepitchkc.com/category/dining/feed/',
  'https://www.thepitchkc.com/tag/new-restaurants/feed/',
  'https://www.thepitchkc.com/tag/new-business/feed/',
  'https://www.thepitchkc.com/tag/business/feed/',
];

const CATEGORY_FEED_URLS: Partial<Record<OpeningCategory, string>> = {
  coffee_opening: 'https://www.thepitchkc.com/tag/coffee/feed/',
  boutique_opening: 'https://www.thepitchkc.com/tag/boutique/feed/',
  entertainment_opening: 'https://www.thepitchkc.com/tag/entertainment/feed/',
  restaurant_opening: 'https://www.thepitchkc.com/tag/restaurant/feed/',
};

export function parsePitchOpeningsSourceConfig(raw: unknown): PitchOpeningsSourceConfig {
  const c = (raw ?? {}) as Record<string, unknown>;
  return {
    feedUrls: Array.isArray(c.feedUrls)
      ? c.feedUrls.filter((u): u is string => typeof u === 'string')
      : DEFAULT_FEED_URLS,
    categoryFeedUrls:
      c.categoryFeedUrls && typeof c.categoryFeedUrls === 'object'
        ? (c.categoryFeedUrls as Partial<Record<OpeningCategory, string>>)
        : CATEGORY_FEED_URLS,
    limit: typeof c.limit === 'number' ? c.limit : 40,
    maxAgeDays: typeof c.maxAgeDays === 'number' ? c.maxAgeDays : 730,
  };
}

function isSippsArticle(link: string, title: string): boolean {
  return /kc-sipps/i.test(link) || /^KC Sipps:/i.test(title);
}

export async function loadPitchOpenings(config: PitchOpeningsSourceConfig): Promise<NormalizedBusinessOpening[]> {
  const parsed = parsePitchOpeningsSourceConfig(config);
  const allUrls = [
    ...(parsed.feedUrls ?? DEFAULT_FEED_URLS),
    ...Object.values(parsed.categoryFeedUrls ?? CATEGORY_FEED_URLS).filter(Boolean),
  ];
  const uniqueUrls = [...new Set(allUrls)];
  const limit = parsed.limit ?? 40;
  const results: NormalizedBusinessOpening[] = [];

  for (const feedUrl of uniqueUrls) {
    const xml = await fetchRssFeed(feedUrl);
    const items = parseRss2Items(xml).slice(0, limit);

    const defaultCategory = categoryFromFeedUrl(feedUrl, parsed.categoryFeedUrls ?? CATEGORY_FEED_URLS);

    for (const item of items) {
      if (isSippsArticle(item.link, item.title)) {
        results.push(...extractSippsOpenings(item));
        continue;
      }

      const opening = normalizeArticleOpening(item, { defaultCategory });
      if (opening) results.push(opening);
    }
  }

  return dedupeOpenings(results).filter((item) => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (parsed.maxAgeDays ?? 730));
    return item.publishedAt >= cutoff;
  });
}

function categoryFromFeedUrl(
  url: string,
  categoryFeeds: Partial<Record<OpeningCategory, string>>,
): OpeningCategory | undefined {
  for (const [category, feedUrl] of Object.entries(categoryFeeds)) {
    if (feedUrl === url) return category as OpeningCategory;
  }
  return undefined;
}
