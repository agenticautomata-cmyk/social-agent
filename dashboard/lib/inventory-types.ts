import type { CoverageFormat } from './coverage-format-types';
import type { OpportunityLocationView } from './opportunity-location-types';

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
  coverageFormat: CoverageFormat | null;
  suggestedCoverageFormat: CoverageFormat | null;
  firsthandVisited: boolean;
};

export type InventoryStats = {
  total: number;
  bySource: Array<{ sourceName: string; sourceType: string | null; count: number }>;
  byCategory: Array<{ category: string; count: number }>;
  byState: Array<{ state: string; count: number }>;
  byPillar: Array<{ pillar: string; count: number }>;
  newestAt: string | null;
  oldestAt: string | null;
};

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

export type InventorySortId =
  | 'event_date'
  | 'newest'
  | 'oldest'
  | 'source'
  | 'category'
  | 'title'
  | 'sponsor_first'
  | 'audience_first';

export type InventoryListResponse = {
  demoMode: boolean;
  stats: InventoryStats;
  filterOptions: {
    sources: string[];
    categories: string[];
    states: string[];
  };
  totalUnfiltered: number;
  count: number;
  items: InventoryItem[];
};

export type InventoryDetailResponse = {
  demoMode: boolean;
  item: InventoryItem;
  industryName: string | null;
  personaName: string | null;
  raw: Record<string, unknown>;
  coverage?: {
    coverageFormat: CoverageFormat | null;
    suggestedCoverageFormat: CoverageFormat | null;
    firsthandVisited: boolean;
  };
  greenScreenPackage?: Record<string, unknown> | null;
  location?: OpportunityLocationView | null;
};

export const INVENTORY_PRESETS: Array<{ id: InventoryPresetId; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'sponsor_friendly', label: 'Sponsor Friendly' },
  { id: 'luxury_date_night', label: 'Luxury / Date Night' },
  { id: 'dining_openings', label: 'Dining / Openings' },
  { id: 'estate_sales', label: 'Estate Sales' },
  { id: 'deals_discounts', label: 'Deals / Thrift / Discounts' },
  { id: 'luxury_deals', label: 'Luxury Deals (NowInStock-style)' },
  { id: 'major_events', label: 'Major Events' },
  { id: 'free_things', label: 'Free Things To Do' },
  { id: 'celebrity_charity', label: 'Celebrity / Charity' },
  { id: 'world_cup', label: 'World Cup / Visitors' },
  { id: 'reddit_only', label: 'Reddit Only' },
  { id: 'hide_reddit', label: 'Hide Reddit Noise' },
  { id: 'shopping_retail', label: 'Shopping / Retail' },
];

export const INVENTORY_FLAG_OPTIONS: Array<{ id: keyof InventoryFlags; label: string }> = [
  { id: 'sponsorFriendly', label: 'Sponsor friendly' },
  { id: 'luxury', label: 'Luxury' },
  { id: 'dining', label: 'Dining' },
  { id: 'dateNight', label: 'Date night' },
  { id: 'estateSale', label: 'Estate sale' },
  { id: 'businessOpening', label: 'Business opening' },
  { id: 'freeEvent', label: 'Free event' },
  { id: 'celebrityCharity', label: 'Celebrity / charity' },
  { id: 'sports', label: 'Sports' },
  { id: 'reddit', label: 'Reddit' },
  { id: 'shopping', label: 'Shopping' },
  { id: 'retail', label: 'Retail' },
  { id: 'vendorMarket', label: 'Vendor market' },
  { id: 'collector', label: 'Collector' },
];

export const INVENTORY_SORT_OPTIONS: Array<{ id: InventorySortId; label: string }> = [
  { id: 'event_date', label: 'Chronological (event date)' },
  { id: 'newest', label: 'Newest first' },
  { id: 'oldest', label: 'Oldest first' },
  { id: 'source', label: 'Source' },
  { id: 'category', label: 'Category' },
  { id: 'title', label: 'Title' },
  { id: 'sponsor_first', label: 'Sponsor-friendly first' },
  { id: 'audience_first', label: 'Audience-aligned first' },
];

export type EditorialScoreFactor = {
  label: string;
  points: number;
};

export type EditorialScoreBreakdown = {
  total: number;
  factors: EditorialScoreFactor[];
};

export type EditorialPick = {
  id: string;
  title: string;
  category: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  whyRanked: string;
  scoreBreakdown: EditorialScoreBreakdown;
  businessName?: string | null;
  location?: string | null;
  whyItMatters?: string;
};

export type EditorialPanelId =
  | 'topToday'
  | 'topSponsor'
  | 'topEngagement'
  | 'topNewBusinesses'
  | 'topCelebrityCharity'
  | 'topEstateSalesThisWeek'
  | 'topShopping';

export type EditorialPicksResponse = {
  demoMode: boolean;
  generatedAt: string;
  limit: number;
  panels: Record<
    EditorialPanelId,
    {
      title: string;
      description: string;
      items: EditorialPick[];
    }
  >;
};

export const EDITORIAL_PANEL_ORDER: EditorialPanelId[] = [
  'topToday',
  'topSponsor',
  'topEngagement',
  'topNewBusinesses',
  'topCelebrityCharity',
  'topEstateSalesThisWeek',
  'topShopping',
];
