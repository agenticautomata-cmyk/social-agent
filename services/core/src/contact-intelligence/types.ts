/**
 * Contact Intelligence — UX / recommendation API contracts.
 *
 * UX_LANE owned these shapes so dashboard and thin API stubs share one contract.
 * PRIMARY: flesh out list/get/feedback against real stores; keep field names stable.
 *
 * `KcContactEvidenceState` values match discovery `DiscoveryContactState`
 * (same mission vocabulary). Prefer discovery helpers for research lifecycle;
 * use these types for hub/brief payloads.
 */

/** Mission contact-evidence states (broader than legacy hospitality six-state model). */
export const KC_CONTACT_EVIDENCE_STATES = [
  'verified_named_contact',
  'verified_role_inbox',
  'verified_official_form',
  'verified_program',
  'official_general_route',
  'stale_needs_recheck',
  'conflicting',
  'inferred_unverified',
  'unknown',
  'blocked_or_removed',
] as const;

export type KcContactEvidenceState = (typeof KC_CONTACT_EVIDENCE_STATES)[number];

export const KC_ROUTE_TYPES = [
  'pr_named',
  'marketing_named',
  'role_inbox',
  'general_inbox',
  'phone',
  'official_form',
  'creator_application',
  'affiliate_program',
  'media_access',
  'hosted_visit',
  'partnership_page',
  'monitor_only',
] as const;

export type KcRouteType = (typeof KC_ROUTE_TYPES)[number];

/** Realistic ask — media access is never labeled as paid compensation. */
export const KC_ASK_TYPES = [
  'paid_collaboration',
  'hosted_stay',
  'complimentary_admission',
  'meal_or_product_consideration',
  'affiliate_commission',
  'event_credential',
  'interview_or_access',
  'relationship_introduction',
  'unknown',
] as const;

export type KcAskType = (typeof KC_ASK_TYPES)[number];

export const KC_COMPENSATION_ACCESS_TYPES = [
  'paid',
  'hosted',
  'complimentary_access',
  'product_consideration',
  'affiliate',
  'credential_only',
  'media_access_not_paid',
  'unknown',
] as const;

export type KcCompensationAccessType = (typeof KC_COMPENSATION_ACCESS_TYPES)[number];

export const KC_HUB_VIEWS = [
  'recommended_now',
  'verified_contacts',
  'programs_applications',
  'needs_verification',
  'follow_ups',
  'recently_changed',
] as const;

export type KcHubView = (typeof KC_HUB_VIEWS)[number];

export const KC_FEEDBACK_ACTIONS = [
  'suggested',
  'viewed',
  'dismissed',
  'saved',
  'contact_verified',
  'draft_created',
  'approved',
  'sent',
  'form_submitted_manually',
  'replied',
  'declined',
  'accepted',
  'follow_up_due',
  'outcome_recorded',
] as const;

export type KcFeedbackAction = (typeof KC_FEEDBACK_ACTIONS)[number];

export type KcFreshnessBucket = 'fresh' | 'aging' | 'stale' | 'unknown';

export type KcContactIntelligenceFilters = {
  category?: string | null;
  area?: string | null;
  routeType?: KcRouteType | null;
  evidenceState?: KcContactEvidenceState | null;
  compensationAccessType?: KcCompensationAccessType | null;
  freshness?: KcFreshnessBucket | null;
  hasDirectEmail?: boolean | null;
  hasApplicationOrForm?: boolean | null;
  needsVerification?: boolean | null;
  contacted?: boolean | null;
  replied?: boolean | null;
  q?: string | null;
};

export type KcRecommendationCard = {
  id: string;
  organizationName: string;
  organizationId: string | null;
  category: string | null;
  area: string | null;
  whyFit: string;
  whyNow: string;
  routeType: KcRouteType;
  routeSummary: string;
  evidenceState: KcContactEvidenceState;
  evidenceSummary: string;
  lastVerifiedAt: string | null;
  askType: KcAskType;
  askSummary: string;
  valueToOrg: string;
  contentConcept: string;
  mediaKitVariant: string | null;
  mediaKitId: string | null;
  weaknesses: string[];
  nextAction: string;
  nextActionHref: string | null;
  contactId: string | null;
  programId: string | null;
  opportunityId: string | null;
  compensationAccessType: KcCompensationAccessType;
  freshness: KcFreshnessBucket;
  hasDirectEmail: boolean;
  hasApplicationOrForm: boolean;
  needsVerification: boolean;
  contacted: boolean;
  replied: boolean | null;
  followUpDueAt: string | null;
  changedAt: string | null;
};

export type KcFormPacketField = {
  fieldLabel: string;
  suggestedValue: string;
  notes: string | null;
};

export type KcContactBrief = {
  id: string;
  organizationName: string;
  organizationId: string | null;
  category: string | null;
  area: string | null;
  contactPersonOrTeam: string | null;
  role: string | null;
  email: string | null;
  phone: string | null;
  formUrl: string | null;
  applicationUrl: string | null;
  routeType: KcRouteType;
  evidenceState: KcContactEvidenceState;
  verifiedSourceUrl: string | null;
  lastCheckedAt: string | null;
  whyRouteAppropriate: string;
  whatToAskFor: string;
  whatNotToClaim: string[];
  suggestedSubjectLine: string | null;
  tailoredPitchDraft: string | null;
  mediaKitVariant: string | null;
  mediaKitId: string | null;
  mediaKitHref: string | null;
  supportingContentExamples: Array<{ label: string; href: string | null }>;
  applicationRequirements: string[];
  suggestedFollowUpDate: string | null;
  usageRightsOrDeliverableConcerns: string[];
  previousOutreachSummary: string | null;
  compensationAccessType: KcCompensationAccessType;
  /** Explicit: media access is not paid work and is not guaranteed. */
  mediaAccessDisclaimer: string | null;
  /** Affiliate facts only when explicitly published; else null. */
  affiliatePublished: {
    commission: string | null;
    cookieDuration: string | null;
    requirements: string | null;
    sourceUrl: string | null;
  } | null;
  formPacket: KcFormPacketField[] | null;
  pitchApprovalHref: string | null;
  formPacketHref: string | null;
  recommendationId: string | null;
  sendReady: boolean;
  needsVerification: boolean;
};

export type KcProgramRow = {
  id: string;
  organizationName: string;
  programName: string;
  programType: string;
  routeType: KcRouteType;
  evidenceState: KcContactEvidenceState;
  compensationAccessType: KcCompensationAccessType;
  applicationUrl: string | null;
  benefitSummary: string | null;
  requirementsSummary: string | null;
  lastVerifiedAt: string | null;
  needsVerification: boolean;
  contactId: string | null;
};

export type KcHubListResponse = {
  ok: true;
  /** PRIMARY: set false once real store is wired. */
  stub: boolean;
  view: KcHubView;
  recommendations: KcRecommendationCard[];
  contacts: KcRecommendationCard[];
  programs: KcProgramRow[];
  filtersApplied: KcContactIntelligenceFilters;
};

export type KcBriefResponse = {
  ok: true;
  stub: boolean;
  brief: KcContactBrief | null;
};

export type KcFeedbackResponse = {
  ok: true;
  stub: boolean;
  recorded: boolean;
  action: KcFeedbackAction;
};
