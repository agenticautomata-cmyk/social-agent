/**
 * Home Pitch Ready authority — label must reflect operational evidence, not promotion alone.
 */

import { evaluatePitchReadiness } from '../creator-agent/pitch-readiness.js';
import type { ContactVerificationStatus, PitchReadinessStatus } from '../creator-agent/types.js';
import { evaluateHomeCategoryGuard } from './home-category-guard.js';

export type HomePitchEvidence = {
  businessName: string;
  title?: string;
  category?: string | null;
  reason?: string | null;
  /** Canonical content / business id when known. */
  contentItemId?: string | null;
  contactVerificationStatus?: ContactVerificationStatus | null;
  hasPersonalizedDraft?: boolean;
  hasConcreteAngle?: boolean;
  hasDeliverableValueProp?: boolean;
  hasTimingReason?: boolean;
  sendMechanismAvailable?: boolean;
  suppressed?: boolean;
  stale?: boolean;
  duplicateUnresolvedOutreach?: boolean;
  /** Existing outreach row status when known. */
  outreachPitchReadinessStatus?: PitchReadinessStatus | null;
  creatorValueEligible?: boolean;
};

export type HomeStatusLabel =
  | 'Pitch ready'
  | 'Pitch draft ready'
  | 'Worth researching'
  | 'Possible sponsor'
  | 'Contact needed'
  | 'In pipeline'
  | 'Worth acting on'
  | 'Needs review';

export function homeStatusFromPitchReadiness(status: PitchReadinessStatus): HomeStatusLabel {
  switch (status) {
    case 'pitch_ready':
      return 'Pitch ready';
    case 'needs_contact':
      return 'Contact needed';
    case 'needs_angle':
      return 'Worth researching';
    case 'researching':
      return 'Worth researching';
    case 'lead_only':
      return 'Possible sponsor';
    case 'declined':
    case 'closed':
      return 'Needs review';
    default:
      return 'Worth researching';
  }
}

/**
 * Decide the operator-facing status for a Home money/best-move card.
 * Never collapses incomplete evidence into Pitch Ready.
 */
export function resolveHomePitchStatusLabel(evidence: HomePitchEvidence): {
  label: HomeStatusLabel;
  pitchReady: boolean;
  rejectionReason: string | null;
} {
  const guard = evaluateHomeCategoryGuard({
    title: evidence.title || evidence.businessName,
    category: evidence.category,
    reason: evidence.reason,
    businessName: evidence.businessName,
  });
  if (!guard.ok) {
    return { label: 'Needs review', pitchReady: false, rejectionReason: guard.reasonCode };
  }

  if (evidence.creatorValueEligible === false) {
    return { label: 'Needs review', pitchReady: false, rejectionReason: 'creator_value_ineligible' };
  }

  if (evidence.outreachPitchReadinessStatus) {
    const label = homeStatusFromPitchReadiness(evidence.outreachPitchReadinessStatus);
    return {
      label,
      pitchReady: evidence.outreachPitchReadinessStatus === 'pitch_ready',
      rejectionReason:
        evidence.outreachPitchReadinessStatus === 'pitch_ready' ? null : evidence.outreachPitchReadinessStatus,
    };
  }

  const contact = evidence.contactVerificationStatus ?? 'missing';
  const status = evaluatePitchReadiness({
    businessName: evidence.businessName,
    contactVerificationStatus: contact,
    hasPersonalizedDraft: evidence.hasPersonalizedDraft === true,
    hasConcreteAngle: evidence.hasConcreteAngle === true,
    hasDeliverableValueProp: evidence.hasDeliverableValueProp === true,
    hasTimingReason: evidence.hasTimingReason === true,
    sendMechanismAvailable: evidence.sendMechanismAvailable === true,
    suppressed: evidence.suppressed === true,
    stale: evidence.stale === true,
    duplicateUnresolvedOutreach: evidence.duplicateUnresolvedOutreach === true,
  });

  return {
    label: homeStatusFromPitchReadiness(status),
    pitchReady: status === 'pitch_ready',
    rejectionReason: status === 'pitch_ready' ? null : status,
  };
}
