import { extractLocationClues } from './reddit.js';
import {
  decodeHtmlEntities,
  externalIdFromUrl,
  extractAddress,
  extractWebsite,
  fetchRssFeed,
  inferNeighborhood,
  parseRss2Items,
  parseRssDate,
  slugify,
  stripHtml,
  firstTag,
} from './business-openings-shared.js';

export type RevenueCategory =
  | 'hotel_package'
  | 'spa_package'
  | 'date_night'
  | 'luxury_dining'
  | 'rooftop_experience'
  | 'wine_tasting'
  | 'couples_event'
  | 'weekend_getaway';

export type NormalizedRevenueOpportunity = {
  externalId: string;
  title: string;
  body: string;
  businessName: string;
  venue: string | null;
  category: RevenueCategory;
  sourceUrl: string;
  website: string | null;
  publishedAt: Date;
  eventDate: Date | null;
  startDate: Date | null;
  endDate: Date | null;
  address: string | null;
  neighborhood: string | null;
  hotelFlag: boolean;
  spaFlag: boolean;
  dateNightFlag: boolean;
  luxuryFlag: boolean;
  rooftopFlag: boolean;
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

export function flagsForRevenueCategory(category: RevenueCategory): Pick<
  NormalizedRevenueOpportunity,
  'hotelFlag' | 'spaFlag' | 'dateNightFlag' | 'luxuryFlag' | 'rooftopFlag'
> {
  return {
    hotelFlag: category === 'hotel_package' || category === 'weekend_getaway',
    spaFlag: category === 'spa_package',
    dateNightFlag:
      category === 'date_night' ||
      category === 'couples_event' ||
      category === 'wine_tasting',
    luxuryFlag:
      category === 'luxury_dining' ||
      category === 'hotel_package' ||
      category === 'spa_package' ||
      category === 'weekend_getaway' ||
      category === 'couples_event',
    rooftopFlag: category === 'rooftop_experience',
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
  return null;
}

export function buildRevenueOpportunity(params: {
  externalId: string;
  title: string;
  body: string;
  businessName: string;
  venue?: string | null;
  category: RevenueCategory;
  sourceUrl: string;
  website?: string | null;
  publishedAt: Date;
  eventDate?: Date | null;
  startDate?: Date | null;
  endDate?: Date | null;
  address?: string | null;
  neighborhood?: string | null;
}): NormalizedRevenueOpportunity {
  const locationClues = extractLocationClues(params.title, params.body);
  const neighborhood =
    params.neighborhood ?? inferNeighborhood(params.title, params.body, params.address ?? null);
  const eventDate = params.eventDate ?? params.startDate ?? null;

  return {
    externalId: params.externalId,
    title: params.title,
    body: params.body.slice(0, 4000),
    businessName: params.businessName,
    venue: params.venue ?? params.businessName,
    category: params.category,
    sourceUrl: params.sourceUrl,
    website: params.website ?? null,
    publishedAt: params.publishedAt,
    eventDate,
    startDate: params.startDate ?? eventDate,
    endDate: params.endDate ?? null,
    address: params.address ?? null,
    neighborhood,
    locationClues,
    locationHint: neighborhood ?? params.address ?? params.venue ?? locationClues[0] ?? 'kansas city',
    ...flagsForRevenueCategory(params.category),
  };
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
    const rawContent = `${description}\n${content}`;
    items.push({
      title,
      link,
      pubDate,
      content: stripHtml(`${description} ${content}`),
      rawContent,
    });
  }

  return items;
}

export function classifyRssRevenueCategory(
  title: string,
  body: string,
  defaultCategory: RevenueCategory,
): RevenueCategory {
  const text = `${title} ${body}`.toLowerCase();
  if (/\b(hotel package|room package|suite package|overnight package|resort package)\b/.test(text)) {
    return 'hotel_package';
  }
  if (/\b(spa package|spa day|massage package|wellness package|day spa)\b/.test(text)) {
    return 'spa_package';
  }
  if (/\b(wine tasting|wine dinner|winery|sommelier|vineyard)\b/.test(text)) {
    return 'wine_tasting';
  }
  if (/\b(rooftop|skyline view|rooftop bar|rooftop lounge)\b/.test(text)) {
    return 'rooftop_experience';
  }
  if (/\b(tasting menu|chef'?s table|prix fixe|fine dining|michelin)\b/.test(text)) {
    return 'luxury_dining';
  }
  if (/\b(romantic|couples|date night|valentine|anniversary)\b/.test(text)) {
    return 'couples_event';
  }
  if (/\b(weekend getaway|staycation|weekend escape|weekend package)\b/.test(text)) {
    return 'weekend_getaway';
  }
  if (/\b(date night|evening performance|dinner and a show)\b/.test(text)) {
    return 'date_night';
  }
  return defaultCategory;
}

export function normalizeRssRevenueItem(
  item: { title: string; link: string; pubDate: string; content: string; rawContent: string },
  opts: { urlSuffix: string; defaultCategory: RevenueCategory; businessName?: string },
): NormalizedRevenueOpportunity | null {
  const title = stripHtml(item.title);
  const body = item.content;
  if (!title) return null;

  const publishedAt = parseRssDate(item.pubDate);
  const category = classifyRssRevenueCategory(title, body, opts.defaultCategory);
  const businessName = opts.businessName ?? title.slice(0, 120);
  const eventDate = parseEventDate(`${title} ${body}`, publishedAt) ?? publishedAt;
  const address = extractAddress(`${title} ${body}`);
  const website = extractWebsite(item.rawContent, businessName);
  const sourceUrl = `${item.link}${opts.urlSuffix}`;
  const externalId = `${externalIdFromUrl(item.link)}${opts.urlSuffix.replace('#', '-')}`;

  return buildRevenueOpportunity({
    externalId,
    title,
    body,
    businessName,
    venue: businessName,
    category,
    sourceUrl,
    website,
    publishedAt,
    eventDate,
    startDate: eventDate,
    endDate: null,
    address,
  });
}

export function dedupeRevenueOpportunities(
  items: NormalizedRevenueOpportunity[],
): NormalizedRevenueOpportunity[] {
  const byKey = new Map<string, NormalizedRevenueOpportunity>();
  for (const item of items) {
    byKey.set(item.externalId, item);
  }
  return [...byKey.values()];
}

export type RevenueDirectoryEntry = {
  slug: string;
  businessName: string;
  title: string;
  venue: string;
  address: string;
  neighborhood: string;
  website: string;
  description: string;
  category: RevenueCategory;
};

export function loadRevenueDirectory(
  entries: RevenueDirectoryEntry[],
  urlSuffix: string,
): NormalizedRevenueOpportunity[] {
  const now = new Date();
  return entries.map((entry) =>
    buildRevenueOpportunity({
      externalId: `${urlSuffix.replace('#', '')}-${entry.slug}`,
      title: entry.title,
      body: entry.description,
      businessName: entry.businessName,
      venue: entry.venue,
      category: entry.category,
      sourceUrl: `${entry.website.replace(/\/$/, '')}${urlSuffix}`,
      website: entry.website,
      publishedAt: now,
      eventDate: now,
      startDate: now,
      endDate: null,
      address: entry.address,
      neighborhood: entry.neighborhood,
    }),
  );
}
