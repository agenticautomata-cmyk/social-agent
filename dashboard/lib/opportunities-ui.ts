import 'server-only';

import { featureFlags } from './feature-flags.server';
import type { ContentItem } from './api';
import { getTerminology } from './terminology';

export const isOpportunitiesUiEnabled = featureFlags.enableOpportunitiesUi;
export const isKcScannerEnabled = featureFlags.enableKcScanner;

type RedditMeta = {
  subreddit?: string;
  publishedAt?: string;
  locationClues?: string[];
  url?: string;
};

type VisitKcMeta = {
  url?: string;
  publishedAt?: string;
  locationClues?: string[];
  contentType?: string | null;
};

type CrossroadsMeta = {
  url?: string;
  publishedAt?: string;
  locationClues?: string[];
  contentType?: string | null;
  categories?: string[];
};

type UnionStationMeta = {
  url?: string;
  publishedAt?: string;
  locationClues?: string[];
  contentType?: string | null;
  venue?: string | null;
  eventStartsAt?: string | null;
  eventEndsAt?: string | null;
};

type KauffmanMeta = {
  url?: string;
  publishedAt?: string;
  locationClues?: string[];
  contentType?: string | null;
  venue?: string | null;
  eventStartsAt?: string | null;
  eventEndsAt?: string | null;
  productionSeasonId?: string;
};

type SportingKcMeta = {
  url?: string;
  publishedAt?: string;
  locationClues?: string[];
  contentType?: string | null;
  opponent?: string;
  homeAway?: 'home' | 'away';
  venue?: string | null;
  eventStartsAt?: string | null;
};

type RestaurantWeekMeta = {
  url?: string;
  publishedAt?: string;
  locationClues?: string[];
  venue?: string | null;
  address?: string | null;
  region?: string | null;
  diningCategory?: string;
  openingFlag?: boolean;
  restaurantWeekFlag?: boolean;
  menuTypes?: string[];
  eventStartsAt?: string | null;
  eventEndsAt?: string | null;
};

type PitchDiningMeta = {
  url?: string;
  publishedAt?: string;
  locationClues?: string[];
  venue?: string | null;
  address?: string | null;
  diningCategory?: string;
  openingFlag?: boolean;
  restaurantWeekFlag?: boolean;
  eventStartsAt?: string | null;
  eventEndsAt?: string | null;
};

type FreeEventMeta = {
  url?: string;
  publishedAt?: string;
  locationClues?: string[];
  venue?: string | null;
  address?: string | null;
  neighborhood?: string | null;
  freeEventFlag?: boolean;
  eventCategory?: string | null;
  eventStartsAt?: string | null;
  eventEndsAt?: string | null;
};

/** Benson-facing view over existing content_items API rows. */
export type OpportunityRow = {
  id: string;
  title: string;
  angle: string | null;
  category: string | null;
  type: string;
  language: string;
  state: string;
  updatedAt: string;
  sourceUrl: string | null;
  sourceLabel: string | null;
  sourceLinkLabel: string | null;
  publishedAt: string | null;
  location: string | null;
  discoveredAt: string | null;
};

export const OPPORTUNITY_STATE_FILTER_VALUES = [
  '',
  'planned',
  'script_drafted',
  'video_generating',
  'video_ready',
  'ready_to_publish',
  'scheduled',
  'published',
  'failed',
] as const;

export const opportunitiesUiCopy = {
  navLabel: 'opportunities',
  section: isKcScannerEnabled ? '// §1 kansas city opportunities' : '// §1 opportunities',
  title: 'opportunities',
  subtitle: isKcScannerEnabled
    ? '// free events + dining + sporting kc + kauffman + union station + crossroads + visit kc + reddit — no scoring yet'
    : '// every opportunity, every state',
  emptyFilter: isKcScannerEnabled
    ? '// [empty] run a scan to ingest kc sources.'
    : '// [empty] no opportunities match this filter.',
  fields: {
    title: 'title',
    angle: 'angle',
    category: 'category',
    source: 'source',
    location: 'location',
    link: 'link',
    posted: 'posted',
  },
  overview: {
    viewLink: 'view opportunities →',
    hideCampaigns: true,
  },
} as const;

