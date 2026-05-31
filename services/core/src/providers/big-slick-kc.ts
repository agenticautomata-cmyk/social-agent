import {
  buildCelebrityCharityEvent,
  extractCelebrityNames,
  extractMetaDescription,
  extractPageTitle,
  fetchHtmlPage,
  type NormalizedCelebrityCharityEvent,
} from './celebrity-charity-shared.js';

export type BigSlickKcSourceConfig = {
  pageUrl?: string;
};

const DEFAULT_PAGE_URL = 'https://www.bigslickkc.org/';

const BIG_SLICK_CELEBRITIES = [
  'Paul Rudd',
  'Jason Sudeikis',
  'Eric Stonestreet',
  'Rob Riggle',
  'David Koechner',
];

export function parseBigSlickKcSourceConfig(raw: unknown): BigSlickKcSourceConfig {
  const c = (raw ?? {}) as Record<string, unknown>;
  return {
    pageUrl: typeof c.pageUrl === 'string' ? c.pageUrl : DEFAULT_PAGE_URL,
  };
}

export async function loadBigSlickKcEvents(
  config: BigSlickKcSourceConfig,
): Promise<NormalizedCelebrityCharityEvent[]> {
  const parsed = parseBigSlickKcSourceConfig(config);
  const url = parsed.pageUrl ?? DEFAULT_PAGE_URL;
  const html = await fetchHtmlPage(url);
  const pageTitle = extractPageTitle(html) || 'Big Slick Celebrity Weekend';
  const description =
    extractMetaDescription(html) ||
    "Big Slick is an annual fundraising event hosted by Kansas City's most famous funny people. Benefits Children's Mercy Hospital.";
  const now = new Date();
  const eventDate = new Date(now.getFullYear(), 5, 6);

  return [
    buildCelebrityCharityEvent({
      externalId: 'big-slick-celebrity-weekend',
      title: 'Big Slick Celebrity Weekend — annual celebrity fundraiser for Children\'s Mercy',
      body: description,
      celebrityNames: extractCelebrityNames(pageTitle, `${description} ${BIG_SLICK_CELEBRITIES.join(' ')}`),
      nonprofit: "Children's Mercy Kansas City",
      venue: 'Kansas City Power & Light District',
      category: 'celebrity_event',
      sourceUrl: `${url}#big-slick-weekend`,
      ticketUrl: url,
      publishedAt: now,
      eventDate,
      startDate: eventDate,
      address: 'Kansas City, MO',
      neighborhood: 'power and light',
    }),
    buildCelebrityCharityEvent({
      externalId: 'big-slick-charity-poker',
      title: 'Big Slick Charity Poker Tournament — celebrity-hosted fundraiser',
      body: 'Celebrity poker tournament benefiting Children\'s Mercy Kansas City as part of Big Slick weekend.',
      celebrityNames: BIG_SLICK_CELEBRITIES,
      nonprofit: "Children's Mercy Kansas City",
      venue: 'Kansas City metro',
      category: 'fundraiser',
      sourceUrl: `${url}#charity-poker`,
      ticketUrl: url,
      publishedAt: now,
      eventDate,
      startDate: eventDate,
      address: 'Kansas City, MO',
      neighborhood: 'downtown',
    }),
  ];
}
