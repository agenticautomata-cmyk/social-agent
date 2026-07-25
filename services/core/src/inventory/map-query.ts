import type { CoverageFormat } from '../coverage-format/constants.js';
import { COVERAGE_FORMATS } from '../coverage-format/constants.js';
import type { MapDatePreset, MapLocationStatusFilter, MapOpportunityFilters, MapSortId } from './map-opportunities.js';
import { MAP_DATE_PRESETS, MAP_SORT_OPTIONS } from './map-opportunities.js';

export type MapPageFilters = MapOpportunityFilters & {
  locationStatus: MapLocationStatusFilter;
  sort: MapSortId;
};

export const DEFAULT_MAP_PAGE_FILTERS: MapPageFilters = {
  datePreset: 'next_30_days',
  locationStatus: 'resolved_verified',
  sort: 'soonest',
};

function parseDatePreset(value: string | null): MapDatePreset {
  if (value && (MAP_DATE_PRESETS as readonly string[]).includes(value)) {
    return value as MapDatePreset;
  }
  return DEFAULT_MAP_PAGE_FILTERS.datePreset;
}

function parseSort(value: string | null): MapSortId {
  if (value && (MAP_SORT_OPTIONS as readonly string[]).includes(value)) {
    return value as MapSortId;
  }
  return DEFAULT_MAP_PAGE_FILTERS.sort;
}

function parseCoverageFormat(value: string | null): MapPageFilters['coverageFormat'] {
  if (!value) return undefined;
  if (value === 'unassigned') return 'unassigned';
  if ((COVERAGE_FORMATS as readonly string[]).includes(value)) {
    return value as CoverageFormat;
  }
  return undefined;
}

function parseLocationStatus(value: string | null): MapLocationStatusFilter {
  return value === 'include_needs_review' ? 'include_needs_review' : 'resolved_verified';
}

export function parseMapFiltersFromSearchParams(params: URLSearchParams): MapPageFilters {
  const minScoreRaw = params.get('minScore');
  const minScore = minScoreRaw ? Number(minScoreRaw) : undefined;

  return {
    datePreset: parseDatePreset(params.get('datePreset')),
    dateFrom: params.get('dateFrom') ?? undefined,
    dateTo: params.get('dateTo') ?? undefined,
    coverageFormat: parseCoverageFormat(params.get('coverageFormat')),
    state: params.get('state') ?? undefined,
    category: params.get('category') ?? undefined,
    source: params.get('source') ?? undefined,
    minScore: Number.isFinite(minScore) ? minScore : undefined,
    locationStatus: parseLocationStatus(params.get('locationStatus')),
    selectedForFilming: params.get('selectedForFilming') === 'true',
    sort: parseSort(params.get('sort')),
  };
}

export function buildMapApiQuery(filters: MapPageFilters): string {
  const params = new URLSearchParams();
  if (filters.datePreset !== DEFAULT_MAP_PAGE_FILTERS.datePreset) {
    params.set('datePreset', filters.datePreset);
  }
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  if (filters.coverageFormat) params.set('coverageFormat', filters.coverageFormat);
  if (filters.state) params.set('state', filters.state);
  if (filters.category) params.set('category', filters.category);
  if (filters.source) params.set('source', filters.source);
  if (filters.minScore != null) params.set('minScore', String(filters.minScore));
  if (filters.locationStatus !== DEFAULT_MAP_PAGE_FILTERS.locationStatus) {
    params.set('locationStatus', filters.locationStatus);
  }
  if (filters.selectedForFilming) params.set('selectedForFilming', 'true');
  if (filters.sort !== DEFAULT_MAP_PAGE_FILTERS.sort) params.set('sort', filters.sort);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function buildMapPageQuery(filters: MapPageFilters, selectedId?: string | null): string {
  const params = new URLSearchParams(buildMapApiQuery(filters).replace(/^\?/, ''));
  if (selectedId) params.set('selected', selectedId);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function isGoogleMapsBrowserKeyConfigured(apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY): boolean {
  return Boolean(apiKey?.trim());
}
