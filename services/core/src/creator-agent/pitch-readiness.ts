import type { ContactVerificationStatus, PitchReadinessStatus } from './types.js';

const PLACEHOLDER_EMAIL_RE =
  /^\[?email protected\]?$|^not specified$|^n\/a$|^-$|^—$/i;
const GENERIC_CS_RE =
  /\b(customer service|support@|info@|hello@|contact@|noreply@|no-reply@)\b/i;

export function normalizeCompanyName(name: string): string {
  return name
    .replace(/&#8217;|&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isPlaceholderEmail(email: string | null | undefined): boolean {
  if (!email?.trim()) return true;
  if (PLACEHOLDER_EMAIL_RE.test(email.trim())) return true;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return true;
  return false;
}

export function classifyContactVerification(input: {
  email?: string | null;
  phone?: string | null;
  contactName?: string | null;
  website?: string | null;
}): ContactVerificationStatus {
  if (isPlaceholderEmail(input.email)) {
    if (input.phone?.trim()) return 'phone_only';
    if (input.website?.trim()) return 'contact_form';
    return 'missing';
  }
  if (GENERIC_CS_RE.test(input.email!)) return 'generic_business_channel';
  if (!input.contactName?.trim() || /^not specified$/i.test(input.contactName)) {
    return 'found_unverified';
  }
  return 'found_unverified';
}

export function isVerifiedAppropriateContact(status: ContactVerificationStatus): boolean {
  return status === 'verified_appropriate';
}

export function evaluatePitchReadiness(input: {
  businessName: string;
  contactVerificationStatus: ContactVerificationStatus;
  hasPersonalizedDraft: boolean;
  hasConcreteAngle: boolean;
  hasDeliverableValueProp: boolean;
  hasTimingReason: boolean;
  sendMechanismAvailable: boolean;
  suppressed: boolean;
  stale: boolean;
  duplicateUnresolvedOutreach: boolean;
}): PitchReadinessStatus {
  if (input.suppressed) return 'declined';
  if (input.stale) return 'closed';
  if (input.duplicateUnresolvedOutreach) return 'researching';
  if (!normalizeCompanyName(input.businessName)) return 'lead_only';
  if (input.contactVerificationStatus === 'missing' || input.contactVerificationStatus === 'invalid') {
    return 'needs_contact';
  }
  if (!isVerifiedAppropriateContact(input.contactVerificationStatus)) return 'needs_contact';
  if (!input.hasConcreteAngle) return 'needs_angle';
  if (
    !input.hasPersonalizedDraft ||
    !input.hasDeliverableValueProp ||
    !input.hasTimingReason ||
    !input.sendMechanismAvailable
  ) {
    return 'researching';
  }
  return 'pitch_ready';
}

export function countPitchReadyOnly<T extends { pitchReadinessStatus?: PitchReadinessStatus | null }>(
  rows: T[],
): number {
  return rows.filter((row) => row.pitchReadinessStatus === 'pitch_ready').length;
}
