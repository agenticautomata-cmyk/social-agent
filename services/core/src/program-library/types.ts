export const PROGRAM_LIBRARY_MODES = ['saved', 'activated', 'inactive'] as const;
export type ProgramLibraryMode = (typeof PROGRAM_LIBRARY_MODES)[number];

export const PROGRAM_TYPES = [
  'affiliate',
  'creator',
  'influencer',
  'referral',
  'ambassador',
  'other',
] as const;
export type ProgramType = (typeof PROGRAM_TYPES)[number];

export const PROGRAM_SCOPES = ['kc_local', 'regional', 'national'] as const;
export type ProgramScope = (typeof PROGRAM_SCOPES)[number];

/** Human-facing verification states — never expose raw authority enums in UI. */
export const VERIFICATION_DISPLAY_STATES = [
  'operator_supplied',
  'verified_official',
  'verified_network',
  'secondary_source',
  'secondary_source_consistent',
  'partial_unresolved',
  'needs_verification',
  'conflicting_information',
  'possibly_inactive',
] as const;
export type VerificationDisplayState = (typeof VERIFICATION_DISPLAY_STATES)[number];

export const FIELD_AUTHORITIES = [
  'operator_supplied',
  'official_brand',
  'affiliate_network',
  'official_help',
  'verified_contact',
  'secondary_source',
] as const;
export type FieldAuthority = (typeof FIELD_AUTHORITIES)[number];

export type FieldClaim = {
  value: string | null;
  authority: FieldAuthority;
  verificationState: VerificationDisplayState;
  sourceUrl?: string | null;
  observedAt?: string;
  verifiedAt?: string | null;
};

export type ProgramLibraryConflict = {
  field: string;
  claims: FieldClaim[];
};

export type ProgramLibraryPartialUnresolved = {
  field: string;
  component: string;
  note: string;
};

export type ProgramLibrarySupportingEvidence = {
  commissionBenefit?: FieldClaim | null;
  audienceBenefit?: FieldClaim | null;
};

export type ProgramLibraryPayload = {
  programName: string;
  brandName: string;
  canonicalIdentity: string;
  programType: ProgramType;
  scope: ProgramScope;
  commissionBenefit?: FieldClaim | null;
  audienceBenefit?: FieldClaim | null;
  affiliateNetwork?: FieldClaim | null;
  cookieWindow?: FieldClaim | null;
  eligibility?: FieldClaim | null;
  officialProgramUrl?: FieldClaim | null;
  applicationUrl?: FieldClaim | null;
  contactPath?: FieldClaim | null;
  notes?: string | null;
  locationNote?: string | null;
  evidenceUrls: string[];
  conflictingClaims: ProgramLibraryConflict[];
  supportingEvidence?: ProgramLibrarySupportingEvidence;
  partialUnresolved?: ProgramLibraryPartialUnresolved[];
  dateAdded: string;
  lastVerifiedAt?: string | null;
  verificationDisplayState: VerificationDisplayState;
  linkedPartnershipId?: string | null;
  activatedAt?: string | null;
  operatorSuppliedMasterList?: boolean;
};

export type ProgramLibraryView = {
  id: string;
  contentItemId: string;
  mode: ProgramLibraryMode;
  programName: string;
  brandName: string;
  canonicalIdentity: string;
  programType: ProgramType;
  scope: ProgramScope;
  commissionBenefit: string | null;
  audienceBenefit: string | null;
  affiliateNetwork: string | null;
  cookieWindow: string | null;
  eligibility: string | null;
  officialProgramUrl: string | null;
  applicationUrl: string | null;
  contactPath: string | null;
  notes: string | null;
  locationNote: string | null;
  evidenceUrls: string[];
  conflictingClaims: ProgramLibraryConflict[];
  supportingEvidence?: ProgramLibrarySupportingEvidence;
  partialUnresolved?: ProgramLibraryPartialUnresolved[];
  dateAdded: string;
  lastVerifiedAt: string | null;
  verificationDisplayState: VerificationDisplayState;
  linkedPartnershipId: string | null;
  activatedAt: string | null;
  partnershipHref: string | null;
  updatedAt: string;
};

export type SaveProgramLibraryInput = {
  programName: string;
  brandName: string;
  programType?: ProgramType;
  scope?: ProgramScope;
  commissionBenefit?: string | null;
  audienceBenefit?: string | null;
  affiliateNetwork?: string | null;
  cookieWindow?: string | null;
  eligibility?: string | null;
  officialProgramUrl?: string | null;
  applicationUrl?: string | null;
  contactPath?: string | null;
  notes?: string | null;
  locationNote?: string | null;
  evidenceUrls?: string[];
  sourceScreen?: string;
  /** When true, values are operator-supplied and must not be silently overwritten. */
  operatorSupplied?: boolean;
  operatorSuppliedMasterList?: boolean;
};

export type ProgramLibrarySaveResult = {
  programId: string;
  contentItemId: string;
  created: boolean;
  canonicalIdentity: string;
  changes: string[];
};

export type ProgramLibraryEnrichOptions = {
  testSearchWeb?: typeof import('../web-research/index.js').searchWeb;
  force?: boolean;
  /** @internal test hook */
  testSkipBudgetGate?: boolean;
  /** Override search telemetry caller (default: program_library.verify_missing_info). */
  caller?: string;
  process?: 'api' | 'worker';
  trigger?: string;
  /** When true, skip enrich.ts 7-day guard — auto-enrichment selector owns freshness. */
  skipRecentVerifyCheck?: boolean;
  /** Operator-authorized one-time verification — uses user search context, not background gate. */
  operatorAuthorized?: boolean;
};

export type ProgramLibraryListFilters = {
  scope?: ProgramScope | 'kc_local' | 'national';
  programType?: ProgramType;
  mode?: ProgramLibraryMode;
  needsVerification?: boolean;
  limit?: number;
};
