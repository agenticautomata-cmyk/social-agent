/**
 * Types for KC PR / Affiliate Directory workbook import (contact intelligence).
 * Workbook checked 2026-09-08 — confidence is imported evidence, not permanent verification.
 */

export const WORKBOOK_ID = 'kc-pr-affiliate-directory' as const;
export const WORKBOOK_CHECKED_DATE = '2026-09-08' as const;

export type WorkbookConfidence = 'High' | 'Medium' | 'Low' | 'unknown';

export type OutreachWorkbookRow = {
  establishment: string;
  category: string | null;
  area: string | null;
  contact: string | null;
  titleDesk: string | null;
  email: string | null;
  phone: string | null;
  routeType: string | null;
  bestUse: string | null;
  confidence: WorkbookConfidence;
  sourceUrl: string | null;
  notes: string | null;
  /** 1-based data row index within Outreach Directory (header = 0). */
  sheetRow: number;
};

export type ProgramWorkbookRow = {
  program: string;
  type: string | null;
  benefitPay: string | null;
  requirements: string | null;
  sourceUrl: string | null;
  howToUse: string | null;
  sheetRow: number;
};

export type WorkbookBundle = {
  meta: {
    workbookFileName: string;
    checkedDate: string;
    sheets: string[];
    sourceNote?: string;
  };
  outreach: OutreachWorkbookRow[];
  programs: ProgramWorkbookRow[];
};

/** Benson-facing channel concepts derived from Route Type. */
export type ContactChannelConcept =
  | 'named_decision_maker'
  | 'role_inbox'
  | 'general_inbox'
  | 'official_form'
  | 'affiliate_application'
  | 'phone'
  | 'named_person_needs_research'
  | 'unknown';

export type ProposedContactEvidenceState =
  | 'verified_named_decision_maker'
  | 'verified_role_inbox'
  | 'official_general_inbox'
  | 'official_contact_form'
  | 'inferred_unverified'
  | 'unknown';

export type ProgramIntelligenceKind =
  | 'affiliate'
  | 'creator_program'
  | 'influencer_network'
  | 'hosted_visit'
  | 'media_access'
  | 'consumer_rewards'
  | 'other';

export type ImportProvenanceV1 = {
  v: 1;
  workbookId: typeof WORKBOOK_ID;
  workbookFileName: string;
  checkedDate: string;
  sheet: 'Outreach Directory' | 'Programs';
  sheetRow: number;
  importKey: string;
  confidence: WorkbookConfidence;
  routeType?: string | null;
  bestUse?: string | null;
  geoArea?: string | null;
  sourceUrl?: string | null;
  workbookNotes?: string | null;
  channelConcept?: ContactChannelConcept;
  proposedEvidenceState?: ProposedContactEvidenceState;
  programKind?: ProgramIntelligenceKind;
  /** ISO timestamp of this import run. */
  importedAt: string;
  verificationMethod: 'workbook_import';
  /**
   * Workbook confidence is evidence of the claim quality at checkedDate —
   * not a permanent send-ready verification.
   */
  permanentVerification: false;
};

export type MatchBucket = 'equivalent' | 'incomplete' | 'conflicting' | 'new' | 'stale';

export type DbContactSnapshot = {
  id: string;
  businessName: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  contactEvidenceState: string;
  evidenceUrl: string | null;
  contactFormUrl: string | null;
  contactRole: string | null;
  notes: string | null;
  mergedIntoId: string | null;
  evidenceCapturedAt: Date | string | null;
  lastRecheckedAt: Date | string | null;
  verificationMethod: string | null;
};

export type OutreachMatch = {
  bucket: MatchBucket;
  row: OutreachWorkbookRow;
  orgKey: string;
  canonicalBusinessName: string;
  importKey: string;
  channelConcept: ContactChannelConcept;
  proposedEvidenceState: ProposedContactEvidenceState;
  dbContact: DbContactSnapshot | null;
  conflictNotes: string[];
};

export type ProgramMatch = {
  bucket: Exclude<MatchBucket, 'stale'>;
  row: ProgramWorkbookRow;
  importKey: string;
  programKind: ProgramIntelligenceKind;
  brandName: string;
  dbProgramId: string | null;
  conflictNotes: string[];
};
