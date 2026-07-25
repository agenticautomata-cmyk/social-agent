import type { ContentItem, Source } from '../schema.js';
import { upcomingInventorySortTuple } from '../content-order.js';
import {
  inferContentFraming,
  isShoppingRetailContent,
  whyItMattersForFraming,
} from './content-framing.js';
import { isWorldCupSeasonActive } from './mega-events.js';

export type InventoryFlags = {
  sponsorFriendly: boolean;
  luxury: boolean;
  dining: boolean;
  dateNight: boolean;
  estateSale: boolean;
  businessOpening: boolean;
  freeEvent: boolean;
  celebrityCharity: boolean;
  sports: boolean;
  reddit: boolean;
  worldCup: boolean;
  shopping: boolean;
  retail: boolean;
  vendorMarket: boolean;
  collector: boolean;
};

export type InventoryItem = {
  id: string;
  title: string;
  summary: string | null;
  sourceName: string | null;
  sourceType: string | null;
  category: string | null;
  state: string;
  eventDate: string | null;
  eventEndDate: string | null;
  discoveredAt: string | null;
  createdAt: string;
  updatedAt: string;
  venue: string | null;
  businessName: string | null;
  neighborhood: string | null;
  address: string | null;
  locationName: string | null;
  locationStatus: string | null;
  formattedAddress: string | null;
  locationLat: number | null;
  locationLng: number | null;
  googlePlaceId: string | null;
  googleMapsUrl: string | null;
  locationWebsiteUrl: string | null;
  locationConfidence: number | null;
  locationSource: string | null;
  locationVerifiedAt: string | null;
  locationResolutionError: string | null;
  sourceUrl: string | null;
  ingest: string | null;
  flags: InventoryFlags;
  badges: string[];
  audienceScore: number;
  whyItMatters: string;
  metadata: Record<string, unknown>;
  relevanceScore: string | null;
  urgencyScore: string | null;
  coverageFormat: string | null;
  suggestedCoverageFormat: string | null;
  firsthandVisited: boolean;
  creatorValueStatus: string | null;
  lifecycleStatus: string | null;
};

const SPONSOR_CATEGORIES = new Set([
  'hotel_package',
  'spa_package',
  'date_night',
  'luxury_dining',
  'rooftop_experience',
  'wine_tasting',
  'couples_event',
  'weekend_getaway',
  'estate_sale',
  'consignment_shop',
  'thrift_store',
  'deal',
  'liquidation_sale',
  'dining',
  'restaurant_opening',
  'coffee_opening',
  'restaurant_week',
  'luxury_deal',
  'staycation',
  'boutique_opening',
  'retail_opening',
  'pop_up_shop',
  'luxury_resale',
  'consignment_event',
  'shopping_event',
]);

const DEAL_DISCOUNT_CATEGORIES = new Set([
  'deal',
  'liquidation_sale',
  'consignment_shop',
  'thrift_store',
  'warehouse_sale',
  'sidewalk_sale',
  'business_closing',
  'luxury_deal',
  'luxury_resale',
  'consignment_event',
]);

const MAJOR_EVENT_CATEGORIES = new Set([
  'performance',
  'match',
  'event',
  'festival',
  'convention',
  'celebrity_appearance',
  'autograph_signing',
  'sports_appearance',
  'meet_and_greet',
  'fan_event',
  'collector_show',
  'benefit_concert',
  'gala',
  'free',
]);

const MAJOR_EVENT_SOURCE_TYPES = new Set([
  'kauffman',
  'union_station',
  'sporting_kc',
  'kc_parks',
  'kc_library',
  'first_fridays',
  'restaurant_week',
]);

const SHOPPING_RETAIL_CATEGORIES = new Set([
  'boutique_opening',
  'retail_opening',
  'pop_up_shop',
  'artisan_market',
  'vendor_market',
  'vintage_market',
  'luxury_resale',
  'consignment_event',
  'warehouse_sale',
  'sidewalk_sale',
  'collector_show',
  'antique_market',
  'maker_market',
  'seasonal_market',
  'shopping_event',
]);

