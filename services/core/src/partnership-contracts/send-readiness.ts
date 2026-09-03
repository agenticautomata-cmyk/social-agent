/**
 * Send-readiness gate.
 *
 * An opportunity is send-ready only if ALL of these hold:
 *   1. a verified contact evidence state,
 *   2. an explicit compensation state,
 *   3. real creator analytics resolved (never the fallback "over 5K followers"),
 *   4. a real media kit (not the 69-byte test PNG),
 *   5. an approved-by-Kellie record.
 *
 * Anything missing produces an honest blocked state that names the missing step. There
 * is no "mostly ready" — the previous system reported six pitches as `ready_for_review`
 * when all six were test fixtures on domains that cannot exist.
 *
 * Pure module. The same verdict is computed for the API payload, the UI and the
 * pre-send assertion.
 */

import {
  evaluateContactEvidence,
  type ContactEvidenceRecord,
  type ContactEvidenceVerdict,
} from './contact-evidence.js';
import {
  normalizeCompensationState,
  type CompensationState,
} from './compensation.js';

/** A media kit smaller than this cannot be a real one-page kit. The live test PNG is 69 bytes. */
export const MIN_REAL_MEDIA_KIT_BYTES = 8 * 1024;

export type SendReadinessBlockCode =
  | 'contact_evidence_unverified'
  | 'contact_evidence_form_only'
  | 'contact_recipient_blocked'
  | 'contact_wrong_business'
  | 'compensation_unknown'
  | 'analytics_unavailable'
  | 'analytics_stale'
  | 'media_kit_missing'
  | 'media_kit_test_artifact'
  | 'not_approved'
  | 'already_sent';

export type SendReadinessBlock = {
  code: SendReadinessBlockCode;
  /** Names the missing step in plain language, addressed to the operator. */
  message: string;
  /** What resolves it. Always actionable. */
  nextStep: string;
};

export type SendReadinessVerdict = {
  /** True only when an email may be sent right now. */
  sendReady: boolean;
  /**
   * True when the pitch is complete enough for Kellie to review and approve, even if
   * the delivery route is a form rather than email.
   */
  reviewReady: boolean;
  blocks: SendReadinessBlock[];
  /** Single honest state string for storage and display. */
  state:
    | 'send_ready'
    /** Everything is in place and the only outstanding step is Kellie's approval. */
    | 'review_ready'
    | 'review_ready_form_only'
    | 'blocked'
    | 'researching'
    | 'sent';
  /** One-line summary naming the first missing step. Null when send-ready. */
  summary: string | null;
  contactEvidence: ContactEvidenceVerdict;
  compensationState: CompensationState;
};

export type MediaKitReadiness = {
  id: string | null;
  name: string | null;
  fileSizeBytes: number | null;
  isTestArtifact: boolean;
  /** True for a kit generated from live analytics, as opposed to a bare upload. */
  isGenerated: boolean;
  webUrl: string | null;
};

export type AnalyticsReadiness = {
  /** True only when a live connector resolved a real follower count. */
  followersAvailable: boolean;
  followersCount: number | null;
  lastSyncedAt: string | null;
  /** True when the connector data is older than the staleness window. */
  stale: boolean;
};

export type ApprovalReadiness = {
  approvedAt: string | null;
  approvedBy: string | null;
  approvedContentHash: string | null;
  approvedRecipient: string | null;
};

