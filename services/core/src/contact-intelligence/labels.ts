/**
 * Operator-facing labels for Contacts & Programs.
 * Media access is never labeled as paid compensation.
 */

import type {
  KcAskType,
  KcCompensationAccessType,
  KcContactEvidenceState,
  KcFreshnessBucket,
  KcHubView,
  KcRouteType,
} from './types.js';

export const KC_HUB_VIEW_LABELS: Record<KcHubView, string> = {
  recommended_now: 'Recommended now',
  verified_contacts: 'Verified contacts',
  programs_applications: 'Programs and applications',
  needs_verification: 'Needs verification',
  follow_ups: 'Follow-ups',
  recently_changed: 'Recently changed',
};

export const KC_ROUTE_TYPE_LABELS: Record<KcRouteType, string> = {
  pr_named: 'PR contact',
  marketing_named: 'Marketing contact',
  role_inbox: 'Role inbox',
  general_inbox: 'General inbox',
  phone: 'Phone',
  official_form: 'Official form',
  creator_application: 'Creator application',
  affiliate_program: 'Affiliate program',
  media_access: 'Media access',
  hosted_visit: 'Hosted visit',
  partnership_page: 'Partnership page',
  monitor_only: 'Monitor only',
};

export const KC_EVIDENCE_STATE_LABELS: Record<KcContactEvidenceState, string> = {
  verified_named_contact: 'Verified named contact',
  verified_role_inbox: 'Verified role inbox',
  verified_official_form: 'Verified official form',
  verified_program: 'Verified program',
  official_general_route: 'Official general route',
  stale_needs_recheck: 'Stale — needs recheck',
  conflicting: 'Conflicting',
  inferred_unverified: 'Inferred — unverified',
  unknown: 'Unknown',
  blocked_or_removed: 'Blocked or removed',
};

export const KC_ASK_TYPE_LABELS: Record<KcAskType, string> = {
  paid_collaboration: 'Paid collaboration',
  hosted_stay: 'Hosted stay',
  complimentary_admission: 'Complimentary admission',
  meal_or_product_consideration: 'Meal or product consideration',
  affiliate_commission: 'Affiliate commission',
  event_credential: 'Event credential',
  interview_or_access: 'Interview or access',
  relationship_introduction: 'Relationship introduction',
  unknown: 'Unknown — do not invent',
};

export const KC_COMPENSATION_ACCESS_LABELS: Record<KcCompensationAccessType, string> = {
  paid: 'Paid',
  hosted: 'Hosted',
  complimentary_access: 'Complimentary access',
  product_consideration: 'Product consideration',
  affiliate: 'Affiliate',
  credential_only: 'Credential only',
  media_access_not_paid: 'Media access (not paid)',
  unknown: 'Unknown',
};

export const KC_FRESHNESS_LABELS: Record<KcFreshnessBucket, string> = {
  fresh: 'Fresh',
  aging: 'Aging',
  stale: 'Stale',
  unknown: 'Unknown freshness',
};

export const MEDIA_ACCESS_DEFAULT_DISCLAIMER =
  'Media access or credentials are not guaranteed and are not the same as paid work.';

export function askTypeIsPaid(ask: KcAskType): boolean {
  return ask === 'paid_collaboration';
}

export function compensationImpliesPaid(value: KcCompensationAccessType): boolean {
  return value === 'paid';
}

/** Refuse to label media-access routes as paid. */
export function normalizeCompensationForRoute(
  routeType: KcRouteType,
  compensation: KcCompensationAccessType,
): KcCompensationAccessType {
  if (routeType === 'media_access' && compensation === 'paid') {
    return 'media_access_not_paid';
  }
  return compensation;
}