const DINING_CATEGORIES = new Set([
  'dining',
  'restaurant_opening',
  'coffee_opening',
  'luxury_dining',
  'restaurant_week',
]);

const OPENING_CATEGORIES = new Set(['restaurant_opening', 'coffee_opening', 'business_opening']);

const CELEBRITY_CHARITY_CATEGORIES = new Set([
  'celebrity_event',
  'charity_event',
  'fundraiser',
  'benefit_concert',
  'gala',
  'sports_celebrity_event',
  'public_appearance',
]);

const WORLD_CUP_RE =
  /\b(world cup|fifa|soccer capital|kickoff to the cup|sporting plaza|world cup 26|wc26)\b/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function flattenMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const flat: Record<string, unknown> = { ...metadata };
  for (const value of Object.values(metadata)) {
    if (isRecord(value)) {
      for (const [k, v] of Object.entries(value)) {
        if (flat[k] === undefined) flat[k] = v;
      }
    }
  }
  return flat;
}

function boolFlag(flat: Record<string, unknown>, key: string): boolean {
  const v = flat[key];
  return v === true || v === 'true';
}

function stringField(flat: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const v = flat[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

function categoryFromItem(item: ContentItem, flat: Record<string, unknown>): string | null {
  const cat = flat.opportunityCategory;
  if (typeof cat === 'string' && cat) return cat;
  return null;
}

function ingestFromMetadata(metadata: Record<string, unknown>): string | null {
  const ingest = metadata.ingest;
  return typeof ingest === 'string' ? ingest : null;
}

function detectFlags(
  item: ContentItem,
  sourceType: string | null,
  flat: Record<string, unknown>,
  category: string | null,
  textBlob: string,
): InventoryFlags {
  const ingest = ingestFromMetadata(item.metadata as Record<string, unknown>);

  const luxury =
    boolFlag(flat, 'luxuryFlag') ||
    category === 'luxury_dining' ||
    category === 'luxury_deal' ||
    category === 'staycation' ||
    category === 'weekend_getaway';

  const dateNight =
    boolFlag(flat, 'dateNightFlag') ||
    category === 'date_night' ||
    category === 'couples_event' ||
    category === 'wine_tasting';

  const dining = (category != null && DINING_CATEGORIES.has(category)) || ingest?.includes('dining') === true;

  const businessOpening =
    boolFlag(flat, 'openingFlag') ||
    (category != null && OPENING_CATEGORIES.has(category));

  const estateSale = boolFlag(flat, 'estateSaleFlag') || category === 'estate_sale';

  const freeEvent = boolFlag(flat, 'freeEventFlag') || category === 'free';

  const celebrityCharity =
    boolFlag(flat, 'celebrityFlag') ||
    boolFlag(flat, 'charityFlag') ||
    boolFlag(flat, 'fundraiserFlag') ||
    boolFlag(flat, 'galaFlag') ||
    (category != null && CELEBRITY_CHARITY_CATEGORIES.has(category));

  const sports =
    sourceType === 'sporting_kc' ||
    category === 'match' ||
    category === 'sports_celebrity_event' ||
    category === 'sports_appearance' ||
    ingest?.includes('sporting') === true;

  const reddit =
    sourceType === 'reddit' ||
    ingest?.includes('reddit') === true ||
    isRecord(item.metadata) && 'reddit' in (item.metadata as Record<string, unknown>);

  const worldCup = WORLD_CUP_RE.test(textBlob);

  const shopping =
    boolFlag(flat, 'shoppingFlag') ||
    (category != null && SHOPPING_RETAIL_CATEGORIES.has(category));

  const retail =
    boolFlag(flat, 'retailFlag') ||
    category === 'thrift_store' ||
    category === 'consignment_shop' ||
    category === 'boutique_opening' ||
    category === 'retail_opening' ||
    category === 'pop_up_shop' ||
    category === 'luxury_resale' ||
    category === 'warehouse_sale' ||
    category === 'sidewalk_sale';

  const vendorMarket =
    boolFlag(flat, 'vendorMarketFlag') ||
    category === 'artisan_market' ||
    category === 'vendor_market' ||
    category === 'vintage_market' ||
    category === 'antique_market' ||
    category === 'maker_market' ||
    category === 'seasonal_market';

  const collector =
    boolFlag(flat, 'collectorFlag') ||
    category === 'collector_show';

  const sponsorFriendly =
    (category != null && SPONSOR_CATEGORIES.has(category)) ||
    boolFlag(flat, 'hotelFlag') ||
    boolFlag(flat, 'spaFlag') ||
    boolFlag(flat, 'dateNightFlag') ||
    boolFlag(flat, 'luxuryFlag') ||
    boolFlag(flat, 'rooftopFlag') ||
    boolFlag(flat, 'consignmentFlag') ||
    retail ||
    shopping ||
    estateSale ||
    businessOpening;

  return {
    sponsorFriendly,
    luxury,
    dining,
    dateNight,
    estateSale,
    businessOpening,
    freeEvent,
    celebrityCharity,
    sports,
    reddit,
    worldCup,
    shopping,
    retail,
    vendorMarket,
    collector,
  };
}

function buildBadges(flags: InventoryFlags, category: string | null): string[] {
  const badges: string[] = [];
  if (flags.sponsorFriendly) badges.push('sponsor');
  if (flags.luxury) badges.push('luxury');
  if (flags.dining) badges.push('dining');
  if (flags.dateNight) badges.push('date night');
  if (flags.estateSale) badges.push('estate sale');
  if (flags.businessOpening) badges.push('opening');
  if (flags.freeEvent) badges.push('free');
  if (flags.celebrityCharity) badges.push('celebrity/charity');
  if (flags.sports) badges.push('sports');
  if (flags.reddit) badges.push('reddit');
  if (flags.worldCup) badges.push('world cup');
  if (flags.shopping) badges.push('shopping');
  if (flags.retail) badges.push('retail');
  if (flags.vendorMarket) badges.push('vendor market');
  if (flags.collector) badges.push('collector');
  if (category && !badges.length) badges.push(category.replace(/_/g, ' '));
  return badges;
}

function audienceScore(flags: InventoryFlags): number {
  let score = 0;
  if (flags.sponsorFriendly) score += 3;
  if (flags.luxury) score += 2;
  if (flags.dateNight) score += 2;
  if (flags.dining) score += 2;
  if (flags.businessOpening) score += 2;
  if (flags.celebrityCharity) score += 2;
  if (flags.sports) score += 1;
  if (flags.freeEvent) score += 1;
  if (flags.estateSale) score += 2;
  if (flags.worldCup && isWorldCupSeasonActive()) score += 2;
  if (flags.shopping) score += 2;
  if (flags.retail) score += 2;
  if (flags.vendorMarket) score += 1;
  if (flags.collector) score += 1;
  if (flags.reddit) score -= 2;
  return score;
}

function whyItMatters(
  flags: InventoryFlags,
  category: string | null,
  sourceName: string | null,
  ingest: string | null,
  title: string,
): string {
  const parts: string[] = [];
  if (ingest?.startsWith('ask_benson')) {
    parts.push('Added via Ask Benson — prioritize for review and planner.');
  }

  const framingLine = whyItMattersForFraming(inferContentFraming(flags, category, title));
  if (framingLine) parts.push(framingLine);
  else if (flags.sponsorFriendly && (flags.businessOpening || category)) {
    parts.push('Named local business — spotlight or sponsorship outreach potential.');
  }

  if (flags.estateSale && !isShoppingRetailContent(flags, category, title)) {
    parts.push('Treasure-hunt / deal-hunting audience engagement.');
  }
  if (flags.freeEvent) parts.push('Free community event — high traffic, lower sponsor fit.');
  if (flags.celebrityCharity) parts.push('Celebrity or charity hook — high social engagement potential.');
  if (flags.sports) parts.push('KC sports audience — Chiefs/Royals/Sporting KC adjacency.');
  if (flags.worldCup && isWorldCupSeasonActive()) {
    parts.push('World Cup / visitor economy — timely metro-wide interest.');
  }
  if (flags.reddit) parts.push('Reddit-sourced — verify KC specificity before publishing.');
  if (!parts.length && category) parts.push(`Category: ${category.replace(/_/g, ' ')}.`);
  if (!parts.length && sourceName) parts.push(`From ${sourceName} — review for Kellie fit.`);
  if (!parts.length) parts.push('General KC opportunity — review metadata for angle.');
  return parts.join(' ');
}

export function normalizeInventoryItem(
  item: ContentItem,
  sourceName: string | null,
  sourceType: string | null,
): InventoryItem {
  const metadata = (item.metadata ?? {}) as Record<string, unknown>;
  const flat = flattenMetadata(metadata);
  const category = categoryFromItem(item, flat);
  const textBlob = [item.topic, item.hook, item.script, JSON.stringify(metadata)].filter(Boolean).join(' ');

  const venue = stringField(flat, 'venue') ?? item.locationName;
  const businessName = stringField(flat, 'businessName', 'title');
  const neighborhood = stringField(flat, 'neighborhood');
  const address = stringField(flat, 'address');

  const flags = detectFlags(item, sourceType, flat, category, textBlob);
  const badges = buildBadges(flags, category);
  const ingest = ingestFromMetadata(metadata);

  return {
    id: item.id,
    title: item.topic,
    summary: item.script ?? item.hook,
    sourceName,
    sourceType,
    category,
    state: item.state,
    eventDate: item.eventStartsAt?.toISOString() ?? null,
    eventEndDate: item.eventEndsAt?.toISOString() ?? null,
    discoveredAt: item.discoveredAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    venue,
    businessName,
    neighborhood,
    address,
    locationName: item.locationName,
    locationStatus: item.locationStatus ?? 'unresolved',
    formattedAddress: item.formattedAddress,
    locationLat: item.locationLat != null ? Number(item.locationLat) : null,
    locationLng: item.locationLng != null ? Number(item.locationLng) : null,
    googlePlaceId: item.googlePlaceId,
    googleMapsUrl: item.googleMapsUrl,
    locationWebsiteUrl: item.locationWebsiteUrl,
    locationConfidence: item.locationConfidence != null ? Number(item.locationConfidence) : null,
    locationSource: item.locationSource,
    locationVerifiedAt: item.locationVerifiedAt?.toISOString() ?? null,
    locationResolutionError: item.locationResolutionError,
    sourceUrl: item.sourceUrl,
    ingest,
    flags,
    badges,
    audienceScore: audienceScore(flags),
    whyItMatters: whyItMatters(flags, category, sourceName, ingest, item.topic),
    metadata,
    relevanceScore: item.relevanceScore,
    urgencyScore: item.urgencyScore,
    coverageFormat: item.coverageFormat ?? null,
    suggestedCoverageFormat: item.suggestedCoverageFormat ?? null,
    firsthandVisited: item.firsthandVisited ?? false,
    creatorValueStatus: item.creatorValueStatus ?? null,
    lifecycleStatus: item.lifecycleStatus ?? null,
  };
}

export type InventoryStats = {
  total: number;
  bySource: Array<{ sourceName: string; sourceType: string | null; count: number }>;
  byCategory: Array<{ category: string; count: number }>;
  byState: Array<{ state: string; count: number }>;
  byPillar: Array<{ pillar: string; count: number }>;
  newestAt: string | null;
  oldestAt: string | null;
};

const PILLAR_KEYS: Array<{ key: keyof InventoryFlags; label: string }> = [
  { key: 'sponsorFriendly', label: 'sponsor friendly' },
  { key: 'luxury', label: 'luxury' },
  { key: 'dining', label: 'dining' },
  { key: 'dateNight', label: 'date night' },
  { key: 'estateSale', label: 'estate sale' },
  { key: 'businessOpening', label: 'business opening' },
  { key: 'freeEvent', label: 'free event' },
  { key: 'celebrityCharity', label: 'celebrity/charity' },
  { key: 'sports', label: 'sports' },
  { key: 'reddit', label: 'reddit' },
  { key: 'worldCup', label: 'world cup/visitors' },
  { key: 'shopping', label: 'shopping' },
  { key: 'retail', label: 'retail' },
  { key: 'vendorMarket', label: 'vendor market' },
  { key: 'collector', label: 'collector' },
];

export function computeInventoryStats(items: InventoryItem[]): InventoryStats {
  const sourceMap = new Map<string, { sourceName: string; sourceType: string | null; count: number }>();
  const categoryMap = new Map<string, number>();
  const stateMap = new Map<string, number>();
  const pillarMap = new Map<string, number>();

  let newest: Date | null = null;
  let oldest: Date | null = null;

  for (const item of items) {
    const srcKey = item.sourceName ?? 'unknown';
    const src = sourceMap.get(srcKey) ?? {
      sourceName: item.sourceName ?? 'unknown',
      sourceType: item.sourceType,
      count: 0,
    };
    src.count += 1;
    sourceMap.set(srcKey, src);

    const cat = item.category ?? 'uncategorized';
    categoryMap.set(cat, (categoryMap.get(cat) ?? 0) + 1);
    stateMap.set(item.state, (stateMap.get(item.state) ?? 0) + 1);

    for (const { key, label } of PILLAR_KEYS) {
      if (item.flags[key]) {
        pillarMap.set(label, (pillarMap.get(label) ?? 0) + 1);
      }
    }

    const d = new Date(item.createdAt);
    if (!newest || d > newest) newest = d;
    if (!oldest || d < oldest) oldest = d;
  }

  return {
    total: items.length,
    bySource: [...sourceMap.values()].sort((a, b) => b.count - a.count),
    byCategory: [...categoryMap.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count),
    byState: [...stateMap.entries()]
      .map(([state, count]) => ({ state, count }))
      .sort((a, b) => b.count - a.count),
    byPillar: [...pillarMap.entries()]
      .map(([pillar, count]) => ({ pillar, count }))
      .sort((a, b) => b.count - a.count),
    newestAt: newest?.toISOString() ?? null,
    oldestAt: oldest?.toISOString() ?? null,
  };
}

export type InventoryPresetId =
  | 'all'
  | 'sponsor_friendly'
  | 'luxury_date_night'
  | 'dining_openings'
  | 'estate_sales'
  | 'deals_discounts'
  | 'luxury_deals'
  | 'major_events'
  | 'free_things'
  | 'celebrity_charity'
  | 'world_cup'
  | 'reddit_only'
  | 'hide_reddit'
  | 'shopping_retail';

export function applyInventoryPreset(items: InventoryItem[], preset: InventoryPresetId): InventoryItem[] {
  switch (preset) {
    case 'sponsor_friendly':
      return items.filter((i) => i.flags.sponsorFriendly);
    case 'luxury_date_night':
      return items.filter((i) => i.flags.luxury || i.flags.dateNight);
    case 'dining_openings':
      return items.filter((i) => i.flags.dining || i.flags.businessOpening);
    case 'estate_sales':
      return items.filter((i) => i.flags.estateSale);
    case 'deals_discounts':
      return items.filter(
        (i) =>
          (i.category != null && DEAL_DISCOUNT_CATEGORIES.has(i.category)) ||
          i.flags.estateSale ||
          i.flags.retail,
      );
    case 'luxury_deals':
      return items.filter((i) => {
        const meta = i.metadata ?? {};
        if (meta.luxuryEstateFlag === true) return true;
        if (meta.ingest === 'discount_watch') return true;
        if (meta.newDeal === true) return true;
        const cat = i.category;
        return (
          cat === 'luxury_deal' ||
          cat === 'hotel_package' ||
          cat === 'spa_package' ||
          cat === 'staycation' ||
          cat === 'consignment_event' ||
          cat === 'luxury_resale' ||
          i.flags.luxury ||
          i.flags.dateNight
        );
      });
    case 'major_events':
      return items.filter(
        (i) =>
          !i.flags.reddit &&
          ((i.category != null && MAJOR_EVENT_CATEGORIES.has(i.category)) ||
            (i.sourceType != null && MAJOR_EVENT_SOURCE_TYPES.has(i.sourceType)) ||
            i.flags.sports ||
            i.flags.celebrityCharity ||
            (i.eventDate != null && i.flags.freeEvent)),
      );
    case 'free_things':
      return items.filter((i) => i.flags.freeEvent);
    case 'celebrity_charity':
      return items.filter((i) => i.flags.celebrityCharity);
    case 'world_cup':
      return items.filter((i) => i.flags.worldCup);
    case 'reddit_only':
      return items.filter((i) => i.flags.reddit);
    case 'hide_reddit':
      return items.filter((i) => !i.flags.reddit);
    case 'shopping_retail':
      return items.filter((i) => i.flags.shopping || i.flags.retail || i.flags.vendorMarket || i.flags.collector);
    default:
      return items;
  }
}

export type InventorySortId =
  | 'event_date'
  | 'newest'
  | 'oldest'
  | 'source'
  | 'category'
  | 'title'
  | 'sponsor_first'
  | 'audience_first';

export function sortInventoryItems(
  items: InventoryItem[],
  sort: InventorySortId,
  now: Date = new Date(),
): InventoryItem[] {
  const copy = [...items];
  switch (sort) {
    case 'event_date':
      return copy.sort((a, b) => {
        const [aTier, aTime] = upcomingInventorySortTuple(a.eventDate, now);
        const [bTier, bTime] = upcomingInventorySortTuple(b.eventDate, now);
        if (aTier !== bTier) return aTier - bTier;
        if (aTime !== bTime) return aTime - bTime;
        return b.createdAt.localeCompare(a.createdAt);
      });
    case 'oldest':
      return copy.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    case 'source':
      return copy.sort((a, b) => (a.sourceName ?? '').localeCompare(b.sourceName ?? ''));
    case 'category':
      return copy.sort((a, b) => (a.category ?? '').localeCompare(b.category ?? ''));
    case 'title':
      return copy.sort((a, b) => a.title.localeCompare(b.title));
    case 'sponsor_first':
      return copy.sort((a, b) => Number(b.flags.sponsorFriendly) - Number(a.flags.sponsorFriendly));
    case 'audience_first':
      return copy.sort((a, b) => b.audienceScore - a.audienceScore);
    case 'newest':
    default:
      return copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

function eventDateSortKey(value: string | null | undefined): number {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const t = Date.parse(value);
  return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
}

export function searchInventoryItems(items: InventoryItem[], query: string): InventoryItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) => {
    const haystack = [
      item.title,
      item.summary,
      item.businessName,
      item.venue,
      item.neighborhood,
      item.address,
      item.locationName,
      item.sourceUrl,
      item.category,
      item.sourceName,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}

export function filterInventoryItems(
  items: InventoryItem[],
  filters: {
    source?: string;
    category?: string;
    state?: string;
    neighborhood?: string;
    dateFrom?: string;
    dateTo?: string;
    flag?: keyof InventoryFlags;
    excludeReddit?: boolean;
    excludeCategories?: string[];
  },
): InventoryItem[] {
  const excludeSet =
    filters.excludeCategories && filters.excludeCategories.length > 0
      ? new Set(filters.excludeCategories)
      : null;

  return items.filter((item) => {
    if (filters.source && item.sourceName !== filters.source) return false;
    if (filters.category && item.category !== filters.category) return false;
    if (excludeSet) {
      const cat = item.category ?? 'uncategorized';
      if (excludeSet.has(cat)) return false;
    }
    if (filters.state && item.state !== filters.state) return false;
    if (filters.neighborhood) {
      const n = (item.neighborhood ?? item.locationName ?? '').toLowerCase();
      if (!n.includes(filters.neighborhood.toLowerCase())) return false;
    }
    if (filters.excludeReddit && item.flags.reddit) return false;
    if (filters.flag && !item.flags[filters.flag]) return false;

    const dateStr = item.eventDate ?? item.discoveredAt ?? item.createdAt;
    if (filters.dateFrom && dateStr && dateStr < filters.dateFrom) return false;
    if (filters.dateTo && dateStr && dateStr > `${filters.dateTo}T23:59:59.999Z`) return false;

    return true;
  });
}

export type SourceJoin = Pick<Source, 'name' | 'type'> | null;