export function evaluateSendReadiness(input: {
  contact: Partial<ContactEvidenceRecord> & { state?: ContactEvidenceRecord['state'] };
  businessName: string;
  contactNotes?: string | null;
  /** Null when the contact does not represent this business — see contactRepresentsBusiness. */
  contactBusinessMismatchReason?: string | null;
  compensationState: unknown;
  analytics: AnalyticsReadiness;
  mediaKit: MediaKitReadiness | null;
  approval: ApprovalReadiness;
  alreadySent?: boolean;
}): SendReadinessVerdict {
  const blocks: SendReadinessBlock[] = [];
  const contactEvidence = evaluateContactEvidence(
    input.contact,
    input.businessName,
    input.contactNotes ?? null,
  );
  const compensationState = normalizeCompensationState(input.compensationState);

  if (input.alreadySent) {
    return {
      sendReady: false,
      reviewReady: false,
      blocks: [
        {
          code: 'already_sent',
          message: 'This pitch has already been sent.',
          nextStep: 'Watch for a reply, or draft a follow-up once the wait period passes.',
        },
      ],
      state: 'sent',
      summary: 'Already sent.',
      contactEvidence,
      compensationState,
    };
  }

  // 1. Contact evidence.
  if (input.contactBusinessMismatchReason) {
    blocks.push({
      code: 'contact_wrong_business',
      message: input.contactBusinessMismatchReason,
      nextStep: `Find a contact that is published for ${input.businessName} specifically.`,
    });
  }
  if (contactEvidence.recipientSafety.blocked) {
    blocks.push({
      code: 'contact_recipient_blocked',
      message:
        contactEvidence.recipientSafety.summary ??
        'This recipient is blocked from outreach.',
      nextStep: 'Reject this draft. Nothing here can be sent.',
    });
  } else if (contactEvidence.state === 'unknown' || contactEvidence.state === 'inferred_unverified') {
    blocks.push({
      code: 'contact_evidence_unverified',
      message:
        contactEvidence.state === 'unknown'
          ? `No contact has been found for ${input.businessName} yet.`
          : `The contact on file for ${input.businessName} is not confirmed by an official source.`,
      nextStep: contactEvidence.nextPathDetail,
    });
  } else if (contactEvidence.state === 'official_contact_form') {
    blocks.push({
      code: 'contact_evidence_form_only',
      message: `${input.businessName} publishes an official form, not an email address.`,
      nextStep: contactEvidence.nextPathDetail,
    });
  } else if (!contactEvidence.emailSendAllowed) {
    blocks.push({
      code: 'contact_evidence_unverified',
      message: contactEvidence.blockers[0] ?? 'The contact cannot carry an email send.',
      nextStep: contactEvidence.nextPathDetail,
    });
  }

  // 2. Compensation.
  if (compensationState === 'unknown_requires_research') {
    blocks.push({
      code: 'compensation_unknown',
      message: 'No compensation state has been established for this opportunity.',
      nextStep:
        'Establish what the business offers (or what Benson should request) before the pitch goes out.',
    });
  }

  // 3. Real analytics. Never send a pitch that would fall back to a follower band.
  if (!input.analytics.followersAvailable || input.analytics.followersCount === null) {
    blocks.push({
      code: 'analytics_unavailable',
      message:
        'Live creator analytics did not resolve, so the pitch would have to describe Kellie\u2019s reach without a real number.',
      nextStep: 'Check the TikTok connector on the analytics page, then regenerate the pitch.',
    });
  } else if (input.analytics.stale) {
    blocks.push({
      code: 'analytics_stale',
      message: `Creator analytics last synced ${input.analytics.lastSyncedAt ?? 'an unknown time'} ago and are stale.`,
      nextStep: 'Let the analytics sync run, then regenerate the pitch with current numbers.',
    });
  }

  // 4. Real media kit.
  if (!input.mediaKit || !input.mediaKit.id) {
    blocks.push({
      code: 'media_kit_missing',
      message: 'No media kit is attached to this pitch.',
      nextStep: 'Generate or attach a real media kit before sending.',
    });
  } else if (
    input.mediaKit.isTestArtifact ||
    (!input.mediaKit.isGenerated &&
      input.mediaKit.fileSizeBytes !== null &&
      input.mediaKit.fileSizeBytes < MIN_REAL_MEDIA_KIT_BYTES)
  ) {
    blocks.push({
      code: 'media_kit_test_artifact',
      message: `The attached media kit ("${input.mediaKit.name ?? 'unnamed'}") is a test artifact, not a real kit.`,
      nextStep: 'Generate the real media kit from live analytics and attach that instead.',
    });
  }

  // 5. Approval by Kellie.
  if (!input.approval.approvedAt) {
    blocks.push({
      code: 'not_approved',
      message: 'Kellie has not approved this pitch.',
      nextStep: 'Review the exact recipient, subject and body on Pitches, then approve.',
    });
  }

  const nonApprovalBlocks = blocks.filter((b) => b.code !== 'not_approved');
  const formOnly =
    nonApprovalBlocks.length === 1 && nonApprovalBlocks[0]!.code === 'contact_evidence_form_only';

  const sendReady = blocks.length === 0;
  const reviewReady = nonApprovalBlocks.length === 0 || formOnly;

  // A pitch whose only outstanding step is Kellie's approval is ready for review, not
  // "researching". Collapsing that case into `researching` is what kept the headline
  // "Pitches ready" tile at zero: nothing ever reached a reviewable state.
  const state: SendReadinessVerdict['state'] = sendReady
    ? 'send_ready'
    : formOnly
      ? 'review_ready_form_only'
      : nonApprovalBlocks.length > 0
        ? 'blocked'
        : 'review_ready';

  return {
    sendReady,
    reviewReady,
    blocks,
    state,
    summary: blocks[0] ? `${blocks[0].message} ${blocks[0].nextStep}` : null,
    contactEvidence,
    compensationState,
  };
}

/**
 * Maps the send-readiness verdict onto the existing `outreach_emails.pitch_readiness_status`
 * vocabulary so surfaces that already read that column keep working.
 *
 * `ready_for_review` is used deliberately — it is the value the producer has always
 * written, and studio-pulse was querying a `pitch_ready` value that no row has ever had.
 */
export function pitchReadinessStatusFor(verdict: SendReadinessVerdict): string {
  switch (verdict.state) {
    case 'sent':
      return 'sent';
    case 'send_ready':
    case 'review_ready':
    case 'review_ready_form_only':
      return 'ready_for_review';
    case 'blocked': {
      const codes = new Set(verdict.blocks.map((b) => b.code));
      if (codes.has('contact_recipient_blocked')) return 'blocked_invalid_contact';
      if (codes.has('contact_evidence_unverified') || codes.has('contact_wrong_business')) {
        return 'needs_contact';
      }
      if (codes.has('contact_evidence_form_only')) return 'needs_contact';
      if (codes.has('compensation_unknown')) return 'needs_compensation';
      if (codes.has('media_kit_missing') || codes.has('media_kit_test_artifact')) {
        return 'needs_media_kit';
      }
      if (codes.has('analytics_unavailable') || codes.has('analytics_stale')) {
        return 'needs_analytics';
      }
      return 'lead_only';
    }
    default:
      return 'researching';
  }
}

/** Every readiness status the producer can write. Consumers must read from this list. */
export const PITCH_READINESS_STATUSES = [
  'researching',
  'lead_only',
  'needs_angle',
  'needs_contact',
  'needs_compensation',
  'needs_media_kit',
  'needs_analytics',
  'blocked_invalid_contact',
  'ready_for_review',
  'sent',
] as const;

export type PitchReadinessStatus = (typeof PITCH_READINESS_STATUSES)[number];

/**
 * The statuses that mean "Kellie can act on this now". studio-pulse and Home read this
 * rather than a hard-coded string, which is the fix for the tile that read 0 forever.
 */
export const ACTIONABLE_PITCH_READINESS_STATUSES: readonly PitchReadinessStatus[] = [
  'ready_for_review',
];
