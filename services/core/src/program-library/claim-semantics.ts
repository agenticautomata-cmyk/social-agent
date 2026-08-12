import {
  evaluateOperatorResearchConsistency,
  unresolvedCompoundComponents,
} from './claim-comparison.js';
import { summarizeVerificationState, claimValue } from './metadata.js';
import type { FieldAuthority, FieldClaim, ProgramLibraryConflict, ProgramLibraryPayload } from './types.js';

function verificationStateForResolved(
  authority: FieldAuthority,
  urlResolved: boolean,
): FieldClaim['verificationState'] {
  if (authority === 'operator_supplied') return 'operator_supplied';
  if (!urlResolved) {
    if (authority === 'secondary_source') return 'secondary_source';
    return 'needs_verification';
  }
  if (authority === 'official_brand') return 'verified_official';
  if (authority === 'affiliate_network') return 'verified_network';
  if (authority === 'secondary_source') return 'secondary_source';
  return 'needs_verification';
}

function sanitizeOperatorClaim(claim: FieldClaim): FieldClaim {
  return { ...claim, verificationState: 'operator_supplied' };
}

function claimSourceUrl(claim: FieldClaim | null | undefined): string | null {
  if (!claim) return null;
  return claim.sourceUrl ?? (claim.value?.startsWith('http') ? claim.value : null);
}

export function isAuthoritativeResearchedClaim(
  claim: FieldClaim,
  urlResolved: boolean,
): boolean {
  if (claim.authority === 'operator_supplied') return true;
  if (claim.authority === 'secondary_source') return true;
  if (claim.authority === 'official_brand' || claim.authority === 'affiliate_network') {
    return urlResolved;
  }
  return Boolean(urlResolved);
}

function findCommissionClaims(payload: ProgramLibraryPayload): {
  operator: FieldClaim | null;
  researched: FieldClaim | null;
} {
  const conflict = payload.conflictingClaims.find((c) => c.field === 'commission/benefit');
  const operatorFromConflict = conflict?.claims.find((c) => c.authority === 'operator_supplied') ?? null;
  const researchedFromConflict =
    conflict?.claims.find((c) => c.authority !== 'operator_supplied') ?? null;

  const operator =
    operatorFromConflict ??
    (payload.commissionBenefit?.authority === 'operator_supplied' ? payload.commissionBenefit : null);
  const researched =
    researchedFromConflict ??
    (payload.commissionBenefit?.authority !== 'operator_supplied' ? payload.commissionBenefit : null) ??
    payload.supportingEvidence?.commissionBenefit ??
    null;

  return { operator, researched };
}

