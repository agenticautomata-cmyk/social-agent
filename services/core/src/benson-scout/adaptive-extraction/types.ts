/**
 * Adaptive website extraction — shared types.
 *
 * Extraction success is separate from Calendar admission / editorial relevance.
 * Status values describe the extraction pipeline, not outreach or calendar publish.
 */

import type { ExtractedEventListing, EventListingCapability } from '../event-listing-extract.js';

/** Watchlist / extraction health after a capability-chain run. */
export type AdaptiveExtractionStatus =
  | 'healthy'
  | 'no_change'
  | 'empty_confirmed'
  | 'needs_adapter'
  | 'structure_changed'
  | 'blocked'
  | 'rate_limited'
  | 'failed'
  | 'partial'
  | 'operator_paused';

export type AcquisitionKind =
  | 'useful_html'
  | 'js_shell'
  | 'structured_payload'
  | 'redirect'
  | 'access_control'
  | 'challenge'
  | 'rate_limited'
  | 'error'
  | 'empty';

export type AcquisitionObservation = {
  configuredUrl: string;
  finalUrl: string | null;
  canonicalUrl: string | null;
  httpStatus: number;
  contentType: string | null;
  byteSize: number;
  redirectChain: string[];
  cacheHeaders: Record<string, string>;
  wafOrCdnIndicators: string[];
  pageTitle: string | null;
  kind: AcquisitionKind;
  /** HTTP 403 is an observation — never alone the final extraction status. */
  http403: boolean;
  challengeProvider: string | null;
  usefulEventContentLikely: boolean;
  html: string;
  error: string | null;
  /** Retry-After header seconds when present (rate limits). */
  retryAfterSeconds: number | null;
};

export type DiscoveredSurfaceKind =
  | 'sitemap_index'
  | 'sitemap_urlset'
  | 'robots_txt'
  | 'ics_feed'
  | 'rss_atom'
  | 'json_feed'
  | 'wp_rest'
  | 'wp_cpt_feed'
  | 'tec_rest'
  | 'tec_ics'
  | 'json_ld'
  | 'embedded_json'
  | 'canonical_events_archive'
  | 'calendar_collection'
  | 'event_detail_urls'
  | 'series_or_category'
  | 'ticket_provider'
  | 'same_origin_semantic'
  | 'browser_document'
  | 'public_network_json'
  | 'link_alternate'
  | 'configured_url';

export type SurfaceTrustLevel =
  | 'first_party_structured'
  | 'first_party_feed'
  | 'first_party_html'
  | 'embedded_provider'
  | 'inferred_convention'
  | 'unverified';

export type DiscoveredSurface = {
  kind: DiscoveredSurfaceKind;
  url: string;
  evidence: string[];
  sameOrigin: boolean;
  /** Safe to fetch with ordinary public HTTP (no auth/circumvention). */
  publiclyFetchable: boolean;
  discoveryMethod?: string;
  referringSurface?: string | null;
  platformEvidence?: string[];
  selectionReason?: string | null;
};

/** Recorded attempt against a discovered surface (evidence graph node). */
export type SurfaceAttempt = {
  url: string;
  kind: DiscoveredSurfaceKind | string;
  discoveryMethod: string;
  referringSurface: string | null;
  platformEvidence: string[];
  httpStatus: number | null;
  contentType: string | null;
  acquisitionKind: AcquisitionKind | string | null;
  challengeProvider: string | null;
  usefulness: 'events_extracted' | 'structured_useful' | 'discovery_only' | 'challenge' | 'empty' | 'error' | 'skipped';
  eventCount: number;
  trustLevel: SurfaceTrustLevel;
  notes: string[];
};

export type PlatformSignatureId =
  | 'wordpress_tec'
  | 'wordpress_rhp_events'
  | 'wordpress_mec'
  | 'wix_events'
  | 'squarespace_events'
  | 'eventbrite'
  | 'dostuff'
  | 'bandsintown'
  | 'ticketmaster'
  | 'meetup'
  | 'schema_org_events'
  | 'ics_calendar'
  | 'rss_atom_feed'
  | 'theater_season'
  | 'generic_semantic_html'
  | 'js_hydration_shell'
  | 'unknown';

export type PlatformRecognition = {
  signature: PlatformSignatureId;
  confidence: number;
  evidence: string[];
  /** Capability / profile key — not a domain guess. */
  profileKey: string;
};

