import type { FieldClaim, ProgramLibraryConflict, ProgramLibraryPayload } from './types.js';
import { operatorSuppliedClaim, summarizeVerificationState } from './metadata.js';
import { PROGRAM_LIBRARY_SEED_RECORDS } from './seed-data.js';

const MOCK_EVIDENCE_PATTERN = /(?:brand\.example\.com|\/\/x\.example\b|\.example\/)/i;

export function isMockProgramLibraryEnrichmentEvidence(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  return MOCK_EVIDENCE_PATTERN.test(url);
}

function claimUsesMockEvidence(claim: FieldClaim | null | undefined): boolean {
  if (!claim) return false;
  return isMockProgramLibraryEnrichmentEvidence(claim.sourceUrl);
}

function seedCommissionForBrand(brandName: string): string | null {
  const seed = PROGRAM_LIBRARY_SEED_RECORDS.find((r) => r.brandName === brandName);
  return seed?.commissionBenefit?.trim() || null;
}

/** Remove mock test enrichment residue; preserve operator-supplied claims. */
export function remediateMockProgramLibraryEnrichment(payload: ProgramLibraryPayload): {
  payload: ProgramLibraryPayload;
  changed: boolean;
  notes: string[];
} {
  const notes: string[] = [];
  let changed = false;
  let next: ProgramLibraryPayload = { ...payload };

  const hadMockEvidence =
    next.evidenceUrls.some(isMockProgramLibraryEnrichmentEvidence) ||
    claimUsesMockEvidence(next.commissionBenefit) ||
    claimUsesMockEvidence(next.officialProgramUrl) ||
    next.conflictingClaims.some((c) => c.claims.some(claimUsesMockEvidence));

  if (!hadMockEvidence) {
    return { payload, changed: false, notes };
  }

  const cleanedEvidence = next.evidenceUrls.filter((u) => !isMockProgramLibraryEnrichmentEvidence(u));
  if (cleanedEvidence.length !== next.evidenceUrls.length) {
    next.evidenceUrls = cleanedEvidence;
    changed = true;
    notes.push('Removed mock test evidence URL');
  }

  const cleanedConflicts: ProgramLibraryConflict[] = [];
  for (const conflict of next.conflictingClaims) {
    const claims = conflict.claims.filter((c) => !claimUsesMockEvidence(c));
    if (claims.length >= 2) {
      cleanedConflicts.push({ ...conflict, claims });
      if (claims.length !== conflict.claims.length) changed = true;
    } else if (claims.length !== conflict.claims.length) {
      changed = true;
    }
  }
  next.conflictingClaims = cleanedConflicts;

  const operatorFromConflict = cleanedConflicts
    .find((c) => c.field === 'commission/benefit')
    ?.claims.find((c) => c.authority === 'operator_supplied');

  if (operatorFromConflict?.value) {
    next.commissionBenefit = { ...operatorFromConflict };
    changed = true;
    notes.push('Restored operator-supplied commission from conflict history');
  } else if (claimUsesMockEvidence(next.commissionBenefit)) {
    const seedCommission = payload.operatorSuppliedMasterList
      ? seedCommissionForBrand(payload.brandName)
      : null;
    const priorOperator =
      payload.commissionBenefit?.authority === 'operator_supplied'
        ? payload.commissionBenefit
        : operatorSuppliedClaim(seedCommission);
    if (priorOperator) {
      next.commissionBenefit = priorOperator;
      changed = true;
      notes.push('Restored operator-supplied commission');
    } else {
      next.commissionBenefit = null;
      changed = true;
      notes.push('Removed mock commission claim');
    }
  }

  if (claimUsesMockEvidence(next.officialProgramUrl)) {
    next.officialProgramUrl = null;
    changed = true;
    notes.push('Removed mock official program URL');
  }

  if (changed) {
    next.lastVerifiedAt = null;
  }

  const pruned = next.conflictingClaims.filter((c) => c.claims.length >= 2);
  if (pruned.length !== next.conflictingClaims.length) {
    next.conflictingClaims = pruned;
    changed = true;
  }

  const nextState = summarizeVerificationState(next);
  if (nextState !== next.verificationDisplayState) {
    next.verificationDisplayState = nextState;
    changed = true;
    notes.push(`Verification state → ${next.verificationDisplayState}`);
  }

  return { payload: next, changed, notes };
}
