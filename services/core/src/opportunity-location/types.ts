export type LocationStatus =
  | 'unresolved'
  | 'resolving'
  | 'resolved'
  | 'needs_review'
  | 'verified'
  | 'not_applicable';

export type LocationSearchContext = {
  venueName?: string | null;
  businessName?: string | null;
  address?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  sourceUrl?: string | null;
  organizerAddress?: string | null;
  eventVenue?: string | null;
  isOnlineOnly?: boolean;
};

export type ScoredLocationCandidate = {
  placeId: string;
  displayName: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
  googleMapsUrl: string;
  websiteUrl?: string | null;
  score: number;
  scoreBreakdown: Record<string, number>;
};

export type LocationResolutionDecision = {
  status: LocationStatus;
  selected: ScoredLocationCandidate | null;
  candidates: ScoredLocationCandidate[];
  confidence: number | null;
  error: string | null;
};

export type OpportunityLocationRecord = {
  contentItemId: string;
  locationStatus: LocationStatus;
  locationName: string | null;
  formattedAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  googlePlaceId: string | null;
  googleMapsUrl: string | null;
  locationWebsiteUrl: string | null;
  locationConfidence: number | null;
  locationSource: string | null;
  locationCandidates: ScoredLocationCandidate[];
  locationVerifiedAt: string | null;
  locationResolutionError: string | null;
  providerConfigured: boolean;
};

export const LOCATION_STATUSES: LocationStatus[] = [
  'unresolved',
  'resolving',
  'resolved',
  'needs_review',
  'verified',
  'not_applicable',
];

export function normalizeLocationStatus(value: string | null | undefined): LocationStatus {
  if (value && LOCATION_STATUSES.includes(value as LocationStatus)) {
    return value as LocationStatus;
  }
  return 'unresolved';
}

export const KC_METRO_CENTER = {
  latitude: 39.0997,
  longitude: -94.5786,
  label: 'Kansas City, MO',
};
