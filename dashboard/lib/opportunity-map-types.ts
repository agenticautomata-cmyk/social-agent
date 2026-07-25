import type { CoverageFormat } from './coverage-format-types';

export type MapDatePreset =
  | 'today'
  | 'tomorrow'
  | 'this_week'
  | 'this_weekend'
  | 'next_7_days'
  | 'next_30_days'
  | 'custom';

export type MapSortId = 'soonest' | 'highest_score' | 'nearest' | 'recently_discovered';

export type MapLocationStatusFilter = 'resolved_verified' | 'include_needs_review';

export type MapOpportunityPin = {
  id: string;
  title: string;
  eventDate: string | null;
  eventEndDate: string | null;
  locationName: string | null;
  formattedAddress: string | null;
  latitude: number;
  longitude: number;
  googleMapsUrl: string | null;
  state: string;
  locationStatus: string;
  locationConfidence: number | null;
  coverageFormat: CoverageFormat | null;
  category: string | null;
  sourceName: string | null;
  score: number;
  thumbnailUrl: string | null;
  detailUrl: string;
  selectedForFilming: boolean;
  needsReviewPin: boolean;
  groupKey: string;
};

export type MapLocationGroup = {
  groupKey: string;
  latitude: number;
  longitude: number;
  locationName: string | null;
  formattedAddress: string | null;
  opportunities: MapOpportunityPin[];
};

export type MapOpportunitiesResponse = {
  demoMode: boolean;
  mapConfigured: boolean;
  usesStoredCoordinatesOnly: boolean;
  count: number;
  hiddenUnresolvedCount: number;
  hiddenNotApplicableCount: number;
  hiddenExpiredCount: number;
  filterOptions: {
    sources: string[];
    categories: string[];
    states: string[];
  };
  pins: MapOpportunityPin[];
  groups: MapLocationGroup[];
};

export const MAP_DATE_PRESET_LABELS: Record<MapDatePreset, string> = {
  today: 'Today',
  tomorrow: 'Tomorrow',
  this_week: 'This week',
  this_weekend: 'This weekend',
  next_7_days: 'Next 7 days',
  next_30_days: 'Next 30 days',
  custom: 'Custom range',
};

export const MAP_SORT_LABELS: Record<MapSortId, string> = {
  soonest: 'Soonest',
  highest_score: 'Highest score',
  nearest: 'Nearest to map center',
  recently_discovered: 'Recently discovered',
};

export { DEFAULT_MAP_FILTERS, getGoogleMapsBrowserKey, isGoogleMapsConfigured, type MapFilters } from './opportunity-map-query';
