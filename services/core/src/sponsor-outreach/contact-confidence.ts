/**
 * Truthful contact-confidence model for sponsor_contacts.contactVerificationStatus.
 *
 * A raw email string or a person's name alone is not proof of a usable contact path — the
 * UI must never show a "has contact" badge unless there's an actual usable email, an
 * official form URL, a verified press/contact page, or a usable DM path. This maps the
 * existing free-text contactVerificationStatus values (see contacts.ts / pitch-readiness.ts)
 * to a small set of confidence tiers with copy that is safe to show a prospect.
 */

import { evaluateRecipientSafety } from './recipient-safety.js';

export type ContactConfidenceTier = 'high' | 'medium' | 'low' | 'none';

export type ContactConfidence = {
  tier: ContactConfidenceTier;
  label: string;
  /** Only true tiers may render a "has contact" style badge — see north-star spec. */
  usable: boolean;
};

const CONFIDENCE_BY_STATUS: Record<string, ContactConfidence> = {
  verified_appropriate: { tier: 'high', label: 'Verified contact', usable: true },
  verified_direct_email: { tier: 'high', label: 'Verified direct email', usable: true },
  verified_role_email: { tier: 'high', label: 'Verified role email', usable: true },
  official_contact_form: { tier: 'medium', label: 'Official contact form', usable: true },
  contact_form: { tier: 'medium', label: 'Official contact form', usable: true },
  official_press_page: { tier: 'medium', label: 'Official press page', usable: true },
  verified_social_dm_path: { tier: 'medium', label: 'Verified DM path', usable: true },
  generic_business_channel: { tier: 'low', label: 'Generic business contact', usable: true },
  generic_business_contact: { tier: 'low', label: 'Generic business contact', usable: true },
  found_unverified: { tier: 'low', label: 'Contact found — unverified', usable: false },
  likely_contact_unverified: { tier: 'low', label: 'Likely contact — unverified', usable: false },
  phone_only: { tier: 'low', label: 'Phone only — unverified', usable: false },
  stale: { tier: 'none', label: 'No verified media or PR contact found', usable: false },
  invalid: { tier: 'none', label: 'No verified media or PR contact found', usable: false },
  missing: { tier: 'none', label: 'No verified media or PR contact found', usable: false },
  no_contact_found: { tier: 'none', label: 'No verified media or PR contact found', usable: false },
};

const DEFAULT_CONFIDENCE: ContactConfidence = {
  tier: 'none',
  label: 'No verified media or PR contact found',
  usable: false,
};

/**
 * A stored verification status is a *claim*. When the address it describes is
 * structurally impossible (reserved TLD) or the row carries test-fixture markers,
 * the claim is false and must not be rendered as confidence. Every one of the nine
 * live rows marked `verified_direct_email` on 2026-08-10 was a smoke-test fixture on
 * a `.test`/`.example` domain; without this overlay they occupy every top-confidence
 * slot on Kellie's primary surface.
 */
const FIXTURE_CONFIDENCE: ContactConfidence = {
  tier: 'none',
  label: 'Test fixture — not a real business',
  usable: false,
};

const BLOCKED_CONFIDENCE: ContactConfidence = {
  tier: 'none',
  label: 'Blocked — wrong inbox for outreach',
  usable: false,
};

export function contactConfidenceForStatus(
  status: string | null | undefined,
  recipient?: { email?: string | null; businessName?: string | null; notes?: string | null },
): ContactConfidence {
  if (recipient) {
    const verdict = evaluateRecipientSafety(recipient);
    if (verdict.syntheticFixture) return FIXTURE_CONFIDENCE;
    if (verdict.blocks.some((b) => b.code === 'do_not_contact' || b.code === 'wrong_purpose_inbox')) {
      return BLOCKED_CONFIDENCE;
    }
  }
  if (!status) return DEFAULT_CONFIDENCE;
  return CONFIDENCE_BY_STATUS[status] ?? DEFAULT_CONFIDENCE;
}

/**
 * Prospect-safe copy for when no verified contact exists, per the north-star spec: never
 * silently omit contact info — always say what path (if any) is available.
 */
export function noContactFoundMessage(hasOfficialWebsite: boolean): string {
  return hasOfficialWebsite
    ? 'No verified media or PR contact found. Official website form available.'
    : 'No verified media or PR contact found.';
}
