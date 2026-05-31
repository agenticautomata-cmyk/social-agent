import {
  dedupeCelebrityCharityEvents,
  fetchRssFeed,
  normalizeRssCharityItem,
  parseVisitKcRssItems,
  type NormalizedCelebrityCharityEvent,
} from './celebrity-charity-shared.js';

export type VisitKcCharityEventsSourceConfig = {
  feedUrl?: string;
  limit?: number;
  maxAgeDays?: number;
};

const DEFAULT_FEED_URL = 'https://news.visitkc.com/rss.xml';

const CHARITY_FILTER_RE =
  /\b(charity|charitable|fundrais|benefit|gala|nonprofit|donation|Big Slick|Children'?s Mercy|celebrity|Red Friday|community event|giving back|philanthrop)\b/i;

const EXCLUDE_RE =
  /\b(tourism outlook|convention|hotel opening|restaurant week generates)\b/i;

export function parseVisitKcCharityEventsSourceConfig(raw: unknown): VisitKcCharityEventsSourceConfig {
  const c = (raw ?? {}) as Record<string, unknown>;
  return {
    feedUrl: typeof c.feedUrl === 'string' ? c.feedUrl : DEFAULT_FEED_URL,
    limit: typeof c.limit === 'number' ? c.limit : 50,
    maxAgeDays: typeof c.maxAgeDays === 'number' ? c.maxAgeDays : 730,
  };
}

export async function loadVisitKcCharityEvents(
  config: VisitKcCharityEventsSourceConfig,
): Promise<NormalizedCelebrityCharityEvent[]> {
  const parsed = parseVisitKcCharityEventsSourceConfig(config);
  const results: NormalizedCelebrityCharityEvent[] = [];
  const limit = parsed.limit ?? 50;

  const xml = await fetchRssFeed(parsed.feedUrl ?? DEFAULT_FEED_URL);
  for (const item of parseVisitKcRssItems(xml).slice(0, limit)) {
    if (EXCLUDE_RE.test(item.title)) continue;
    if (!CHARITY_FILTER_RE.test(`${item.title} ${item.content}`)) continue;
    const event = normalizeRssCharityItem(item, { urlSuffix: '#charity-event' });
    if (event) results.push(event);
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (parsed.maxAgeDays ?? 730));

  return dedupeCelebrityCharityEvents(results).filter((item) => item.publishedAt >= cutoff);
}
