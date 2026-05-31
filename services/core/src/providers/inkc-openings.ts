import {
  dedupeOpenings,
  fetchRssFeed,
  normalizeArticleOpening,
  parseRss2Items,
  type NormalizedBusinessOpening,
} from './business-openings-shared.js';

export type InKcOpeningsSourceConfig = {
  feedUrl?: string;
  limit?: number;
  maxAgeDays?: number;
};

const DEFAULT_FEED_URL = 'https://www.inkansascity.com/feed/';

const OPENING_FILTER_RE =
  /\b(open(?:ing|s|ed)?|now open|grand opening|new (?:restaurant|hotel|shop|store|venue|business|location|museum|attraction)|debut|launches?|set to open|just opened)\b/i;

const INKC_EXCLUDE_RE =
  /\b(this weekend in|how .+ stands out|tradition returns|best views of|skyline|memorial day|weekend guide)\b/i;

export function parseInKcOpeningsSourceConfig(raw: unknown): InKcOpeningsSourceConfig {
  const c = (raw ?? {}) as Record<string, unknown>;
  return {
    feedUrl: typeof c.feedUrl === 'string' ? c.feedUrl : DEFAULT_FEED_URL,
    limit: typeof c.limit === 'number' ? c.limit : 50,
    maxAgeDays: typeof c.maxAgeDays === 'number' ? c.maxAgeDays : 365,
  };
}

export async function loadInKcOpenings(config: InKcOpeningsSourceConfig): Promise<NormalizedBusinessOpening[]> {
  const parsed = parseInKcOpeningsSourceConfig(config);
  const xml = await fetchRssFeed(parsed.feedUrl ?? DEFAULT_FEED_URL);
  const items = parseRss2Items(xml).slice(0, parsed.limit ?? 50);
  const results: NormalizedBusinessOpening[] = [];

  for (const item of items) {
    const title = item.title;
    if (INKC_EXCLUDE_RE.test(title)) continue;
    if (!OPENING_FILTER_RE.test(`${title} ${item.content}`)) continue;
    const opening = normalizeArticleOpening(item);
    if (opening) results.push(opening);
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (parsed.maxAgeDays ?? 365));

  return dedupeOpenings(results).filter((item) => item.publishedAt >= cutoff);
}
