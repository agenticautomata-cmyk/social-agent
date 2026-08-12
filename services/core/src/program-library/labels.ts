import type { ProgramLibraryMode, ProgramScope, ProgramType, VerificationDisplayState } from './types.js';

/** Operator-facing product name — internal keys remain `programLibrary`. */
export const PROGRAM_LIBRARY_OPERATOR_TITLE = 'Affiliate & Creator Programs';

export const PROGRAM_LIBRARY_OPERATOR_SUBTITLE =
  'Affiliate, referral, influencer, and creator programs Kellie can join or activate.';

export function programTypeLabel(type: ProgramType): string {
  switch (type) {
    case 'affiliate':
      return 'Affiliate';
    case 'creator':
      return 'Creator';
    case 'influencer':
      return 'Influencer';
    case 'referral':
      return 'Referral';
    case 'ambassador':
      return 'Ambassador';
    default:
      return 'Program';
  }
}

export function programScopeLabel(scope: ProgramScope): string {
  switch (scope) {
    case 'kc_local':
      return 'KC Local';
    case 'regional':
      return 'Regional';
    case 'national':
      return 'National';
    default:
      return 'Unknown';
  }
}

export function programModeLabel(mode: ProgramLibraryMode): string {
  switch (mode) {
    case 'saved':
      return 'Saved';
    case 'activated':
      return 'Activated';
    case 'inactive':
      return 'Inactive';
    default:
      return 'Saved';
  }
}

export function verificationStateLabel(state: VerificationDisplayState): string {
  switch (state) {
    case 'operator_supplied':
      return 'Operator supplied';
    case 'verified_official':
      return 'Verified official';
    case 'verified_network':
      return 'Verified network';
    case 'secondary_source':
      return 'Secondary source';
    case 'secondary_source_consistent':
      return 'Secondary source · consistent with operator range';
    case 'partial_unresolved':
      return 'Partial match · unresolved component';
    case 'needs_verification':
      return 'Needs verification';
    case 'conflicting_information':
      return 'Conflicting information';
    case 'possibly_inactive':
      return 'Possibly inactive';
    default:
      return 'Needs verification';
  }
}

/** Filter chip labels for dashboard. */
export const PROGRAM_LIBRARY_FILTER_LABELS = {
  kc_local: 'KC Local',
  national: 'National',
  affiliate: 'Affiliate',
  creator_influencer: 'Creator / Influencer',
  referral: 'Referral',
  activated: 'Activated',
  needs_verification: 'Needs verification',
} as const;

/** Human-readable background enrichment status for Program Library cards/detail. */
export function backgroundEnrichmentStatusLabel(input: {
  lastEnrichmentAttemptAt?: string | null;
  lastEnrichmentResult?: string | null;
  nextEligibleEnrichmentAt?: string | null;
  lastVerifiedAt?: string | null;
  verificationDisplayState: VerificationDisplayState;
}): string | null {
  const now = Date.now();
  if (
    input.nextEligibleEnrichmentAt &&
    Date.parse(input.nextEligibleEnrichmentAt) > now &&
    (input.lastEnrichmentResult === 'no_result' || input.lastEnrichmentResult === 'failed')
  ) {
    return 'Check failed — retry later';
  }
  if (input.lastEnrichmentAttemptAt) {
    const checked = new Date(input.lastEnrichmentAttemptAt);
    if (!Number.isNaN(checked.getTime())) {
      return `Last checked ${checked.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
    }
  }
  if (
    input.verificationDisplayState === 'needs_verification' ||
    input.verificationDisplayState === 'operator_supplied'
  ) {
    return 'Verification queued';
  }
  return null;
}
