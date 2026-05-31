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
} from './business-openings-shared.js';

export type ShoppingRetailCategory =
  | 'boutique_opening'
  | 'retail_opening'
  | 'pop_up_shop'
  | 'artisan_market'
  | 'vendor_market'
  | 'vintage_market'
  | 'luxury_resale'
  | 'consignment_event'
  | 'warehouse_sale'
  | 'sidewalk_sale'
  | 'collector_show'
  | 'antique_market'
  | 'maker_market'
  | 'seasonal_market'
  | 'shopping_event';

export type NormalizedShoppingRetailItem = {
  externalId: string;
  title: string;
  body: string;
  businessName: string;
  eventName: string | null;
  category: ShoppingRetailCategory;
  sourceUrl: string;
  publishedAt: Date;
  eventStartsAt: Date | null;
  eventEndsAt: Date | null;
  venue: string | null;
  address: string | null;
  neighborhood: string | null;
  shoppingFlag: boolean;
  retailFlag: boolean;
  vendorMarketFlag: boolean;
  collectorFlag: boolean;
  locationClues: string[];
  locationHint: string | null;
};

export type ShoppingRetailEntry = {
  slug: string;
  businessName: string;
  eventName?: string | null;
  title: string;
  body: string;
  category: ShoppingRetailCategory;
  sourceUrl: string;
  venue?: string | null;
  address?: string | null;
  neighborhood?: string | null;
  eventStartsAt?: string | null;
  eventEndsAt?: string | null;
};

const OPENING_CATEGORIES = new Set<ShoppingRetailCategory>([
  'boutique_opening',
  'retail_opening',
  'pop_up_shop',
]);

const MARKET_CATEGORIES = new Set<ShoppingRetailCategory>([
  'artisan_market',
  'vendor_market',
  'vintage_market',
  'antique_market',
  'maker_market',
  'seasonal_market',
]);

const COLLECTOR_CATEGORIES = new Set<ShoppingRetailCategory>([
  'collector_show',
  'shopping_event',
]);

const GENERIC_MALL_NEWS_RE =
  /\b(mall hours|parking update|security alert|job fair|now hiring|weather closure|construction update|renovation complete|thank you for shopping|mall-wide announcement|property management)\b/i;

const TENANT_OPENING_RE =
  /\b(new tenant|now open|grand opening|soft opening|opening soon|debut|pop-up|popup|pop up shop|vendor market|artisan market|trunk show|warehouse sale|sidewalk sale|consignment event|collector show|card show|comicon|exhibitor)\b/i;

export function flagsForShoppingCategory(category: ShoppingRetailCategory): Pick<
  NormalizedShoppingRetailItem,
  'shoppingFlag' | 'retailFlag' | 'vendorMarketFlag' | 'collectorFlag'
> {
  return {
    shoppingFlag: true,
    retailFlag: OPENING_CATEGORIES.has(category) || category === 'luxury_resale' || category === 'warehouse_sale' || category === 'sidewalk_sale',
    vendorMarketFlag: MARKET_CATEGORIES.has(category) || category === 'consignment_event',
    collectorFlag: COLLECTOR_CATEGORIES.has(category),
  };
}

export function classifyShoppingCategory(title: string, body: string): ShoppingRetailCategory {
  const text = `${title} ${body}`.toLowerCase();
  if (/\b(card show|trading card|comicon|comic con|collect-a-con|collector show|exhibitor hall)\b/i.test(text)) {
    return 'collector_show';
  }
  if (/\b(warehouse sale|liquidation sale)\b/i.test(text)) return 'warehouse_sale';
  if (/\b(sidewalk sale)\b/i.test(text)) return 'sidewalk_sale';
  if (/\b(consignment event|consignment sale)\b/i.test(text)) return 'consignment_event';
  if (/\b(luxury resale|designer resale)\b/i.test(text)) return 'luxury_resale';
  if (/\b(vintage market|vintage pop-up)\b/i.test(text)) return 'vintage_market';
  if (/\b(antique market|antique show)\b/i.test(text)) return 'antique_market';
  if (/\b(maker market|made in kc)\b/i.test(text)) return 'maker_market';
  if (/\b(seasonal market|holiday market|spring market|fall market)\b/i.test(text)) return 'seasonal_market';
  if (/\b(artisan market|strawberry swing)\b/i.test(text)) return 'artisan_market';
  if (/\b(vendor market|farmers market vendor|river market)\b/i.test(text)) return 'vendor_market';
  if (/\b(pop-up shop|popup shop|pop up)\b/i.test(text)) return 'pop_up_shop';
  if (/\b(boutique opening|boutique)\b/i.test(text)) return 'boutique_opening';
  if (/\b(retail opening|store opening|new store)\b/i.test(text)) return 'retail_opening';
  if (/\b(shopping event|shop local|retail event)\b/i.test(text)) return 'shopping_event';
  return 'shopping_event';
}

export function isGenericMallNews(title: string, body: string): boolean {
  const text = `${title} ${body}`;
  if (GENERIC_MALL_NEWS_RE.test(text)) return true;
  if (!TENANT_OPENING_RE.test(text) && /\bmall\b/i.test(text)) return true;
  return false;
}