function publishedAtFromItem(item: ContentItem): string | null {
  const meta = item.metadata as {
    reddit?: RedditMeta;
    visitkc?: VisitKcMeta;
    crossroads?: CrossroadsMeta;
    unionStation?: UnionStationMeta;
    kauffman?: KauffmanMeta;
    sportingKc?: SportingKcMeta;
    restaurantWeek?: RestaurantWeekMeta;
    pitchDining?: PitchDiningMeta;
    kcParks?: FreeEventMeta;
    kcLibrary?: FreeEventMeta;
    firstFridays?: FreeEventMeta;
  };
  return (
    meta.reddit?.publishedAt ??
    meta.visitkc?.publishedAt ??
    meta.crossroads?.publishedAt ??
    meta.unionStation?.publishedAt ??
    meta.kauffman?.publishedAt ??
    meta.sportingKc?.publishedAt ??
    meta.restaurantWeek?.publishedAt ??
    meta.pitchDining?.publishedAt ??
    meta.kcParks?.publishedAt ??
    meta.kcLibrary?.publishedAt ??
    meta.firstFridays?.publishedAt ??
    null
  );
}

function locationFromItem(item: ContentItem): string | null {
  const meta = item.metadata as {
    reddit?: RedditMeta;
    visitkc?: VisitKcMeta;
    crossroads?: CrossroadsMeta;
    unionStation?: UnionStationMeta;
    kauffman?: KauffmanMeta;
    sportingKc?: SportingKcMeta;
    restaurantWeek?: RestaurantWeekMeta;
    pitchDining?: PitchDiningMeta;
    kcParks?: FreeEventMeta;
    kcLibrary?: FreeEventMeta;
    firstFridays?: FreeEventMeta;
  };
  if (item.locationName) return item.locationName;
  const clues =
    meta.reddit?.locationClues ??
    meta.visitkc?.locationClues ??
    meta.crossroads?.locationClues ??
    meta.unionStation?.locationClues ??
    meta.kauffman?.locationClues ??
    meta.sportingKc?.locationClues ??
    meta.restaurantWeek?.locationClues ??
    meta.pitchDining?.locationClues ??
    meta.kcParks?.locationClues ??
    meta.kcLibrary?.locationClues ??
    meta.firstFridays?.locationClues;
  return clues?.length ? clues.join(', ') : null;
}

function categoryFromItem(item: ContentItem, industryName: string | null): string | null {
  const meta = item.metadata as { opportunityCategory?: string };
  if (meta?.opportunityCategory) return meta.opportunityCategory;
  return industryName;
}

function sourceLabelFrom(item: ContentItem, sourceName: string | null, sourceType: string | null): string | null {
  if (sourceName) return sourceName;
  const meta = item.metadata as { ingest?: string; reddit?: RedditMeta };
  if (meta.ingest === 'share_intake') return 'Share Intake';
  if (meta.ingest === 'sporting_kc_event_api') return 'Sporting KC';
  if (meta.ingest === 'restaurant_week_rss') return 'KC Restaurant Week';
  if (meta.ingest === 'pitch_dining_rss') return 'The Pitch';
  if (meta.ingest === 'kc_parks_event_api') return 'KC Parks';
  if (meta.ingest === 'kc_library_scrape') return 'KC Library';
  if (meta.ingest === 'first_fridays_rules') return 'First Fridays';
  if (meta.ingest === 'kauffman_event_api') return 'Kauffman Center';
  if (meta.ingest === 'union_station_event_api') return 'Union Station';
  if (meta.ingest === 'crossroads_rss') return 'Crossroads';
  if (meta.ingest === 'visitkc_rss') return 'Visit KC';
  if (meta.reddit?.subreddit) return `r/${meta.reddit.subreddit}`;
  if (sourceType === 'sporting_kc') return 'Sporting KC';
  if (sourceType === 'restaurant_week') return 'KC Restaurant Week';
  if (sourceType === 'pitch_dining') return 'The Pitch';
  if (sourceType === 'kc_parks') return 'KC Parks';
  if (sourceType === 'kc_library') return 'KC Library';
  if (sourceType === 'first_fridays') return 'First Fridays';
  if (sourceType === 'kauffman') return 'Kauffman Center';
  if (sourceType === 'union_station') return 'Union Station';
  if (sourceType === 'crossroads') return 'Crossroads';
  if (sourceType === 'visitkc') return 'Visit KC';
  if (sourceType === 'reddit') return 'Reddit';
  return null;
}

