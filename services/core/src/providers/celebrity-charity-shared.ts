import { extractLocationClues } from './reddit.js';
import {
  decodeHtmlEntities,
  externalIdFromUrl,
  extractAddress,
  fetchRssFeed,
  inferNeighborhood,
  parseRss2Items,
  parseRssDate,
  slugify,
  stripHtml,
  firstTag,
} from './business-openings-shared.js';

export type CelebrityCharityCategory =
  | 'celebrity_event'
  | 'charity_event'
  | 'fundraiser'
  | 'benefit_concert'
  | 'gala'
  | 'sports_celebrity_event'
  | 'public_appearance';

export type NormalizedCelebrityCharityEvent = {
  externalId: string;
  title: string;
  body: string;
  celebrityNames: string[];
  nonprofit: string | null;
  venue: string | null;
  category: CelebrityCharityCategory;
  sourceUrl: string;
  ticketUrl: string | null;
  publishedAt: Date;
  eventDate: Date | null;
  startDate: Date | null;
  endDate: Date | null;
  address: string | null;
  neighborhood: string | null;
  celebrityFlag: boolean;
  charityFlag: boolean;
  fundraiserFlag: boolean;
  galaFlag: boolean;
  locationClues: string[];
  locationHint: string | null;
};

export {
  fetchRssFeed,
  parseRss2Items,
  stripHtml,
  slugify,
  externalIdFromUrl,
  firstTag,
  decodeHtmlEntities,
};

const KNOWN_KC_CELEBRITIES = [
  'Paul Rudd',
  'Jason Sudeikis',
  'Eric Stonestreet',
  'Rob Riggle',
  'David Koechner',
  'Travis Kelce',
  'Patrick Mahomes',
  'Andy Reid',
  'George Brett',
  'Bobby Witt Jr.',
  'Salvador Perez',
  'Johnny Kaw',
  'Jonathan Van Ness',
  'Graham Nash',
  'Herbie Hancock',
  'Trey Anastasio',
];

