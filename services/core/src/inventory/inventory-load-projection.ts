import { contentItems } from '../schema.js';
import type { ContentItem } from '../schema.js';

/**
 * Minimum content_items columns for loadIngestedInventoryItems() → normalizeInventoryItem().
 * Omits raw_payload, location_candidates, captions, video/HeyGen fields, embeddings, etc.
 */
export const inventoryLoadContentItemSelect = {
  id: contentItems.id,
  topic: contentItems.topic,
  hook: contentItems.hook,
  script: contentItems.script,
  metadata: contentItems.metadata,
  state: contentItems.state,
  eventStartsAt: contentItems.eventStartsAt,
  eventEndsAt: contentItems.eventEndsAt,
  discoveredAt: contentItems.discoveredAt,
  createdAt: contentItems.createdAt,
  updatedAt: contentItems.updatedAt,
  locationName: contentItems.locationName,
  locationStatus: contentItems.locationStatus,
  formattedAddress: contentItems.formattedAddress,
  locationLat: contentItems.locationLat,
  locationLng: contentItems.locationLng,
  googlePlaceId: contentItems.googlePlaceId,
  googleMapsUrl: contentItems.googleMapsUrl,
  locationWebsiteUrl: contentItems.locationWebsiteUrl,
  locationConfidence: contentItems.locationConfidence,
  locationSource: contentItems.locationSource,
  locationVerifiedAt: contentItems.locationVerifiedAt,
  locationResolutionError: contentItems.locationResolutionError,
  sourceUrl: contentItems.sourceUrl,
  relevanceScore: contentItems.relevanceScore,
  urgencyScore: contentItems.urgencyScore,
  coverageFormat: contentItems.coverageFormat,
  suggestedCoverageFormat: contentItems.suggestedCoverageFormat,
  firsthandVisited: contentItems.firsthandVisited,
  creatorValueStatus: contentItems.creatorValueStatus,
  lifecycleStatus: contentItems.lifecycleStatus,
} as const;

export type InventoryNormalizeSource = Pick<
  ContentItem,
  keyof typeof inventoryLoadContentItemSelect
>;

/** Documented omitted columns — not fetched by loadIngestedInventoryItems(). */
export const INVENTORY_LOAD_OMITTED_CONTENT_COLUMNS = [
  'rawPayload',
  'locationCandidates',
  'topicEmbedding',
  'cta',
  'durationSeconds',
  'captionInstagram',
  'captionTiktok',
  'hashtagsInstagram',
  'hashtagsTiktok',
  'heygenVideoId',
  'heygenVideoUrl',
  'finalVideoUrl',
  'plannedForDate',
  'scheduledFor',
  'publishedAt',
  'scriptApprovedAt',
  'scriptApprovedBy',
  'scriptRejectionReason',
  'lastError',
  'retryCount',
  'firstSeenAt',
  'lastSeenAt',
  'sourceLastCheckedAt',
  'stale',
  'freshnessBucket',
  'creatorRelevanceExplanation',
  'contentCategory',
  'classificationVerifiedAt',
  'canonicalEntityId',
  'creatorNextAction',
  'topPickValidatedAt',
  'campaignId',
  'industryId',
  'personaId',
  'type',
  'language',
  'sourceId',
  'sourceExternalId',
] as const satisfies ReadonlyArray<keyof ContentItem>;
