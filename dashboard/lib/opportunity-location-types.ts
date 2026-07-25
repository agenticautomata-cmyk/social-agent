export type OpportunityLocationStatus =
  | 'unresolved'
  | 'resolving'
  | 'resolved'
  | 'needs_review'
  | 'verified'
  | 'not_applicable';

export type OpportunityLocationCandidate = {
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

export type OpportunityLocationView = {
  contentItemId: string;
  locationStatus: OpportunityLocationStatus;
  locationName: string | null;
  formattedAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  googlePlaceId: string | null;
  googleMapsUrl: string | null;
  locationWebsiteUrl: string | null;
  locationConfidence: number | null;
  locationSource: string | null;
  locationCandidates: OpportunityLocationCandidate[];
  locationVerifiedAt: string | null;
  locationResolutionError: string | null;
  providerConfigured: boolean;
};