export type StrategyStep =
  | 'url_policy'
  | 'http_acquisition'
  | 'surface_discovery'
  | 'structured_data'
  | 'platform_recognition'
  | 'strategy_plan'
  | 'alternate_surface_fetch'
  | 'adapter_extract'
  | 'browser_fallback'
  | 'generic_semantic'
  | 'image_ocr'
  | 'validation'
  | 'change_detection'
  | 'persist';

export type PlannedStrategy = {
  id: string;
  rank: number;
  surfaceUrl: string | null;
  methodHint: string;
  reasonSelected: string;
  reasonRejected: string | null;
  selected: boolean;
  estimatedCost: 'low' | 'medium' | 'high';
  trustLevel: SurfaceTrustLevel;
};

export type RetryClass =
  | 'captcha_access_control'
  | 'rate_limit'
  | 'temp_server'
  | 'unsupported_reassess'
  | 'operator_paused'
  | 'none';

export type BlockedSourceRetryState = {
  retryClass: RetryClass;
  nextRetryAt: string | null;
  consecutiveFailures: number;
  lastHealthyAt: string | null;
  lastStrategy: string | null;
  blocker: string | null;
  operatorPaused: boolean;
  systemBackoff: boolean;
};

export type AdaptiveStrategyProfile = {
  profileVersion: number;
  platformSignature: PlatformSignatureId;
  profileKey: string;
  capabilitySequence: StrategyStep[];
  surfaceType: string | null;
  discoveryPath: string | null;
  endpointPattern: string | null;
  schemaMapping: string | null;
  pagination: string | null;
  renderWait: string | null;
  browserWait: string | null;
  requiredFields: string[];
  detailEnrichment: string | null;
  lastVerifiedAt: string | null;
  pageStructureFingerprint: string | null;
  expectedCountRange: { min: number; max: number } | null;
  consecutiveFailures: number;
  successCount: number;
  failureCount: number;
  fixtureRef: string | null;
  confidence: number;
  lastMethod: string | null;
  lastStatus: AdaptiveExtractionStatus | null;
  evidenceQuality: number;
  domainOverrideReason: string | null;
  trustedPromotion: boolean;
};

export type FieldEvidence = {
  field: string;
  value: string;
  evidence: string;
  confidence: number;
};

export type ChangeDetectionResult = {
  changed: boolean;
  signals: string[];
  lastKnownGoodFingerprint: string | null;
  retainPriorInventory: boolean;
  freshnessStatus: 'fresh' | 'stale' | 'unknown' | 'blocked_reassess';
};

export type AdaptiveDiagnostics = {
  configuredUrl: string;
  finalUrl: string | null;
  canonicalUrl: string | null;
  platform: string | null;
  httpResult: string;
  challengeProvider: string | null;
  discoveredSurfaces: DiscoveredSurface[];
  surfaceAttempts: SurfaceAttempt[];
  selectedStrategy: string | null;
  plannedStrategies: PlannedStrategy[];
  fallbacks: string[];
  groups: number;
  occurrences: number;
  accepted: number;
  quarantined: number;
  failedStage: StrategyStep | null;
  blocker: string | null;
  lastHealthyAt: string | null;
  freshness: string | null;
  nextRetryAt: string | null;
  retry: BlockedSourceRetryState | null;
  profileConfidence: number | null;
  conciseSummary: string;
  technicalDetails: string[];
};

export type AdaptiveExtractionResult = {
  status: AdaptiveExtractionStatus;
  configuredUrl: string;
  finalUrl: string | null;
  canonicalUrl: string | null;
  acquisition: AcquisitionObservation;
  surfaces: DiscoveredSurface[];
  surfaceAttempts: SurfaceAttempt[];
  platforms: PlatformRecognition[];
  selectedPlatform: PlatformRecognition | null;
  selectedMethod: string | null;
  plannedStrategies: PlannedStrategy[];
  strategiesAttempted: string[];
  failedStage: StrategyStep | null;
  failureReason: string | null;
  httpResult: string;
  fallbackResult: string | null;
  events: ExtractedEventListing[];
  engagementGroupCount: number;
  occurrenceCount: number;
  acceptedCount: number;
  quarantinedCount: number;
  capability: EventListingCapability | null;
  profile: AdaptiveStrategyProfile | null;
  validationNotes: string[];
  statusExplanation: string;
  retrievedAt: string;
  retry: BlockedSourceRetryState | null;
  changeDetection: ChangeDetectionResult | null;
  diagnostics: AdaptiveDiagnostics;
};
