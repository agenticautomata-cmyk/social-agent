import {
  dedupeCelebrityCharityEvents,
  fetchRssFeed,
  loadCharityDirectory,
  normalizeRssCharityItem,
  parseRss2Items,
  type CharityDirectoryEntry,
  type NormalizedCelebrityCharityEvent,
} from './celebrity-charity-shared.js';

export type KcEntertainmentCharitySourceConfig = {
  feedUrls?: string[];
  events?: CharityDirectoryEntry[];
  limit?: number;
  maxAgeDays?: number;
};

const DEFAULT_FEED_URLS = [
  'https://www.thepitchkc.com/category/arts-entertainment/feed/',
  'https://www.thepitchkc.com/tag/events/feed/',
];

const DEFAULT_EVENTS: CharityDirectoryEntry[] = [
  {
    slug: 'crossroads-first-fridays-charity',
    title: 'Crossroads First Fridays — charity partner nights',
    body: 'Monthly First Fridays art walk with rotating charity partners and local celebrity hosts in the Crossroads.',
    nonprofit: 'Crossroads Community Association',
    venue: 'Crossroads Arts District',
    address: 'Kansas City, MO 64108',
    neighborhood: 'crossroads',
    sourceUrl: 'https://www.crossroadskc.org/',
    category: 'charity_event',
  },
  {
    slug: 'union-station-gala',
    title: 'Union Station Gala — historic venue charity fundraiser',
    body: 'Black-tie gala at Union Station supporting Science City and community programs with celebrity guests.',
    nonprofit: 'Union Station Kansas City',
    venue: 'Union Station Kansas City',
    address: '30 West Pershing Road, Kansas City, MO 64108',
    neighborhood: 'crown center',
    sourceUrl: 'https://unionstation.org/',
    category: 'gala',
    eventDate: '2026-10-03',
  },
  {
    slug: 'kc-live-benefit-concert',
    title: 'Power & Light District Benefit Concert Series',
    body: 'Outdoor benefit concert series in the Power & Light District supporting Kansas City nonprofits.',
    nonprofit: 'Power & Light District Foundation',
    venue: 'Power & Light District',
    address: '1335 Walnut Street, Kansas City, MO 64106',
    neighborhood: 'power and light',
    sourceUrl: 'https://www.powerandlightdistrict.com/',
    category: 'benefit_concert',
  },
];

const CHARITY_FILTER_RE =
  /\b(charity|fundrais|benefit|gala|celebrity|auction|nonprofit|philanthrop|Big Slick|Children'?s Mercy)\b/i;

export function parseKcEntertainmentCharitySourceConfig(
  raw: unknown,
): KcEntertainmentCharitySourceConfig {
  const c = (raw ?? {}) as Record<string, unknown>;
  return {
    feedUrls: Array.isArray(c.feedUrls)
      ? c.feedUrls.filter((u): u is string => typeof u === 'string')
      : DEFAULT_FEED_URLS,
    events: Array.isArray(c.events) ? (c.events as CharityDirectoryEntry[]) : DEFAULT_EVENTS,
    limit: typeof c.limit === 'number' ? c.limit : 30,
    maxAgeDays: typeof c.maxAgeDays === 'number' ? c.maxAgeDays : 730,
  };
}

export async function loadKcEntertainmentCharityEvents(
  config: KcEntertainmentCharitySourceConfig,
): Promise<NormalizedCelebrityCharityEvent[]> {
  const parsed = parseKcEntertainmentCharitySourceConfig(config);
  const results = loadCharityDirectory(parsed.events ?? DEFAULT_EVENTS, '#entertainment-charity');

  for (const feedUrl of parsed.feedUrls ?? DEFAULT_FEED_URLS) {
    const xml = await fetchRssFeed(feedUrl);
    for (const item of parseRss2Items(xml).slice(0, parsed.limit ?? 30)) {
      if (!CHARITY_FILTER_RE.test(`${item.title} ${item.content}`)) continue;
      const event = normalizeRssCharityItem(item, { urlSuffix: '#entertainment-charity' });
      if (event) results.push(event);
    }
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (parsed.maxAgeDays ?? 730));

  return dedupeCelebrityCharityEvents(results).filter((item) => item.publishedAt >= cutoff);
}
