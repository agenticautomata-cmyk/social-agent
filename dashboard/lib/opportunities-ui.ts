import { featureFlags } from '@social-agent/core/feature-flags';
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
  reddit: RedditMeta | null;
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
    ? '// live r/kansascity rss — no scoring yet'
    : '// every opportunity, every state',
  emptyFilter: isKcScannerEnabled
    ? '// [empty] run a scan to ingest r/kansascity rss posts.'
    : '// [empty] no opportunities match this filter.',
  fields: {
    title: 'title',
    angle: 'angle',
    category: 'category',
    subreddit: 'subreddit',
    location: 'location',
    source: 'source',
    posted: 'posted',
  },
  overview: {
    viewLink: 'view opportunities →',
    hideCampaigns: true,
  },
} as const;

function redditFromItem(item: ContentItem): RedditMeta | null {
  const meta = item.metadata as { reddit?: RedditMeta; opportunityCategory?: string };
  if (!meta?.reddit && !item.sourceId) return null;
  return meta.reddit ?? null;
}

function categoryFromItem(item: ContentItem, industryName: string | null): string | null {
  const meta = item.metadata as { opportunityCategory?: string };
  if (meta?.opportunityCategory) return meta.opportunityCategory;
  return industryName;
}

export function mapContentRowToOpportunity(
  item: ContentItem,
  industryName: string | null,
): OpportunityRow {
  const reddit = redditFromItem(item);
  const location =
    item.locationName ??
    (reddit?.locationClues?.length ? reddit.locationClues.join(', ') : null);

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
    reddit,
    location,
    discoveredAt: item.discoveredAt,
  };
}

export function opportunitiesListQuery(stateFilter: string): string {
  const params = new URLSearchParams();
  params.set('limit', '200');
  if (isKcScannerEnabled) params.set('reddit', 'true');
  if (stateFilter) params.set('state', stateFilter);
  return `?${params.toString()}`;
}

export function getNavItems(): Array<{ href: string; label: string }> {
  if (isOpportunitiesUiEnabled) {
    return [
      { href: '/', label: 'overview' },
      { href: '/opportunities', label: opportunitiesUiCopy.navLabel },
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
