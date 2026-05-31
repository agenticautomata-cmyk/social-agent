import { extractLocationClues } from './reddit.js';
import {
  decodeHtmlEntities,
  DEFAULT_USER_AGENT,
  extractAddress,
  extractNamedBlocks,
  extractWebsite,
  externalIdFromUrl,
  fetchRssFeed,
  inferNeighborhood,
  parseRss2Items,
  parseRssDate,
  slugify,
  stripHtml,
} from './business-openings-shared.js';

export type AudienceDealCategory =
  | 'business_closing'
  | 'liquidation_sale'
  | 'consignment_shop'
  | 'luxury_deal'
  | 'staycation'
  | 'spa_package'
  | 'hotel_package';

export type NormalizedAudienceDeal = {
  externalId: string;
  title: string;
  body: string;
  businessName: string;
  category: AudienceDealCategory;
  sourceUrl: string;
  website: string | null;
  publishedAt: Date;
  startDate: Date | null;
  endDate: Date | null;
  address: string | null;
  neighborhood: string | null;
  closingFlag: boolean;
  liquidationFlag: boolean;
  consignmentFlag: boolean;
  luxuryFlag: boolean;
  locationClues: string[];
  locationHint: string | null;
};

export {
  DEFAULT_USER_AGENT,
  fetchRssFeed,
  parseRss2Items,
  stripHtml,
  slugify,
  externalIdFromUrl,
  firstTag,
} from './business-openings-shared.js';

const CLOSING_SIGNAL_RE =
  /\b(clos(?:ing|es|ed)|shut(?:ting)? down|permanently closed|ceased operations|closing its doors|ride off into the sunset|final day|last day)\b/i;

const LIQUIDATION_SIGNAL_RE =
  /\b(liquidation|going out of business|going-out-of-business|store closing sale|everything must go|final sale|clearance sale|moving sale|closeout sale|fire sale)\b/i;

const OPENING_SIGNAL_RE =
  /\b(open(?:ing|s|ed)?|now open|grand opening|soft[- ]opening|ribbon[- ]cutting|new location)\b/i;

const LUXURY_SIGNAL_RE =
  /\b(luxury|spa package|hotel package|resort package|staycation|getaway special|weekend getaway|romantic|rooftop|fine dining|michelin|tasting menu|vip experience)\b/i;

const SECTION_HEADERS = new Set([
  'opening',
  'openings',
  'closing',
  'closings',
  'news bites',
  'events',
  'festivals',
  'food news',
  'sipps',
  'kc sipps',
  'this week',
  'weekend',
]);

export function flagsForCategory(category: AudienceDealCategory): Pick<
  NormalizedAudienceDeal,
  'closingFlag' | 'liquidationFlag' | 'consignmentFlag' | 'luxuryFlag'
> {
  return {
    closingFlag: category === 'business_closing',
    liquidationFlag: category === 'liquidation_sale',
    consignmentFlag: category === 'consignment_shop',
    luxuryFlag:
      category === 'luxury_deal' ||
      category === 'staycation' ||
      category === 'spa_package' ||
      category === 'hotel_package',
  };
}

export function detectClosingSignal(title: string, body: string): boolean {
  const text = `${title} ${body}`;
  return CLOSING_SIGNAL_RE.test(text) || LIQUIDATION_SIGNAL_RE.test(text);
}

export function classifyClosingCategory(
  title: string,
  body: string,
  businessName: string,
): AudienceDealCategory {
  const text = `${title} ${body} ${businessName}`.toLowerCase();
  if (LIQUIDATION_SIGNAL_RE.test(text)) return 'liquidation_sale';
  return 'business_closing';
}

export function classifyLuxuryCategory(title: string, body: string): AudienceDealCategory {
  const text = `${title} ${body}`.toLowerCase();
  if (/\b(spa package|day spa|massage package|wellness package|spa day)\b/.test(text)) return 'spa_package';
  if (/\b(hotel package|resort package|room package|suite package|overnight package)\b/.test(text)) {
    return 'hotel_package';
  }
  if (/\b(staycation|weekend getaway|local getaway|romantic getaway|stay local)\b/.test(text)) {
    return 'staycation';
  }
  return 'luxury_deal';
}

