export const CREATOR_VALUE_STATUSES = [
  'hidden_raw_signal',
  'researching',
  'creator_candidate',
  'actionable',
  'top_pick',
  'rejected',
  'archived',
] as const;

export type CreatorValueStatus = (typeof CREATOR_VALUE_STATUSES)[number];

export const KELLIE_VISIBLE_CREATOR_STATUSES: CreatorValueStatus[] = [
  'creator_candidate',
  'actionable',
  'top_pick',
];

export const LIFECYCLE_STATUSES = [
  'upcoming',
  'active',
  'expiring_soon',
  'expired',
  'archived',
  'needs_date_verification',
] as const;

export type LifecycleStatus = (typeof LIFECYCLE_STATUSES)[number];

export const ACTIVE_LIFECYCLE_STATUSES: LifecycleStatus[] = [
  'upcoming',
  'active',
  'expiring_soon',
];

export const SUPPRESSION_SCOPES = [
  'never_recommend',
  'never_pitch',
  'never_notify',
  'never_show_in_feed',
  'never_mention',
  'suppress_everywhere',
] as const;

export type SuppressionScope = (typeof SUPPRESSION_SCOPES)[number];

export const FEEDBACK_REASON_CODES = [
  'not_my_audience',
  'too_old',
  'too_far',
  'too_expensive',
  'not_visually_interesting',
  'not_enough_information',
  'antiques_or_estate_sale',
  'generic_community_event',
  'duplicate',
  'already_covered',
  'already_missed',
  'no_creator_angle',
  'bad_classification',
  'permanently_suppress',
  'not_interested',
  'too_repetitive',
  'bad_source',
  'irrelevant_category',
] as const;

export type FeedbackReasonCode = (typeof FEEDBACK_REASON_CODES)[number];

export const CONTACT_VERIFICATION_STATUSES = [
  'verified_appropriate',
  'found_unverified',
  'generic_business_channel',
  'contact_form',
  'phone_only',
  'invalid',
  'stale',
  'missing',
] as const;

export type ContactVerificationStatus = (typeof CONTACT_VERIFICATION_STATUSES)[number];

export const PITCH_READINESS_STATUSES = [
  'lead_only',
  'researching',
  'needs_contact',
  'needs_angle',
  'pitch_ready',
  'approved_to_send',
  'sent',
  'response_received',
  'follow_up_due',
  'declined',
  'closed',
] as const;

export type PitchReadinessStatus = (typeof PITCH_READINESS_STATUSES)[number];

export type CreatorRelevanceInput = {
  id?: string;
  title: string;
  summary?: string | null;
  sourceType?: string | null;
  sourceUrl?: string | null;
  contentCategory?: string | null;
  eventStartsAt?: Date | string | null;
  eventEndsAt?: Date | string | null;
  discoveredAt?: Date | string | null;
  metadata?: Record<string, unknown> | null;
  signalType?: string | null;
  businessName?: string | null;
};

export type CreatorRelevanceResult = {
  creatorValueStatus: CreatorValueStatus;
  lifecycleStatus: LifecycleStatus;
  explanations: string[];
  blockedBySuppression: boolean;
  blockedByCategoryRule: boolean;
};

export type InventorySearchFilters = {
  query?: string;
  category?: string;
  lifecycle?: LifecycleStatus[];
  creatorStatus?: CreatorValueStatus[];
  includeArchived?: boolean;
  includeSuppressed?: boolean;
  pitchReadyOnly?: boolean;
  contactAvailable?: boolean;
  freeOnly?: boolean;
  limit?: number;
};

export type InventorySearchHit = {
  id: string;
  title: string;
  summary: string | null;
  category: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  eventDate: string | null;
  location: string | null;
  creatorValueStatus: CreatorValueStatus;
  lifecycleStatus: LifecycleStatus;
  reviewUrl: string;
  whyItQualifies: string[];
};