export function hasNamedEntity(businessName: string, title: string): boolean {
  const name = businessName.trim();
  if (name.length < 2) return false;
  if (/^(untitled|unknown|mall event|shopping event)$/i.test(name)) return false;
  if (name.length >= 3 || /\b[A-Z][a-z]+\b/.test(title)) return true;
  return false;
}

export function buildShoppingRetailItem(
  entry: ShoppingRetailEntry,
  sourcePrefix: string,
  refDate: Date = new Date(),
): NormalizedShoppingRetailItem | null {
  if (isGenericMallNews(entry.title, entry.body)) return null;
  if (!hasNamedEntity(entry.businessName, entry.title)) return null;

  const category = entry.category;
  const flags = flagsForShoppingCategory(category);
  const locationClues = extractLocationClues(entry.title, entry.body);
  const neighborhood =
    entry.neighborhood ?? inferNeighborhood(entry.title, entry.body, entry.address ?? null);
  const eventStartsAt = entry.eventStartsAt ? new Date(entry.eventStartsAt) : null;
  const eventEndsAt = entry.eventEndsAt ? new Date(entry.eventEndsAt) : null;

  return {
    externalId: `${sourcePrefix}-${entry.slug}`,
    title: entry.title,
    body: entry.body.slice(0, 4000),
    businessName: entry.businessName,
    eventName: entry.eventName ?? null,
    category,
    sourceUrl: entry.sourceUrl,
    publishedAt: refDate,
    eventStartsAt: eventStartsAt && !Number.isNaN(eventStartsAt.getTime()) ? eventStartsAt : null,
    eventEndsAt: eventEndsAt && !Number.isNaN(eventEndsAt.getTime()) ? eventEndsAt : null,
    venue: entry.venue ?? null,
    address: entry.address ?? null,
    neighborhood,
    ...flags,
    locationClues,
    locationHint: neighborhood ?? entry.venue ?? entry.address ?? locationClues[0] ?? null,
  };
}

export function dedupeShoppingRetailItems(
  items: NormalizedShoppingRetailItem[],
): NormalizedShoppingRetailItem[] {
  const byKey = new Map<string, NormalizedShoppingRetailItem>();
  for (const item of items) {
    const urlKey = item.sourceUrl.split('#')[0] ?? item.sourceUrl;
    const key = `${slugify(item.businessName)}:${item.category}:${urlKey}`;
    if (!byKey.has(key)) byKey.set(key, item);
  }
  return [...byKey.values()];
}

export function dedupeAgainstOpeningSlugs(
  items: NormalizedShoppingRetailItem[],
  openingSlugs: Set<string>,
): NormalizedShoppingRetailItem[] {
  return items.filter((item) => {
    const slug = slugify(item.businessName);
    if (openingSlugs.has(slug)) return false;
    for (const existing of openingSlugs) {
      if (existing.length >= 4 && (slug.includes(existing) || existing.includes(slug))) return false;
    }
    return true;
  });
}

export function entriesFromDirectory(
  entries: ShoppingRetailEntry[],
  sourcePrefix: string,
): NormalizedShoppingRetailItem[] {
  const now = new Date();
  const built = entries
    .map((entry) => buildShoppingRetailItem(entry, sourcePrefix, now))
    .filter((item): item is NormalizedShoppingRetailItem => item != null);
  return dedupeShoppingRetailItems(built);
}

export async function loadShoppingFromRss(
  feedUrl: string,
  sourcePrefix: string,
  opts?: { venue?: string; neighborhood?: string; limit?: number },
): Promise<NormalizedShoppingRetailItem[]> {
  const xml = await fetchRssFeed(feedUrl);
  const items = parseRss2Items(xml).slice(0, opts?.limit ?? 20);
  const now = new Date();
  const results: NormalizedShoppingRetailItem[] = [];

  for (const item of items) {
    const title = decodeHtmlEntities(stripHtml(item.title));
    const body = stripHtml(item.content);
    if (isGenericMallNews(title, body)) continue;
    if (!TENANT_OPENING_RE.test(`${title} ${body}`)) continue;

    const businessName =
      title.match(/^([^—–\-|:]+?)(?:\s+(?:opens|opening|pop-up|market|show))/i)?.[1]?.trim() ??
      title.split(/[—–\-|:]/)[0]?.trim() ??
      title.slice(0, 80);
    if (!hasNamedEntity(businessName, title)) continue;

    const category = classifyShoppingCategory(title, body);
    const address = extractAddress(`${title} ${body}`);
    const publishedAt = parseRssDate(item.pubDate);
    const entry: ShoppingRetailEntry = {
      slug: slugify(`${businessName}-${externalIdFromUrl(item.link)}`),
      businessName,
      title,
      body,
      category,
      sourceUrl: item.link,
      venue: opts?.venue ?? null,
      address,
      neighborhood: opts?.neighborhood ?? inferNeighborhood(title, body, address),
    };
    const built = buildShoppingRetailItem(entry, sourcePrefix, publishedAt);
    if (built) results.push(built);
  }

  return dedupeShoppingRetailItems(results);
}

export { fetchRssFeed, slugify };