export function parseEventDate(text: string, refDate: Date): Date | null {
  const monthDay = text.match(
    /\b(?:on\s+|as of\s+|by\s+)?(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?\b/i,
  );
  if (monthDay) {
    const year = monthDay[3] ? parseInt(monthDay[3], 10) : refDate.getFullYear();
    const d = new Date(`${monthDay[1]} ${monthDay[2]}, ${year}`);
    if (!Number.isNaN(d.getTime())) return d;
  }

  if (/\b(end of (?:the )?year|late december|mid-december)\b/i.test(text)) {
    return new Date(refDate.getFullYear(), 11, 31);
  }

  return null;
}

function inferBusinessNameFromClosingTitle(title: string): string | null {
  const closing = title.match(/^(.+?)\s+(?:is closing|closes|to close|closing its|announces closure|closed)\b/i);
  if (closing?.[1] && closing[1].length <= 80) return closing[1].trim();
  if (/^KC Sipps:/i.test(title)) return null;
  return null;
}

export function buildAudienceDeal(params: {
  externalId: string;
  title: string;
  body: string;
  businessName: string;
  category: AudienceDealCategory;
  sourceUrl: string;
  website?: string | null;
  publishedAt: Date;
  startDate?: Date | null;
  endDate?: Date | null;
  address?: string | null;
  neighborhood?: string | null;
}): NormalizedAudienceDeal {
  const locationClues = extractLocationClues(params.title, params.body);
  const neighborhood =
    params.neighborhood ?? inferNeighborhood(params.title, params.body, params.address ?? null);

  return {
    externalId: params.externalId,
    title: params.title,
    body: params.body.slice(0, 4000),
    businessName: params.businessName,
    category: params.category,
    sourceUrl: params.sourceUrl,
    website: params.website ?? null,
    publishedAt: params.publishedAt,
    startDate: params.startDate ?? null,
    endDate: params.endDate ?? null,
    address: params.address ?? null,
    neighborhood,
    locationClues,
    locationHint: neighborhood ?? params.address ?? locationClues[0] ?? 'kansas city',
    ...flagsForCategory(params.category),
  };
}

export function extractSippsClosings(item: {
  title: string;
  link: string;
  pubDate: string;
  content: string;
  rawContent: string;
}): NormalizedAudienceDeal[] {
  const publishedAt = parseRssDate(item.pubDate);
  const articleTitle = stripHtml(item.title);
  const results: NormalizedAudienceDeal[] = [];

  const closingSection = item.rawContent.match(
    /<b>\s*Closing[s]?\s*:?\s*<\/b>([\s\S]*?)(?=<div class="article-categories|<\/content:encoded>|$)/i,
  );
  const searchHtml = closingSection?.[1] ?? '';
  if (!searchHtml) return results;

  const blocks = extractNamedBlocks(searchHtml);
  for (const block of blocks) {
    const blockText = `${block.name} ${block.text}`;
    if (OPENING_SIGNAL_RE.test(blockText) && !CLOSING_SIGNAL_RE.test(blockText)) continue;
    if (!CLOSING_SIGNAL_RE.test(blockText) && !LIQUIDATION_SIGNAL_RE.test(blockText)) continue;

    const category = classifyClosingCategory(articleTitle, blockText, block.name);
    const endDate = parseEventDate(blockText, publishedAt) ?? publishedAt;
    const address = extractAddress(blockText);
    const website = extractWebsite(block.html, block.name);
    const slug = slugify(block.name);

    results.push(
      buildAudienceDeal({
        externalId: `${externalIdFromUrl(item.link)}#closing-${slug}`,
        title: `${block.name} closing`,
        body: blockText,
        businessName: block.name,
        category,
        sourceUrl: `${item.link}#closing-${slug}`,
        website,
        publishedAt,
        startDate: publishedAt,
        endDate,
        address,
      }),
    );
  }

  return results;
}

export function normalizeClosingArticle(
  item: { title: string; link: string; pubDate: string; content: string; rawContent: string },
  opts?: { urlSuffix?: string },
): NormalizedAudienceDeal | null {
  const title = stripHtml(item.title);
  const body = item.content;
  if (!detectClosingSignal(title, body)) return null;
  if (OPENING_SIGNAL_RE.test(title) && !CLOSING_SIGNAL_RE.test(`${title} ${body}`)) return null;
  if (/^four inane questions\b/i.test(title)) return null;

  const publishedAt = parseRssDate(item.pubDate);
  const businessName = inferBusinessNameFromClosingTitle(title) ?? title.slice(0, 120);
  const category = classifyClosingCategory(title, body, businessName);
  const endDate = parseEventDate(`${title} ${body}`, publishedAt) ?? publishedAt;
  const address = extractAddress(`${title} ${body}`);
  const website = extractWebsite(item.rawContent, businessName);

  const urlSuffix = opts?.urlSuffix ?? '';
  const sourceUrl = `${item.link}${urlSuffix}`;
  const externalId = urlSuffix
    ? `${externalIdFromUrl(item.link)}${urlSuffix.replace('#', '-')}`
    : externalIdFromUrl(item.link);

  return buildAudienceDeal({
    externalId,
    title,
    body,
    businessName,
    category,
    sourceUrl,
    website,
    publishedAt,
    startDate: publishedAt,
    endDate,
    address,
  });
}

export function normalizeLuxuryArticle(
  item: { title: string; link: string; pubDate: string; content: string; rawContent: string },
  opts?: { urlSuffix?: string },
): NormalizedAudienceDeal | null {
  const title = stripHtml(item.title);
  const body = item.content;
  if (!LUXURY_SIGNAL_RE.test(`${title} ${body}`)) return null;
  if (/\b(restaurant week|donation to local charity|tourism outlook|black history month)\b/i.test(title)) {
    return null;
  }

  const publishedAt = parseRssDate(item.pubDate);
  const category = classifyLuxuryCategory(title, body);
  const businessName = title.slice(0, 120);
  const startDate = parseEventDate(`${title} ${body}`, publishedAt) ?? publishedAt;
  const address = extractAddress(`${title} ${body}`);
  const website = extractWebsite(item.rawContent, businessName);

  const urlSuffix = opts?.urlSuffix ?? '';
  const sourceUrl = `${item.link}${urlSuffix}`;
  const externalId = urlSuffix
    ? `${externalIdFromUrl(item.link)}${urlSuffix.replace('#', '-')}`
    : externalIdFromUrl(item.link);

  return buildAudienceDeal({
    externalId,
    title,
    body,
    businessName,
    category,
    sourceUrl,
    website,
    publishedAt,
    startDate,
    endDate: null,
    address,
  });
}

export function dedupeAudienceDeals(items: NormalizedAudienceDeal[]): NormalizedAudienceDeal[] {
  const byKey = new Map<string, NormalizedAudienceDeal>();
  for (const item of items) {
    byKey.set(item.externalId, item);
  }
  return [...byKey.values()];
}
