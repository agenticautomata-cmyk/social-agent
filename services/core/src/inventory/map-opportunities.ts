import { COVERAGE_FORMATS, type CoverageFormat } from '../coverage-format/constants.js';
import { getCreatorTimezone, getLocalCalendarDay } from '../datetime.js';
import type { PlannerItemRecord } from '../content-planner/items.js';
import type { LocationStatus } from '../opportunity-location/types.js';
import { KC_METRO_CENTER } from '../opportunity-location/types.js';
import type { InventoryItem } from './normalize.js';

export const MAP_DATE_PRESETS = [
  'today',
  'tomorrow',
  'this_week',
  'this_weekend',
  'next_7_days',
  'next_30_days',
  'custom',
] as const;

export type MapDatePreset = (typeof MAP_DATE_PRESETS)[number];

export const MAP_SORT_OPTIONS = [
  'soonest',
  'highest_score',
  'nearest',
  'recently_discovered',
] as const;

export type MapSortId = (typeof MAP_SORT_OPTIONS)[number];

export const MAP_EXCLUDED_CONTENT_STATES = new Set([
  'cancelled',
  'script_rejected',
  'failed',
  'published',
]);

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
  locationStatus: LocationStatus;
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

export type MapLocationStatusFilter = 'resolved_verified' | 'include_needs_review';

export type MapOpportunityFilters = {
  datePreset: MapDatePreset;
  dateFrom?: string;
  dateTo?: string;
  coverageFormat?: CoverageFormat | 'unassigned';
  state?: string;
  category?: string;
  source?: string;
  minScore?: number;
  locationStatus?: MapLocationStatusFilter;
  selectedForFilming?: boolean;
  excludeCategories?: string[];
};

export type MapOpportunitySource = InventoryItem & {
  locationCandidates?: Array<{
    placeId: string;
    displayName: string;
    formattedAddress: string;
    latitude: number;
    longitude: number;
    googleMapsUrl: string;
    score: number;
  }> | null;
};

export type MapOpportunitiesResult = {
  pins: MapOpportunityPin[];
  groups: MapLocationGroup[];
  visibleCount: number;
  hiddenUnresolvedCount: number;
  hiddenNotApplicableCount: number;
  hiddenExpiredCount: number;
  filterOptions: {
    sources: string[];
    categories: string[];
    states: string[];
  };
};

const ONLINE_HINTS = ['online', 'virtual', 'webinar', 'livestream'];

function addDaysToDateOnly(dateOnly: string, days: number, timezone: string): string {
  const [y, m, d] = dateOnly.split('-').map(Number);
  const utc = Date.UTC(y!, m! - 1, d! + days, 12);
  return getLocalCalendarDay(new Date(utc), timezone);
}

function getWeekdayIndex(dateOnly: string, timezone: string): number {
  const date = new Date(`${dateOnly}T12:00:00`);
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(date);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[weekday] ?? 0;
}

export function computeMapDateRange(
  preset: MapDatePreset,
  options: { dateFrom?: string; dateTo?: string; now?: Date; timezone?: string } = {},
): { dateFrom: string; dateTo: string } {
  const timezone = options.timezone ?? getCreatorTimezone();
  const now = options.now ?? new Date();
  const today = getLocalCalendarDay(now, timezone);

  switch (preset) {
    case 'today':
      return { dateFrom: today, dateTo: today };
    case 'tomorrow': {
      const tomorrow = addDaysToDateOnly(today, 1, timezone);
      return { dateFrom: tomorrow, dateTo: tomorrow };
    }
    case 'this_week': {
      const weekday = getWeekdayIndex(today, timezone);
      const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
      const monday = addDaysToDateOnly(today, mondayOffset, timezone);
      const sunday = addDaysToDateOnly(monday, 6, timezone);
      return { dateFrom: monday, dateTo: sunday };
    }
    case 'this_weekend': {
      const weekday = getWeekdayIndex(today, timezone);
      const saturdayOffset = weekday === 6 ? 0 : weekday === 0 ? 0 : 6 - weekday;
      const saturday = addDaysToDateOnly(today, saturdayOffset, timezone);
      const sunday = addDaysToDateOnly(saturday, weekday === 0 ? 0 : 1, timezone);
      return { dateFrom: saturday, dateTo: sunday };
    }
    case 'next_7_days':
      return { dateFrom: today, dateTo: addDaysToDateOnly(today, 6, timezone) };
    case 'next_30_days':
      return { dateFrom: today, dateTo: addDaysToDateOnly(today, 29, timezone) };
    case 'custom':
    default:
      return {
        dateFrom: options.dateFrom ?? today,
        dateTo: options.dateTo ?? addDaysToDateOnly(today, 29, timezone),
      };
  }
}

export function isMapExcludedContentState(state: string): boolean {
  return MAP_EXCLUDED_CONTENT_STATES.has(state);
}

