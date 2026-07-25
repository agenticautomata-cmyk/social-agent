import type { CoverageFormat } from './coverage-format-types';
import { COVERAGE_FORMATS } from './coverage-format-types';

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

export type MapFilters = {
  datePreset: MapDatePreset;
  dateFrom: string;
  dateTo: string;
  coverageFormat: CoverageFormat | 'unassigned' | '';
  state: string;
  category: string;
  source: string;
  minScore: string;
  locationStatus: MapLocationStatusFilter;
  selectedForFilming: boolean;
  sort: MapSortId;
};

export const DEFAULT_MAP_FILTERS: MapFilters = {
  datePreset: 'next_30_days',
  dateFrom: '',
  dateTo: '',
  coverageFormat: '',
  state: '',
  category: '',
  source: '',
  minScore: '',
  locationStatus: 'resolved_verified',
  selectedForFilming: false,
  sort: 'soonest',
};

const DATE_PRESETS: MapDatePreset[] = [
  'today',
  'tomorrow',
  'this_week',
  'this_weekend',
  'next_7_days',
  'next_30_days',
  'custom',
];

const SORT_OPTIONS: MapSortId[] = ['soonest', 'highest_score', 'nearest', 'recently_discovered'];

function parseDatePreset(value: string | null): MapDatePreset {
  if (value && DATE_PRESETS.includes(value as MapDatePreset)) {
    return value as MapDatePreset;
  }
  return DEFAULT_MAP_FILTERS.datePreset;
}

function parseSort(value: string | null): MapSortId {
  if (value && SORT_OPTIONS.includes(value as MapSortId)) {
    return value as MapSortId;
  }
  return DEFAULT_MAP_FILTERS.sort;
}

function parseCoverageFormat(value: string | null): MapFilters['coverageFormat'] {
  if (!value) return '';
  if (value === 'unassigned') return 'unassigned';
  if ((COVERAGE_FORMATS as readonly string[]).includes(value)) {
    return value as CoverageFormat;
  }
  return '';
}

function parseLocationStatus(value: string | null): MapLocationStatusFilter {
  return value === 'include_needs_review' ? 'include_needs_review' : 'resolved_verified';
}

export function parseMapFiltersFromSearchParams(params: URLSearchParams): MapFilters {
  return {
    datePreset: parseDatePreset(params.get('datePreset')),
    dateFrom: params.get('dateFrom') ?? '',
    dateTo: params.get('dateTo') ?? '',
    coverageFormat: parseCoverageFormat(params.get('coverageFormat')),
    state: params.get('state') ?? '',
    category: params.get('category') ?? '',
    source: params.get('source') ?? '',
    minScore: params.get('minScore') ?? '',
    locationStatus: parseLocationStatus(params.get('locationStatus')),
    selectedForFilming: params.get('selectedForFilming') === 'true',
    sort: parseSort(params.get('sort')),
  };
}

export function buildMapApiQuery(filters: MapFilters): string {
  const params = new URLSearchParams();
  if (filters.datePreset !== DEFAULT_MAP_FILTERS.datePreset) {
    params.set('datePreset', filters.datePreset);
  }
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  if (filters.coverageFormat) params.set('coverageFormat', filters.coverageFormat);
  if (filters.state) params.set('state', filters.state);
  if (filters.category) params.set('category', filters.category);
  if (filters.source) params.set('source', filters.source);
  if (filters.minScore) params.set('minScore', filters.minScore);
  if (filters.locationStatus !== DEFAULT_MAP_FILTERS.locationStatus) {
    params.set('locationStatus', filters.locationStatus);
  }
  if (filters.selectedForFilming) params.set('selectedForFilming', 'true');
  if (filters.sort !== DEFAULT_MAP_FILTERS.sort) params.set('sort', filters.sort);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function buildMapPageQuery(filters: MapFilters, selectedId?: string | null): string {
  const params = new URLSearchParams(buildMapApiQuery(filters).replace(/^\?/, ''));
  if (selectedId) params.set('selected', selectedId);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function syncMapFiltersToUrl(filters: MapFilters, selectedId?: string | null): void {
  if (typeof window === 'undefined') return;
  const next = `${window.location.pathname}${buildMapPageQuery(filters, selectedId)}`;
  window.history.replaceState(null, '', next);
}

export function getGoogleMapsBrowserKey(): string {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? '';
}

export function isGoogleMapsConfigured(): boolean {
  return getGoogleMapsBrowserKey().length > 0;
}
