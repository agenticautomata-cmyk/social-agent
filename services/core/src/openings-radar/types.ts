/**
 * Openings Radar — first-class establishment/location discovery types.
 * No brand/domain hard-coding in production extraction.
 */

export const OPENING_LIFECYCLE_STATUSES = [
  'rumored',
  'announced',
  'site_identified',
  'under_construction',
  'opening_soon',
  'soft_open',
  'grand_opening_scheduled',
  'open',
  'delayed',
  'relocated',
  'expanding',
  'canceled',
  'closed',
  'needs_verification',
] as const;

export type OpeningLifecycleStatus = (typeof OPENING_LIFECYCLE_STATUSES)[number];

export const FIELD_CLAIM_LABELS = [
  'verified_first_party',
  'corroborated',
  'secondary_source',
  'unverified_lead',
  'conflicting',
  'not_found',
  'editorial_supported',
] as const;

export type FieldClaimLabel = (typeof FIELD_CLAIM_LABELS)[number];

export type OpeningDateInfo = {
  /** Honest label: "opening soon", "mid-October 2026", etc. Never invent exact dates. */
  label: string | null;
  /** ISO date only when source states an exact calendar day. */
  exactDate: string | null;
  precision: 'exact' | 'approximate' | 'vague' | 'unknown';
};

export type ParsedOpeningEntry = {
  businessName: string;
  parentBrand: string | null;
  isLocalIndependent: boolean | null;
  isChain: boolean | null;
  category: string | null;
  description: string | null;
  streetAddress: string | null;
  suite: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  neighborhood: string | null;
  status: OpeningLifecycleStatus;
  estimatedOpening: OpeningDateInfo;
  grandOpening: OpeningDateInfo;
  softOpening: OpeningDateInfo;
  relocationStatus: string | null;
  expansionStatus: string | null;
  formerLocation: string | null;
  formerTenant: string | null;
  additionalLocationsPlanned: string | null;
  evidenceText: string;
  confidence: number;
  fieldConfidence: Record<string, number>;
};

export type OpeningSourceProvenance = {
  monitoredSource?: string | null;
  articleTitle?: string | null;
  author?: string | null;
  publicationDate?: string | null;
  canonicalArticleUrl?: string | null;
  gmailMessageId?: string | null;
  discoveryEmailMessageId?: string | null;
  socialPostUrl?: string | null;
  sourceFingerprint: string;
  extractedAt: string;
  channel: 'email' | 'article' | 'rss' | 'social' | 'manual' | 'fixture';
};

export type OpeningPersistDecision = {
  locationId: string;
  businessId: string;
  created: boolean;
  updated: boolean;
  duplicateMerged: boolean;
  businessName: string;
  status: OpeningLifecycleStatus;
  opportunityDecision: string;
  eventDecision: string;
  opportunityContentItemId: string | null;
  calendarItemId: string | null;
};

export type OpeningIngestResult = {
  runId: string;
  sourceFingerprint: string;
  entriesParsed: number;
  locationsCreated: number;
  locationsUpdated: number;
  locationsMerged: number;
  opportunitiesCreated: number;
  eventsCreated: number;
  alertsCreated: number;
  decisions: OpeningPersistDecision[];
  rejected: Array<{ reason: string; detail?: string }>;
};

export type OpeningRadarCard = {
  id: string;
  businessId: string;
  businessName: string;
  category: string | null;
  neighborhood: string | null;
  city: string | null;
  address: string | null;
  status: OpeningLifecycleStatus;
  expectedOpening: string | null;
  exactOpeningDate: string | null;
  grandOpeningDate: string | null;
  softOpeningDate: string | null;
  sourceTitle: string | null;
  sourceUrl: string | null;
  verificationLevel: string;
  lastChecked: string;
  creatorFitScore: number | null;
  recommendedNextAction: string | null;
  opportunityDecision: string | null;
  eventDecision: string | null;
  opportunityContentItemId: string | null;
  calendarItemId: string | null;
  isLocalIndependent: boolean | null;
  isChain: boolean | null;
  relocationStatus: string | null;
  expansionStatus: string | null;
  latitude: number | null;
  longitude: number | null;
  dismissed: boolean;
  research: Record<string, unknown>;
};