function sourceLinkLabelFrom(item: ContentItem, sourceType: string | null): string | null {
  const meta = item.metadata as { ingest?: string };
  if (meta.ingest === 'share_intake') return 'share intake';
  if (meta.ingest === 'sporting_kc_event_api' || sourceType === 'sporting_kc') return 'sporting kc';
  if (meta.ingest === 'restaurant_week_rss' || sourceType === 'restaurant_week') return 'restaurant week';
  if (meta.ingest === 'pitch_dining_rss' || sourceType === 'pitch_dining') return 'the pitch';
  if (meta.ingest === 'kc_parks_event_api' || sourceType === 'kc_parks') return 'kc parks';
  if (meta.ingest === 'kc_library_scrape' || sourceType === 'kc_library') return 'kc library';
  if (meta.ingest === 'first_fridays_rules' || sourceType === 'first_fridays') return 'first fridays';
  if (meta.ingest === 'kauffman_event_api' || sourceType === 'kauffman') return 'kauffman';
  if (meta.ingest === 'union_station_event_api' || sourceType === 'union_station') return 'union station';
  if (meta.ingest === 'crossroads_rss' || sourceType === 'crossroads') return 'crossroads';
  if (meta.ingest === 'visitkc_rss' || sourceType === 'visitkc') return 'visit kc';
  if (meta.ingest === 'reddit_rss' || sourceType === 'reddit') return 'reddit';
  return null;
}

export function mapContentRowToOpportunity(
  item: ContentItem,
  industryName: string | null,
  sourceName: string | null = null,
  sourceType: string | null = null,
): OpportunityRow {
  return {
    id: item.id,
    title: item.topic,
    angle: item.hook,
    category: categoryFromItem(item, industryName),
    type: item.type,
    language: item.language,
    state: item.state,
    updatedAt: item.updatedAt,
    sourceUrl: item.sourceUrl,
    sourceLabel: sourceLabelFrom(item, sourceName, sourceType),
    sourceLinkLabel: sourceLinkLabelFrom(item, sourceType),
    publishedAt: publishedAtFromItem(item),
    location: locationFromItem(item),
    discoveredAt: item.discoveredAt,
  };
}

export function opportunitiesListQuery(stateFilter: string): string {
  const params = new URLSearchParams();
  params.set('limit', '200');
  if (isKcScannerEnabled) params.set('ingested', 'true');
  if (stateFilter) params.set('state', stateFilter);
  return `?${params.toString()}`;
}

export function getNavItems(): Array<{ href: string; label: string }> {
  if (isOpportunitiesUiEnabled) {
    return [
      { href: '/', label: 'home' },
      { href: '/editor', label: 'today' },
      { href: '/benson', label: 'benson' },
      { href: '/actions', label: 'actions' },
      { href: '/revenue', label: 'revenue' },
      { href: '/planner', label: 'planner' },
      { href: '/sponsors', label: 'sponsors' },
      { href: '/pipeline', label: 'pipeline' },
      { href: '/sponsor-intelligence', label: 'sponsor intel' },
      { href: '/opportunities', label: opportunitiesUiCopy.navLabel },
      { href: '/review/inventory', label: 'inventory review' },
      { href: '/analytics', label: 'analytics' },
      { href: '/intake', label: 'share intake' },
      { href: '/approvals', label: 'approvals' },
      { href: '/runs', label: 'runs' },
    ];
  }

  const t = getTerminology();
  return [
    { href: '/', label: 'overview' },
    { href: '/campaigns', label: t.nav.campaigns },
    { href: '/queue', label: t.nav.queue },
    { href: '/approvals', label: 'approvals' },
    { href: '/runs', label: 'runs' },
  ];
}

export function opportunitiesFilterHref(stateValue: string): string {
  const base = isOpportunitiesUiEnabled ? '/opportunities' : '/queue';
  return stateValue ? `${base}?state=${stateValue}` : base;
}
