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
  | 'partial';

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
};

export type DiscoveredSurfaceKind =
  | 'sitemap_index'
  | 'sitemap_urlset'
  | 'robots_txt'
  | 'ics_feed'
  | 'rss_atom'
  | 'wp_rest'
  | 'json_ld'
  | 'canonical_events_archive'
  | 'event_detail_urls'
  | 'browser_document';

export type DiscoveredSurface = {
  kind: DiscoveredSurfaceKind;
  url: string;
  evidence: string[];
  sameOrigin: boolean;
  /** Safe to fetch with ordinary public HTTP (no auth/circumvention). */
  publiclyFetchable: boolean;
};

export type PlatformSignatureId =
  | 'wordpress_tec'
  | 'wordpress_rhp_events'
  | 'wix_events'
  | 'squarespace_events'
  | 'eventbrite'
  | 'dostuff'
  | 'schema_org_events'
  | 'ics_calendar'
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
  | 'adapter_extract'
  | 'browser_fallback'
  | 'validation'
  | 'persist';

export type AdaptiveStrategyProfile = {
  profileVersion: number;
  platformSignature: PlatformSignatureId;
  profileKey: string;
  capabilitySequence: StrategyStep[];
  endpointPattern: string | null;
  schemaMapping: string | null;
  pagination: string | null;
  renderWait: string | null;
  lastVerifiedAt: string | null;
  pageStructureFingerprint: string | null;
  successCount: number;
  failureCount: number;
  fixtureRef: string | null;
  confidence: number;
  lastMethod: string | null;
  lastStatus: AdaptiveExtractionStatus | null;
};

export type FieldEvidence = {
  field: string;
  value: string;
  evidence: string;
  confidence: number;
};

export type AdaptiveExtractionResult = {
  status: AdaptiveExtractionStatus;
  configuredUrl: string;
  finalUrl: string | null;
  canonicalUrl: string | null;
  acquisition: AcquisitionObservation;
  surfaces: DiscoveredSurface[];
  platforms: PlatformRecognition[];
  selectedPlatform: PlatformRecognition | null;
  selectedMethod: string | null;
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
};