const CHARITY_SIGNAL_RE =
  /\b(charity|charitable|fundrais(?:er|ing)?|benefit|gala|nonprofit|foundation|donat(?:e|ion)|auction|telethon|red carpet|meet and greet|meet-and-greet|public appearance|celebrity|Big Slick|Children'?s Mercy|United Way|Red Friday|community event|giving back)\b/i;

const GALA_SIGNAL_RE = /\b(gala|black tie|red carpet|awards dinner|ball\b|soirée|soiree)\b/i;
const FUNDRAISER_SIGNAL_RE = /\b(fundrais(?:er|ing)?|benefit|auction|telethon|donat(?:e|ion)|Big Slick)\b/i;
const BENEFIT_CONCERT_RE = /\b(benefit concert|concert for|tribute concert|benefiting)\b/i;
const SPORTS_CHARITY_RE =
  /\b(Chiefs|Royals|Sporting KC|KC Current|player|athlete|charity game|community)\b/i;
const PUBLIC_APPEARANCE_RE = /\b(meet and greet|meet-and-greet|public appearance|signing|autograph|photo op)\b/i;

export function flagsForCelebrityCharityCategory(category: CelebrityCharityCategory): Pick<
  NormalizedCelebrityCharityEvent,
  'celebrityFlag' | 'charityFlag' | 'fundraiserFlag' | 'galaFlag'
> {
  return {
    celebrityFlag:
      category === 'celebrity_event' ||
      category === 'sports_celebrity_event' ||
      category === 'public_appearance' ||
      category === 'benefit_concert',
    charityFlag:
      category === 'charity_event' ||
      category === 'fundraiser' ||
      category === 'gala' ||
      category === 'benefit_concert' ||
      category === 'sports_celebrity_event' ||
      category === 'celebrity_event',
    fundraiserFlag:
      category === 'fundraiser' ||
      category === 'gala' ||
      category === 'benefit_concert' ||
      category === 'charity_event',
    galaFlag: category === 'gala',
  };
}

export function parseEventDate(text: string, refDate: Date): Date | null {
  const monthDay = text.match(
    /\b(?:on\s+|for\s+)?(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?\b/i,
  );
  if (monthDay) {
    const year = monthDay[3] ? parseInt(monthDay[3], 10) : refDate.getFullYear();
    const d = new Date(`${monthDay[1]} ${monthDay[2]}, ${year}`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const range = text.match(
    /\b(June|July|August|September|October|November|December)\s+(\d{1,2})\s*[-–]\s*(\d{1,2})(?:,?\s*(\d{4}))?\b/i,
  );
  if (range) {
    const year = range[4] ? parseInt(range[4], 10) : refDate.getFullYear();
    const d = new Date(`${range[1]} ${range[2]}, ${year}`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

export function extractCelebrityNames(title: string, body: string): string[] {
  const text = `${title} ${body}`;
  const found = new Set<string>();
  for (const name of KNOWN_KC_CELEBRITIES) {
    if (text.toLowerCase().includes(name.toLowerCase())) {
      found.add(name);
    }
  }
  const featuring = text.match(/\b(?:featuring|with|hosted by|starring|headlined by)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/g);
  if (featuring) {
    for (const chunk of featuring) {
      const name = chunk.replace(/^[^:]+:\s*/i, '').trim();
      if (name.length > 3 && name.length < 40) found.add(name);
    }
  }
  return [...found];
}

export function extractNonprofit(title: string, body: string): string | null {
  const text = `${title} ${body}`;
  const patterns = [
    /\bbenefit(?:ing|s)?\s+([A-Z][A-Za-z0-9&'.\-\s]{3,60}?)(?:\.|,|\s+and\b|\s+at\b|$)/,
    /\bfor\s+(Children'?s Mercy(?:\s+Hospital)?)/i,
    /\b(Children'?s Mercy(?:\s+(?:Hospital|Kansas City))?)/i,
    /\b(United Way(?:\s+of\s+Greater\s+Kansas\s+City)?)/i,
    /\b(Kansas City Chiefs Foundation)/i,
    /\b(Kansas City Royals(?:\s+Charities)?)/i,
    /\b(Sporting KC Foundation)/i,
    /\b(KC Current(?:\s+Community)?)/i,
    /\b(Big Slick(?:\s+Celebrities)?)/i,
  ];
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m?.[1]) return m[1].trim();
  }
  if (/children'?s mercy/i.test(text)) return "Children's Mercy Kansas City";
  return null;
}

export function classifyCelebrityCharityCategory(
  title: string,
  body: string,
  opts?: { sportsTeam?: string },
): CelebrityCharityCategory {
  const text = `${title} ${body}`.toLowerCase();
  if (opts?.sportsTeam || SPORTS_CHARITY_RE.test(`${title} ${body}`)) {
    if (/charity game|player|athlete|community/i.test(text)) return 'sports_celebrity_event';
  }
  if (PUBLIC_APPEARANCE_RE.test(text)) return 'public_appearance';
  if (BENEFIT_CONCERT_RE.test(text)) return 'benefit_concert';
  if (GALA_SIGNAL_RE.test(text)) return 'gala';
  if (FUNDRAISER_SIGNAL_RE.test(text)) return 'fundraiser';
  if (/big slick|celebrity/i.test(text)) return 'celebrity_event';
  if (CHARITY_SIGNAL_RE.test(text)) return 'charity_event';
  return 'charity_event';
}

export function detectCharitySignal(title: string, body: string): boolean {
  return CHARITY_SIGNAL_RE.test(`${title} ${body}`);
}

export function buildCelebrityCharityEvent(params: {
  externalId: string;
  title: string;
  body: string;
  celebrityNames?: string[];
  nonprofit?: string | null;
  venue?: string | null;
  category: CelebrityCharityCategory;
  sourceUrl: string;
  ticketUrl?: string | null;
  publishedAt: Date;
  eventDate?: Date | null;
  startDate?: Date | null;
  endDate?: Date | null;
  address?: string | null;
  neighborhood?: string | null;
}): NormalizedCelebrityCharityEvent {
  const celebrityNames =
    params.celebrityNames ??
    extractCelebrityNames(params.title, params.body);
  const nonprofit =
    params.nonprofit ?? extractNonprofit(params.title, params.body);
  const locationClues = extractLocationClues(params.title, params.body);
  const neighborhood =
    params.neighborhood ?? inferNeighborhood(params.title, params.body, params.address ?? null);
  const eventDate = params.eventDate ?? params.startDate ?? null;

  return {
    externalId: params.externalId,
    title: params.title,
    body: params.body.slice(0, 4000),
    celebrityNames,
    nonprofit,
    venue: params.venue ?? null,
    category: params.category,
    sourceUrl: params.sourceUrl,
    ticketUrl: params.ticketUrl ?? null,
    publishedAt: params.publishedAt,
    eventDate,
    startDate: params.startDate ?? eventDate,
    endDate: params.endDate ?? null,
    address: params.address ?? null,
    neighborhood,
    locationClues,
    locationHint: neighborhood ?? params.venue ?? params.address ?? locationClues[0] ?? 'kansas city',
    ...flagsForCelebrityCharityCategory(params.category),
  };
}

export type CharityDirectoryEntry = {
  slug: string;
  title: string;
  body: string;
  celebrityNames?: string[];
  nonprofit: string;
  venue: string;
  address: string;
  neighborhood: string;
  sourceUrl: string;
  ticketUrl?: string;
  category: CelebrityCharityCategory;
  eventDate?: string;
};

export function loadCharityDirectory(
  entries: CharityDirectoryEntry[],
  urlSuffix = '',
): NormalizedCelebrityCharityEvent[] {
  const now = new Date();
  return entries.map((entry) => {
    const refDate = entry.eventDate ? new Date(entry.eventDate) : now;
    const eventDate = entry.eventDate ? new Date(entry.eventDate) : parseEventDate(entry.body, now) ?? now;
    return buildCelebrityCharityEvent({
      externalId: `charity-${entry.slug}`,
      title: entry.title,
      body: entry.body,
      celebrityNames: entry.celebrityNames,
      nonprofit: entry.nonprofit,
      venue: entry.venue,
      category: entry.category,
      sourceUrl: `${entry.sourceUrl.replace(/\/$/, '')}${urlSuffix}`,
      ticketUrl: entry.ticketUrl ?? entry.sourceUrl,
      publishedAt: refDate,
      eventDate,
      startDate: eventDate,
      endDate: null,
      address: entry.address,
      neighborhood: entry.neighborhood,
    });
  });
}

export function parseVisitKcRssItems(xml: string): Array<{
  title: string;
  link: string;
  pubDate: string;
  content: string;
  rawContent: string;
}> {
  const items: Array<{
    title: string;
    link: string;
    pubDate: string;
    content: string;
    rawContent: string;
  }> = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;
  while ((match = itemRe.exec(xml)) !== null) {
    const block = match[1]!;
    const title = firstTag(block, 'title');
    const link = firstTag(block, 'link');
    const pubDate = firstTag(block, 'pubDate');
    if (!title || !link || !pubDate) continue;
    const description = firstTag(block, 'description') ?? '';
    const content = firstTag(block, 'content') ?? '';
    items.push({
      title,
      link,
      pubDate,
      content: stripHtml(`${description} ${content}`),
      rawContent: `${description}\n${content}`,
    });
  }
  return items;
}

export function normalizeRssCharityItem(
  item: { title: string; link: string; pubDate: string; content: string; rawContent: string },
  opts: { urlSuffix: string; defaultCategory?: CelebrityCharityCategory },
): NormalizedCelebrityCharityEvent | null {
  const title = stripHtml(item.title);
  const body = item.content;
  if (!detectCharitySignal(title, body)) return null;

  const publishedAt = parseRssDate(item.pubDate);
  const category = classifyCelebrityCharityCategory(title, body);
  const eventDate = parseEventDate(`${title} ${body}`, publishedAt) ?? publishedAt;
  const address = extractAddress(`${title} ${body}`);
  const sourceUrl = `${item.link}${opts.urlSuffix}`;
  const externalId = `${externalIdFromUrl(item.link)}${opts.urlSuffix.replace('#', '-')}`;

  return buildCelebrityCharityEvent({
    externalId,
    title,
    body,
    category: opts.defaultCategory ?? category,
    sourceUrl,
    ticketUrl: item.link,
    publishedAt,
    eventDate,
    startDate: eventDate,
    address,
  });
}

export function dedupeCelebrityCharityEvents(
  items: NormalizedCelebrityCharityEvent[],
): NormalizedCelebrityCharityEvent[] {
  const byKey = new Map<string, NormalizedCelebrityCharityEvent>();
  for (const item of items) {
    byKey.set(item.externalId, item);
  }
  return [...byKey.values()];
}

const DEFAULT_USER_AGENT = 'Benson/0.1 (Kellie Assistant; +https://github.com/anthonyonazure/social-agent)';

export async function fetchHtmlPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': DEFAULT_USER_AGENT, Accept: 'text/html' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`fetch failed (${res.status}): ${url}`);
  return res.text();
}

export function extractMetaDescription(html: string): string {
  const m = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
  return m?.[1] ? decodeHtmlEntities(stripHtml(m[1])) : '';
}

export function extractPageTitle(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m?.[1] ? decodeHtmlEntities(stripHtml(m[1])) : '';
}
