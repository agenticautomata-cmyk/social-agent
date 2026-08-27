export { loadIngestedInventoryItems, loadMapOpportunitySources } from './load-ingested.js';

export {
  normalizeInventoryItem,
  computeInventoryStats,
  applyInventoryPreset,
  sortInventoryItems,
  searchInventoryItems,
  filterInventoryItems,
  type InventoryItem,
  type InventoryFlags,
  type InventoryStats,
  type InventoryPresetId,
  type InventorySortId,
} from './normalize.js';

export {
  computeEditorialPicks,
  type EditorialPick,
  type EditorialPicksResponse,
  type EditorialPanelId,
  type EditorialScoreBreakdown,
  type EditorialScoreFactor,
} from './editorial-picks.js';

export {
  buildMapOpportunities,
  computeMapDateRange,
  groupMapPinsByLocation,
  haversineKm,
  isExpiredMapOpportunity,
  isMapExcludedContentState,
  isOnlineOnlyMapOpportunity,
  isValidCoverageFormatFilter,
  sortMapPins,
  MAP_DATE_PRESETS,
  MAP_SORT_OPTIONS,
  type MapDatePreset,
  type MapLocationGroup,
  type MapOpportunityFilters,
  type MapOpportunityPin,
  type MapOpportunitySource,
  type MapOpportunitiesResult,
  type MapSortId,
} from './map-opportunities.js';

export {
  countExpiredEvents,
  isAncientEventDate,
  runExpiredEventSweep,
  type ExpiredEventSweepResult,
} from './expire-sweep.js';

export {
  countStaleLifecycleRows,
  runLifecycleRecompute,
  type LifecycleRecomputeResult,
} from './lifecycle-recompute.js';

export { INGEST_RETENTION_DAYS_PAST_EVENT, ingestedWithinRetentionWindow } from './retention.js';

export {
  buildMapApiQuery,
  buildMapPageQuery,
  DEFAULT_MAP_PAGE_FILTERS,
  isGoogleMapsBrowserKeyConfigured,
  parseMapFiltersFromSearchParams,
  type MapPageFilters,
} from './map-query.js';

export {
  computeCommandCenter,
  computeWeekPicks,
  itemToCommandCenterCard,
  attachTrackingToCards,
  filterPossiblePostTodayCandidates,
  type CommandCenterCard,
  type CommandCenterResponse,
  type CommandCenterSectionId,
  type CommandCenterMetric,
  type FitLevel,
} from './command-center.js';

export {
  evaluateHomeEligibility,
  filterHomeEligibleItems,
  hasValidHomeCtaTarget,
  isHomeEligible,
  type HomeEligibilityReason,
  type HomeEligibilityResult,
} from './home-eligibility.js';

export {
  evaluatePublicEventEligibility,
  isPublicEventLaneEligible,
  rankPublicEventScore,
  type PublicEventEligibilityDecision,
  type PublicEventLane,
} from './public-event-eligibility.js';

export {
  evaluateDiscoverEligibility,
  isDiscoverEligible,
  opaqueSubjectFromTitle,
  type DiscoverEligibilityInput,
  type DiscoverEligibilityReason,
  type DiscoverEligibilityResult,
} from './discover-eligibility.js';

export {
  isAudienceFreshContent,
  isKcSippsRoundup,
  isSponsorOutreachTarget,
  isOpeningContent,
  audienceFreshnessBoost,
  openingUrgencyBoost,
  openingUrgencyBoostFromFields,
  contentAgeDays,
  contentPublishedAt,
  hasExplicitPastEventDate,
  isDiscoveryFeedFresh,
  isRelativeSeasonStaleText,
  isWorldCupSeasonActive,
  isWorldCupAudienceStale,
  isWorldCupFlaggedItem,
  textHasWorldCupAngle,
  worldCupUrgencyBoost,
  WORLD_CUP_TEXT_RE,
  worldCupSeasonStatusLabel,
} from './content-freshness.js';

export {
  inferContentFraming,
  isShoppingRetailContent,
  whyItMattersForFraming,
  inferContentFramingFromFields,
  framingLabel,
  type ContentFraming,
} from './content-framing.js';
