/**
 * Email-approval queue eligibility.
 *
 * A row may appear on /email/approvals and may be approved/sent only when it is
 * a genuine email draft to an evidenced recipient. Form-only packets, contactless
 * rows, synthetics, and generic templates fail here even if the UI were bypassed.
 */

import { looksLikeInvalidBusinessEntity } from './quarantine.js';
import { looksLikeGenericTemplatePitch } from './generic-pitch.js';
import {
  evaluateRecipientSafety,
  looksLikeSyntheticFixture,
} from '../sponsor-outreach/recipient-safety.js';

const EMAIL_CAPABLE_EVIDENCE = new Set([
  'verified_named_decision_maker',
  'verified_role_inbox',
  'official_general_inbox',
]);

const FORM_ONLY_EVIDENCE = new Set(['official_contact_form']);

export type EmailApprovalEligibilityInput = {
  status: string;
  quarantineState?: string | null;
  businessName?: string | null;
  contactEmail?: string | null;
  contactNotes?: string | null;
  contactEvidenceState?: string | null;
  evidenceUrl?: string | null;
  compensationState?: string | null;
  pitchReadinessStatus?: string | null;
  subject?: string | null;
  body?: string | null;
  mediaKitId?: string | null;
  mediaKitKind?: string | null;
  mediaKitIsTestArtifact?: boolean | null;
  mediaKitCurrentVersionId?: string | null;
  mediaKitCurrentContentHash?: string | null;
};

export type EmailApprovalEligibility = {
  eligible: boolean;
  reasons: string[];
  formOnly: boolean;
};

function hasEmail(value: string | null | undefined): boolean {
  return Boolean(value?.trim() && value.includes('@'));
}

export function evaluateEmailApprovalEligibility(
  input: EmailApprovalEligibilityInput,
): EmailApprovalEligibility {
  const reasons: string[] = [];
  const evidence = (input.contactEvidenceState ?? '').trim();
  const formOnly = FORM_ONLY_EVIDENCE.has(evidence) && !hasEmail(input.contactEmail);

  if (input.status !== 'needs_approval' && input.status !== 'draft') {
    reasons.push('This record is not an open draft awaiting approval.');
  }
  if (input.quarantineState && input.quarantineState !== 'active') {
    reasons.push('This pitch is quarantined and is not in the email approval workflow.');
  }

  const entity = looksLikeInvalidBusinessEntity(input.businessName);
  if (entity.invalid) {
    reasons.push(entity.reason ?? 'The business identity is not a real named business.');
  }

  if (
    looksLikeSyntheticFixture({
      email: input.contactEmail,
      businessName: input.businessName,
      notes: input.contactNotes,
    })
  ) {
    reasons.push('Synthetic or test fixtures can never enter the live email queue.');
  }

  const safety = evaluateRecipientSafety({
    email: input.contactEmail,
    businessName: input.businessName,
    notes: input.contactNotes,
  });
  if (safety.blocked) {
    reasons.push(safety.summary ?? 'This recipient is blocked from outreach.');
  }

  if (!hasEmail(input.contactEmail)) {
    reasons.push('A missing email address is not send-ready. A contact-form URL is not an email address.');
  }

  if (formOnly) {
    reasons.push('Official contact-form opportunities belong in the form-packet workflow, not email send.');
  }

  if (evidence === 'inferred_unverified' || evidence === 'unknown' || !evidence) {
    reasons.push('Guessed or unknown contacts can never become send-ready.');
  } else if (hasEmail(input.contactEmail) && !EMAIL_CAPABLE_EVIDENCE.has(evidence) && !formOnly) {
    reasons.push(`Contact evidence "${evidence}" is not an evidenced email recipient.`);
  }

  if (looksLikeGenericTemplatePitch({ subject: input.subject, body: input.body })) {
    reasons.push('The draft is generic template copy, not a tailored pitch.');
  }

  if (
    !input.compensationState ||
    input.compensationState === 'unknown_requires_research'
  ) {
    reasons.push('Compensation has not been established from evidence.');
  }

  if (input.pitchReadinessStatus && input.pitchReadinessStatus !== 'ready_for_review') {
    reasons.push('Pitch readiness is not review-ready from persisted evidence.');
  }

  if (!input.mediaKitId) {
    reasons.push('No media kit is attached.');
  } else if (input.mediaKitIsTestArtifact) {
    reasons.push('Test-artifact media kits cannot be used for live pitches.');
  } else if (!input.mediaKitCurrentVersionId || !input.mediaKitCurrentContentHash) {
    reasons.push('The attached media kit has no immutable version/content hash.');
  }

  return {
    eligible: reasons.length === 0,
    reasons,
    formOnly,
  };
}

export function evaluateFormPacketEligibility(input: EmailApprovalEligibilityInput): {
  eligible: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  const evidence = (input.contactEvidenceState ?? '').trim();
  const entity = looksLikeInvalidBusinessEntity(input.businessName);

  if (input.quarantineState && input.quarantineState !== 'active') {
    reasons.push('Quarantined records are not in the form-packet workflow.');
  }
  if (!['needs_approval', 'draft'].includes(input.status)) {
    reasons.push('This record is not an open form packet.');
  }
  if (entity.invalid) {
    reasons.push(entity.reason ?? 'Not a real business.');
  }
  if (
    looksLikeSyntheticFixture({
      email: input.contactEmail,
      businessName: input.businessName,
      notes: input.contactNotes,
    })
  ) {
    reasons.push('Synthetic fixtures cannot be form packets.');
  }
  if (looksLikeGenericTemplatePitch({ subject: input.subject, body: input.body })) {
    reasons.push('Generic template copy is research, not a form packet.');
  }
  if (evidence !== 'official_contact_form') {
    reasons.push('Form packets require an official_contact_form evidence state.');
  }
  if (hasEmail(input.contactEmail)) {
    reasons.push('This contact has an email — it belongs in the email queue if otherwise eligible.');
  }
  if (!input.evidenceUrl?.trim()) {
    reasons.push('Form packets need a verified official form URL.');
  }

  return { eligible: reasons.length === 0, reasons };
}
