import type { PartnershipMetadata } from '../creator-partnership/partnership-sources.js';
import type {
  FieldClaim,
  ProgramLibraryConflict,
  ProgramLibraryMode,
  ProgramLibraryPayload,
  VerificationDisplayState,
} from './types.js';
import { evaluateOperatorResearchConsistency } from './claim-comparison.js';

export const PROGRAM_LIBRARY_METADATA_KEY = 'programLibrary';

export type PartnershipProgramLibraryMetadata = PartnershipMetadata & {
  programLibraryMode?: ProgramLibraryMode;
  programLibraryQuiet?: boolean;
  programLibrarySkipAutoResearch?: boolean;
  programLibrary?: ProgramLibraryPayload;
  lastEnrichmentAttemptAt?: string;
  lastEnrichmentResult?: string;
  nextEligibleEnrichmentAt?: string;
};

export function readProgramLibraryMode(metadata: unknown): ProgramLibraryMode | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const m = metadata as PartnershipProgramLibraryMetadata;
  const mode = m.programLibraryMode;
  if (mode === 'saved' || mode === 'activated' || mode === 'inactive') return mode;
  if (m.programLibrary) return 'saved';
  return null;
}

export function isProgramLibraryPartnershipMetadata(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object') return false;
  const m = metadata as PartnershipProgramLibraryMetadata;
  return Boolean(m.programLibrary) || readProgramLibraryMode(metadata) != null;
}

export function readProgramLibraryPayload(metadata: unknown): ProgramLibraryPayload | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const m = metadata as PartnershipProgramLibraryMetadata;
  return m.programLibrary ?? null;
}

export function buildQuietContentItemMetadata(input: {
  programLibraryMode: ProgramLibraryMode;
  brandName: string;
  programName: string;
}): Record<string, unknown> {
  return {
    opportunityCategory: 'program_library',
    opportunityType: 'program_library',
    ingest: 'program_library',
    programLibraryQuiet: true,
    quietLibraryOnly: true,
    programLibraryMode: input.programLibraryMode,
    libraryMode: 'quiet',
    homeEligible: false,
    partnership: {
      brandName: input.brandName,
      programName: input.programName,
    },
  };
}

export function claimValue(claim: FieldClaim | null | undefined): string | null {
  return claim?.value?.trim() || null;
}

export function summarizeVerificationState(
  payload: ProgramLibraryPayload,
): VerificationDisplayState {
  if (payload.conflictingClaims.length > 0) return 'conflicting_information';
  if (payload.partialUnresolved?.length) return 'partial_unresolved';

  const supporting = payload.supportingEvidence?.commissionBenefit ?? payload.supportingEvidence?.audienceBenefit;
  if (supporting && payload.commissionBenefit?.authority === 'operator_supplied') {
    const consistency = evaluateOperatorResearchConsistency(
      payload.commissionBenefit.value,
      supporting.value,
    );
    if (consistency.consistent && supporting.authority === 'secondary_source') {
      return 'secondary_source_consistent';
    }
  }

  const claims = [
    payload.commissionBenefit,
    payload.audienceBenefit,
    payload.officialProgramUrl,
    payload.applicationUrl,
    payload.affiliateNetwork,
  ].filter(Boolean) as FieldClaim[];
  if (claims.some((c) => c.verificationState === 'verified_official' && c.authority !== 'operator_supplied')) {
    return 'verified_official';
  }
  if (claims.some((c) => c.verificationState === 'verified_network' && c.authority !== 'operator_supplied')) {
    return 'verified_network';
  }
  if (claims.some((c) => c.verificationState === 'secondary_source')) return 'secondary_source';
  if (payload.operatorSuppliedMasterList) return 'operator_supplied';
  if (claims.some((c) => c.authority === 'operator_supplied')) return 'operator_supplied';
  return 'needs_verification';
}

export function mergeFieldClaim(input: {
  existing: FieldClaim | null | undefined;
  incoming: FieldClaim | null | undefined;
  field: string;
  conflicts: ProgramLibraryConflict[];
}): { claim: FieldClaim | null; conflictAdded: boolean; changed: boolean } {
  if (!input.incoming?.value?.trim()) {
    return { claim: input.existing ?? null, conflictAdded: false, changed: false };
  }
  const incoming = { ...input.incoming, value: input.incoming.value.trim() };
  if (!input.existing?.value?.trim()) {
    return { claim: incoming, conflictAdded: false, changed: true };
  }
  if (input.existing.value.trim() === incoming.value.trim()) {
    if (input.existing.authority === 'operator_supplied') {
      return { claim: input.existing, conflictAdded: false, changed: false };
    }
    const merged: FieldClaim = {
      ...input.existing,
      verificationState: pickHigherAuthorityState(input.existing, incoming),
      verifiedAt: incoming.verifiedAt ?? input.existing.verifiedAt ?? null,
      sourceUrl: incoming.sourceUrl ?? input.existing.sourceUrl ?? null,
    };
    return {
      claim: merged,
      conflictAdded: false,
      changed: merged.verificationState !== input.existing.verificationState,
    };
  }

  if (input.existing.authority === 'operator_supplied' && incoming.authority !== 'operator_supplied') {
    const consistency = evaluateOperatorResearchConsistency(input.existing.value, incoming.value);
    if (consistency.consistent) {
      return { claim: input.existing, conflictAdded: false, changed: false };
    }
    const conflict: ProgramLibraryConflict = {
      field: input.field,
      claims: [input.existing, incoming],
    };
    const nextConflicts = [...input.conflicts.filter((c) => c.field !== input.field), conflict];
    input.conflicts.splice(0, input.conflicts.length, ...nextConflicts);
    return {
      claim: {
        ...incoming,
        verificationState: 'conflicting_information',
      },
      conflictAdded: true,
      changed: true,
    };
  }

  if (authorityRank(incoming.authority) >= authorityRank(input.existing.authority)) {
    return { claim: incoming, conflictAdded: false, changed: true };
  }
  return { claim: input.existing, conflictAdded: false, changed: false };
}

function authorityRank(authority: FieldClaim['authority']): number {
  switch (authority) {
    case 'official_brand':
      return 5;
    case 'affiliate_network':
      return 4;
    case 'official_help':
      return 3;
    case 'verified_contact':
      return 2;
    case 'secondary_source':
      return 1;
    default:
      return 0;
  }
}

function pickHigherAuthorityState(a: FieldClaim, b: FieldClaim): VerificationDisplayState {
  const winner = authorityRank(b.authority) >= authorityRank(a.authority) ? b : a;
  if (winner.authority === 'operator_supplied') return 'operator_supplied';
  return winner.verificationState;
}

export function operatorSuppliedClaim(value: string | null | undefined): FieldClaim | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return {
    value: trimmed,
    authority: 'operator_supplied',
    verificationState: 'operator_supplied',
    observedAt: new Date().toISOString(),
  };
}