/** Recompute conflicts, supporting evidence, and display state from stored claims only. */
export function recomputeProgramLibraryClaimSemantics(
  payload: ProgramLibraryPayload,
  resolutionMap: Map<string, boolean>,
): { payload: ProgramLibraryPayload; changed: boolean; notes: string[] } {
  const notes: string[] = [];
  const before = JSON.stringify({
    commission: payload.commissionBenefit,
    conflicts: payload.conflictingClaims,
    supporting: payload.supportingEvidence,
    partial: payload.partialUnresolved,
    state: payload.verificationDisplayState,
  });

  let next: ProgramLibraryPayload = {
    ...payload,
    supportingEvidence: { ...(payload.supportingEvidence ?? {}) },
    partialUnresolved: [...(payload.partialUnresolved ?? [])],
    conflictingClaims: [...payload.conflictingClaims],
  };

  const { operator, researched } = findCommissionClaims(next);
  if (!operator?.value?.trim()) {
    next.verificationDisplayState = summarizeVerificationState(next);
    return { payload: next, changed: before !== JSON.stringify({ commission: next.commissionBenefit, conflicts: next.conflictingClaims, supporting: next.supportingEvidence, partial: next.partialUnresolved, state: next.verificationDisplayState }), notes };
  }

  next.commissionBenefit = sanitizeOperatorClaim(operator);
  next.partialUnresolved = (next.partialUnresolved ?? []).filter((p) => p.field !== 'commission/benefit');

  if (!researched?.value?.trim()) {
    next.conflictingClaims = next.conflictingClaims.filter((c) => c.field !== 'commission/benefit');
    next.verificationDisplayState = summarizeVerificationState(next);
    const changed = before !== JSON.stringify({ commission: next.commissionBenefit, conflicts: next.conflictingClaims, supporting: next.supportingEvidence, partial: next.partialUnresolved, state: next.verificationDisplayState });
    return { payload: next, changed, notes };
  }

  const researchedUrl = claimSourceUrl(researched);
  const urlResolved = researchedUrl ? (resolutionMap.get(researchedUrl) ?? false) : false;
  const normalizedResearched: FieldClaim = {
    ...researched,
    verificationState: verificationStateForResolved(researched.authority, urlResolved),
    verifiedAt: urlResolved ? researched.verifiedAt ?? new Date().toISOString() : null,
  };

  const authoritative = isAuthoritativeResearchedClaim(normalizedResearched, urlResolved);
  if (!authoritative) {
    next.supportingEvidence = {
      ...next.supportingEvidence,
      commissionBenefit: normalizedResearched,
    };
    next.conflictingClaims = next.conflictingClaims.filter((c) => c.field !== 'commission/benefit');
    notes.push('Retired failed-source commission from active authority');
    next.verificationDisplayState = summarizeVerificationState(next);
    const changed = before !== JSON.stringify({ commission: next.commissionBenefit, conflicts: next.conflictingClaims, supporting: next.supportingEvidence, partial: next.partialUnresolved, state: next.verificationDisplayState });
    return { payload: next, changed, notes };
  }

  const consistency = evaluateOperatorResearchConsistency(operator.value, normalizedResearched.value);
  const unresolved = unresolvedCompoundComponents(operator.value, normalizedResearched.value);

  if (consistency.consistent) {
    next.supportingEvidence = {
      ...next.supportingEvidence,
      commissionBenefit: normalizedResearched,
    };
    next.conflictingClaims = next.conflictingClaims.filter((c) => c.field !== 'commission/benefit');

    if (unresolved.length) {
      next.partialUnresolved = [
        ...(next.partialUnresolved ?? []),
        ...unresolved.map((component) => ({
          field: 'commission/benefit',
          component,
          note: 'Not confirmed in current official evidence',
        })),
      ];
      notes.push(`Partial match — unresolved: ${unresolved.join(', ')}`);
    } else if (consistency.reason === 'inside_operator_range' || consistency.reason === 'partial_percent_match') {
      notes.push('Secondary evidence consistent with operator range');
    }

    next.verificationDisplayState = summarizeVerificationState(next);
    const changed = before !== JSON.stringify({ commission: next.commissionBenefit, conflicts: next.conflictingClaims, supporting: next.supportingEvidence, partial: next.partialUnresolved, state: next.verificationDisplayState });
    return { payload: next, changed, notes };
  }

  const conflict: ProgramLibraryConflict = {
    field: 'commission/benefit',
    claims: [sanitizeOperatorClaim(operator), normalizedResearched],
  };
  next.conflictingClaims = [
    ...next.conflictingClaims.filter((c) => c.field !== 'commission/benefit'),
    conflict,
  ];
  next.commissionBenefit = { ...normalizedResearched, verificationState: 'conflicting_information' };
  next.supportingEvidence = {
    ...next.supportingEvidence,
    commissionBenefit: null,
  };
  notes.push('Commission conflict retained — outside operator range');

  next.verificationDisplayState = summarizeVerificationState(next);
  const changed = before !== JSON.stringify({ commission: next.commissionBenefit, conflicts: next.conflictingClaims, supporting: next.supportingEvidence, partial: next.partialUnresolved, state: next.verificationDisplayState });
  return { payload: next, changed, notes };
}

/** Merge semantics recompute after authority normalization. */
export function recomputeProgramLibraryVerification(
  payload: ProgramLibraryPayload,
  resolutionMap: Map<string, boolean>,
): { payload: ProgramLibraryPayload; changed: boolean; notes: string[] } {
  const semantics = recomputeProgramLibraryClaimSemantics(payload, resolutionMap);
  return semantics;
}

export function formatListCommissionBenefit(payload: ProgramLibraryPayload): string | null {
  return claimValue(payload.commissionBenefit);
}
