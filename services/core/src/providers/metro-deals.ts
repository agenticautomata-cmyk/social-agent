import {
  decodeHtmlEntities,
  externalIdFromUrl,
  fetchRssFeed,
  inferNeighborhood,
  parseRss2Items,
  parseRssDate,
  stripHtml,
} from './business-openings-shared.js';
import { hasDiscountSignal, hasHolidaySaleSignal } from '../discount-watch/luxury-keywords.js';

export type DealCategory =
  | 'holiday_sale'
  | 'retail_sale'
  | 'seasonal_sale'
  | 'major_discount'
  | 'thrift_sale'
  | 'grocery_deal'
  | 'warehouse_sale'
  | 'luxury_deal'
  | 'deal';

export type NormalizedMetroDeal = {
  externalId: string;
  title: string;
  body: string;
  sourceUrl: string;
  publishedAt: Date;
  eventDate: Date | null;
  businessName: string;
  category: DealCategory;
  locationHint: string | null;
  percentOff: string | null;
  priceHint: string | null;
};

export type MetroDealsSourceConfig = {
  feedUrl: string;
  limit?: number;
  maxAgeDays?: number;
  strictDealFilter?: boolean;
  excludeTitlePattern?: string;
};

const BROAD_NEWS_EXCLUDE_RE =
  /\b(crime|shooting|murder|arrest|weather|forecast|traffic|crash|investigation|lawsuit|election|candidate|primary|ballot|covid|school board|obituary)\b/i;

export function parseMetroDealsSourceConfig(raw: unknown): MetroDealsSourceConfig {
  const c = (raw ?? {}) as Record<string, unknown>;
  if (typeof c.feedUrl !== 'string' || !c.feedUrl.trim()) {
    throw new Error('metro_deals source requires config.feedUrl');
  }
  return {
    feedUrl: c.feedUrl.trim(),
    limit: typeof c.limit === 'number' ? c.limit : 60,
    maxAgeDays: typeof c.maxAgeDays === 'number' ? c.maxAgeDays : 90,
    strictDealFilter: c.strictDealFilter === true,
    excludeTitlePattern:
      typeof c.excludeTitlePattern === 'string' ? c.excludeTitlePattern : undefined,
  };
}

function extractPercentOff(text: string): string | null {
  const match = text.match(/\b(\d{1,2}(?:\.\d+)?%)\s*(?:off|OFF)\b/);
  return match?.[1] ?? null;
}

function extractPriceHint(text: string): string | null {
  const bogo = text.match(/\b(BOGO|buy one get one|buy \d+ get \d+)\b/i);
  if (bogo) return bogo[0];
  const from = text.match(/\bfrom \$\d+(?:\.\d{2})?\b/i);
  if (from) return from[0];
  const spend = text.match(/\bspend \$\d+[^.]{0,40}/i);
  if (spend) return spend[0].trim();
  return null;
}

function inferBusinessName(title: string): string {
  const colon = title.match(/^([^:–—-]{2,60})[:–—-]/);
  if (colon?.[1]) return colon[1].trim();
  const at = title.match(/^(.+?)\s+(?:at|in)\s+[A-Z]/);
  if (at?.[1] && at[1].length <= 60) return at[1].trim();
  return title.slice(0, 80);
}

export function classifyDealCategory(title: string, body: string): DealCategory {
  const text = `${title} ${body}`.toLowerCase();
  if (hasHolidaySaleSignal(title, body)) return 'holiday_sale';
  if (/\b(goodwill|savers|thrift|consignment|half[- ]price|color of the week)\b/i.test(text)) {
    return 'thrift_sale';
  }
  if (/\b(hy-vee|price chopper|grocery|kroger|costco|sam's club|whole foods)\b/i.test(text)) {
    return 'grocery_deal';
  }
  if (/\b(clearance|warehouse sale|liquidation|going out of business)\b/i.test(text)) {
    return 'warehouse_sale';
  }
  if (/\b(outlet|mall|plaza|zona rosa|legends|tanger|oak park|corbin|crown center)\b/i.test(text)) {
    return 'retail_sale';
  }
  if (/\b(hotel|spa|resort|staycation|package)\b/i.test(text)) return 'luxury_deal';
  if (/\b(\d{1,2}% off|black friday|semi-annual|doorbuster)\b/i.test(text)) return 'major_discount';
  return 'deal';
}

function normalizeArticleDeal(item: {
  title: string;
  link: string;
  pubDate: string;
  content: string;
}): NormalizedMetroDeal | null {
  const title = decodeHtmlEntities(stripHtml(item.title));
  const body = item.content;
  if (!hasDiscountSignal(title, body) && !hasHolidaySaleSignal(title, body)) return null;

  const publishedAt = parseRssDate(item.pubDate);
  const businessName = inferBusinessName(title);
  const category = classifyDealCategory(title, body);
  const locationHint = inferNeighborhood(title, body, null);

  return {
    externalId: externalIdFromUrl(item.link),
    title: title.slice(0, 500),
    body: body.slice(0, 4000),
    sourceUrl: item.link,
    publishedAt,
    eventDate: null,
    businessName,
    category,
    locationHint,
    percentOff: extractPercentOff(`${title} ${body}`),
    priceHint: extractPriceHint(`${title} ${body}`),
  };
}

export function dedupeDeals(items: NormalizedMetroDeal[]): NormalizedMetroDeal[] {
  const byKey = new Map<string, NormalizedMetroDeal>();
  for (const item of items) {
    byKey.set(item.externalId, item);
  }
  return [...byKey.values()];
}

export async function loadMetroDeals(config: MetroDealsSourceConfig): Promise<NormalizedMetroDeal[]> {
  const parsed = parseMetroDealsSourceConfig(config);
  const xml = await fetchRssFeed(parsed.feedUrl);
  const items = parseRss2Items(xml).slice(0, parsed.limit ?? 60);
  const excludeRe = parsed.excludeTitlePattern
    ? new RegExp(parsed.excludeTitlePattern, 'i')
    : null;
  const results: NormalizedMetroDeal[] = [];

  for (const item of items) {
    const title = decodeHtmlEntities(stripHtml(item.title));
    if (excludeRe?.test(title)) continue;
    if (parsed.strictDealFilter && BROAD_NEWS_EXCLUDE_RE.test(title)) continue;

    const text = `${title} ${item.content}`;
    if (!hasDiscountSignal(title, item.content) && !hasHolidaySaleSignal(title, item.content)) {
      continue;
    }

    if (parsed.strictDealFilter) {
      const titleDeal =
        /\b(\d{1,2}% off|sale|clearance|discount|deal|BOGO|black friday|holiday|coupon|promo)\b/i.test(
          title,
        );
      if (!titleDeal) continue;
    }

    const deal = normalizeArticleDeal({ ...item, title });
    if (deal) results.push(deal);
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (parsed.maxAgeDays ?? 90));

  return dedupeDeals(results).filter((item) => item.publishedAt >= cutoff);
}