export function isExpiredMapOpportunity(
  item: Pick<MapOpportunitySource, 'eventDate' | 'eventEndDate'>,
  now = new Date(),
  timezone = getCreatorTimezone(),
): boolean {
  const end = item.eventEndDate ?? item.eventDate;
  if (!end) return false;
  const endDay = getLocalCalendarDay(new Date(end), timezone);
  const today = getLocalCalendarDay(now, timezone);
  return endDay < today;
}

export function isOnlineOnlyMapOpportunity(item: MapOpportunitySource): boolean {
  if (item.locationStatus === 'not_applicable') return true;
  const blob = [
    item.title,
    item.summary,
    item.locationName,
    item.formattedAddress,
    JSON.stringify(item.metadata ?? {}),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return ONLINE_HINTS.some((hint) => blob.includes(hint));
}

export function extractOpportunityThumbnail(item: MapOpportunitySource): string | null {
  const metadata = item.metadata ?? {};
  const flat: Record<string, unknown> = { ...metadata };
  for (const value of Object.values(metadata)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (flat[k] === undefined) flat[k] = v;
      }
    }
  }
  for (const key of ['thumbnailUrl', 'imageUrl', 'image', 'photoUrl', 'heroImage', 'coverImage']) {
    const value = flat[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

export function opportunityMapScore(item: MapOpportunitySource): number {
  const relevance = item.relevanceScore != null ? Number(item.relevanceScore) : 0;
  const urgency = item.urgencyScore != null ? Number(item.urgencyScore) : 0;
  if (Number.isFinite(relevance) || Number.isFinite(urgency)) {
    return (Number.isFinite(relevance) ? relevance : 0) + (Number.isFinite(urgency) ? urgency : 0);
  }
  return item.audienceScore;
}

function eventDateForFilter(item: MapOpportunitySource): string | null {
  return item.eventDate ?? item.discoveredAt ?? item.createdAt;
}

function matchesDateRange(
  item: MapOpportunitySource,
  dateFrom: string,
  dateTo: string,
): boolean {
  const dateStr = eventDateForFilter(item);
  if (!dateStr) return true;
  const day = getLocalCalendarDay(new Date(dateStr), getCreatorTimezone());
  return day >= dateFrom && day <= dateTo;
}

function resolveCoordinates(
  item: MapOpportunitySource,
  includeNeedsReview: boolean,
): {
  latitude: number;
  longitude: number;
  formattedAddress: string | null;
  googleMapsUrl: string | null;
  locationName: string | null;
  needsReviewPin: boolean;
} | null {
  const status = (item.locationStatus ?? 'unresolved') as LocationStatus;

  if (
    (status === 'resolved' || status === 'verified') &&
    item.locationLat != null &&
    item.locationLng != null
  ) {
    return {
      latitude: item.locationLat,
      longitude: item.locationLng,
      formattedAddress: item.formattedAddress,
      googleMapsUrl: item.googleMapsUrl,
      locationName: item.locationName ?? item.venue,
      needsReviewPin: false,
    };
  }

  if (includeNeedsReview && status === 'needs_review') {
    const candidates = item.locationCandidates ?? [];
    const best = [...candidates].sort((a, b) => b.score - a.score)[0];
    if (best?.latitude != null && best.longitude != null) {
      return {
        latitude: best.latitude,
        longitude: best.longitude,
        formattedAddress: best.formattedAddress,
        googleMapsUrl: best.googleMapsUrl,
        locationName: best.displayName,
        needsReviewPin: true,
      };
    }
  }

  return null;
}

export function buildMapGroupKey(
  latitude: number,
  longitude: number,
  googlePlaceId?: string | null,
): string {
  if (googlePlaceId) return `place:${googlePlaceId}`;
  return `coord:${latitude.toFixed(4)}:${longitude.toFixed(4)}`;
}

export function toMapOpportunityPin(
  item: MapOpportunitySource,
  coords: NonNullable<ReturnType<typeof resolveCoordinates>>,
  planner?: PlannerItemRecord | null,
): MapOpportunityPin {
  const selectedForFilming = planner?.listName === 'Today' && planner.status === 'planned';
  return {
    id: item.id,
    title: item.title,
    eventDate: item.eventDate,
    eventEndDate: item.eventEndDate,
    locationName: coords.locationName,
    formattedAddress: coords.formattedAddress,
    latitude: coords.latitude,
    longitude: coords.longitude,
    googleMapsUrl: coords.googleMapsUrl,
    state: item.state,
    locationStatus: (item.locationStatus ?? 'unresolved') as LocationStatus,
    locationConfidence: item.locationConfidence,
    coverageFormat: (item.coverageFormat as CoverageFormat | null) ?? null,
    category: item.category,
    sourceName: item.sourceName,
    score: opportunityMapScore(item),
    thumbnailUrl: extractOpportunityThumbnail(item),
    detailUrl: `/review/inventory?id=${item.id}`,
    selectedForFilming,
    needsReviewPin: coords.needsReviewPin,
    groupKey: buildMapGroupKey(coords.latitude, coords.longitude, item.googlePlaceId),
  };
}

export function sortMapPins(
  pins: MapOpportunityPin[],
  sort: MapSortId,
  mapCenter: { latitude: number; longitude: number } = KC_METRO_CENTER,
): MapOpportunityPin[] {
  const copy = [...pins];
  switch (sort) {
    case 'highest_score':
      return copy.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
    case 'recently_discovered':
      return copy.sort((a, b) => {
        const aDiscovered = a.eventDate ?? '';
        const bDiscovered = b.eventDate ?? '';
        return bDiscovered.localeCompare(aDiscovered);
      });
    case 'nearest':
      return copy.sort(
        (a, b) =>
          haversineKm(mapCenter.latitude, mapCenter.longitude, a.latitude, a.longitude) -
          haversineKm(mapCenter.latitude, mapCenter.longitude, b.latitude, b.longitude),
      );
    case 'soonest':
    default:
      return copy.sort((a, b) => {
        const aTime = a.eventDate ? Date.parse(a.eventDate) : Number.MAX_SAFE_INTEGER;
        const bTime = b.eventDate ? Date.parse(b.eventDate) : Number.MAX_SAFE_INTEGER;
        if (aTime !== bTime) return aTime - bTime;
        return a.title.localeCompare(b.title);
      });
  }
}

export function groupMapPinsByLocation(pins: MapOpportunityPin[]): MapLocationGroup[] {
  const groups = new Map<string, MapLocationGroup>();
  for (const pin of pins) {
    const existing = groups.get(pin.groupKey);
    if (existing) {
      existing.opportunities.push(pin);
      continue;
    }
    groups.set(pin.groupKey, {
      groupKey: pin.groupKey,
      latitude: pin.latitude,
      longitude: pin.longitude,
      locationName: pin.locationName,
      formattedAddress: pin.formattedAddress,
      opportunities: [pin],
    });
  }
  return [...groups.values()];
}

export function buildMapOpportunities(
  items: MapOpportunitySource[],
  plannerByContentId: Map<string, PlannerItemRecord>,
  filters: MapOpportunityFilters,
  sort: MapSortId = 'soonest',
  now = new Date(),
): MapOpportunitiesResult {
  const timezone = getCreatorTimezone();
  const { dateFrom, dateTo } = computeMapDateRange(filters.datePreset, {
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    now,
    timezone,
  });

  const includeNeedsReview = filters.locationStatus === 'include_needs_review';
  let hiddenUnresolvedCount = 0;
  let hiddenNotApplicableCount = 0;
  let hiddenExpiredCount = 0;

  const eligible = items.filter((item) => {
    if (isMapExcludedContentState(item.state)) return false;
    if (isExpiredMapOpportunity(item, now, timezone)) {
      hiddenExpiredCount += 1;
      return false;
    }
    if (isOnlineOnlyMapOpportunity(item)) {
      hiddenNotApplicableCount += 1;
      return false;
    }
    if (filters.source && item.sourceName !== filters.source) return false;
    if (filters.category && item.category !== filters.category) return false;
    if (filters.excludeCategories?.length) {
      const cat = item.category ?? 'uncategorized';
      if (filters.excludeCategories.includes(cat)) return false;
    }
    if (filters.state && item.state !== filters.state) return false;
    if (filters.coverageFormat) {
      if (filters.coverageFormat === 'unassigned') {
        if (item.coverageFormat) return false;
      } else if (item.coverageFormat !== filters.coverageFormat) {
        return false;
      }
    }
    if (filters.minScore != null && opportunityMapScore(item) < filters.minScore) return false;
    if (!matchesDateRange(item, dateFrom, dateTo)) return false;

    const planner = plannerByContentId.get(item.id);
    if (filters.selectedForFilming) {
      if (!planner || planner.listName !== 'Today' || planner.status !== 'planned') return false;
    }

    const coords = resolveCoordinates(item, includeNeedsReview);
    if (!coords) {
      const status = item.locationStatus ?? 'unresolved';
      if (status === 'not_applicable') hiddenNotApplicableCount += 1;
      else hiddenUnresolvedCount += 1;
      return false;
    }

    return true;
  });

  const pins = eligible.map((item) =>
    toMapOpportunityPin(item, resolveCoordinates(item, includeNeedsReview)!, plannerByContentId.get(item.id)),
  );

  const sortedPins = sortMapPins(pins, sort);
  const groups = groupMapPinsByLocation(sortedPins);

  const sources = new Set<string>();
  const categories = new Set<string>();
  const states = new Set<string>();
  for (const item of items) {
    if (item.sourceName) sources.add(item.sourceName);
    if (item.category) categories.add(item.category);
    states.add(item.state);
  }

  return {
    pins: sortedPins,
    groups,
    visibleCount: sortedPins.length,
    hiddenUnresolvedCount,
    hiddenNotApplicableCount,
    hiddenExpiredCount,
    filterOptions: {
      sources: [...sources].sort(),
      categories: [...categories].sort(),
      states: [...states].sort(),
    },
  };
}

export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isValidCoverageFormatFilter(
  value: string | undefined,
): value is CoverageFormat | 'unassigned' | undefined {
  if (!value) return true;
  if (value === 'unassigned') return true;
  return (COVERAGE_FORMATS as readonly string[]).includes(value);
}
