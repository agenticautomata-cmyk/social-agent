import { featureFlags } from '@social-agent/core/feature-flags';
import type { ContentItem } from './api';
import { getTerminology } from './terminology';

export const isOpportunitiesUiEnabled = featureFlags.enableOpportunitiesUi;

/** Benson-facing view over existing content_items API rows — no API changes. */
export type OpportunityRow = {
  id: string;
  title: string;
  angle: string | null;
  category: string | null;
  type: string;
  language: string;
  state: string;
  updatedAt: string;
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
  section: '// §1 opportunities',
  title: 'opportunities',
  subtitle: '// every opportunity, every state',
  emptyFilter: '// [empty] no opportunities match this filter.',
  fields: {
    title: 'title',
    angle: 'angle',
    category: 'category',
  },
  overview: {
    viewLink: 'view opportunities →',
    hideCampaigns: true,
  },
} as const;

export function mapContentRowToOpportunity(
  item: ContentItem,
  industryName: string | null,
): OpportunityRow {
  return {
    id: item.id,
    title: item.topic,
    angle: item.hook,
    category: industryName,
    type: item.type,
    language: item.language,
    state: item.state,
    updatedAt: item.updatedAt,
  };
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
