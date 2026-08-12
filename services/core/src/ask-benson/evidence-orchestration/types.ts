/**
 * Batch 1 evidence orchestration contract.
 * Evidence → associate → mutate durable state → safe internal action → delta response.
 */

export type EvidenceKind =
  | 'contact_email'
  | 'contact_phone'
  | 'official_intake_form_url'
  | 'program_history'
  | 'rewards_program'
  | 'pitch_context'
  | 'verified_fact'
  | 'generic_note';

export type EvidenceItem = {
  kind: EvidenceKind;
  value: string;
  normalizedKey: string;
  label: string;
  confidence: number;
};

export type EvidenceProvenance = {
  conversationId: string;
  capturedAt: string;
  operatorSource: 'user_supplied';
  messageExcerptHash: string;
  sourceScreen: 'ask_benson';
};

/** Ledger entry stored in content_items.metadata / creator_partnerships.metadata JSONB. */
export type BensonEvidenceLedgerEntry = {
  id: string;
  kind: EvidenceKind;
  value: string;
  normalizedKey: string;
  label: string;
  provenance: EvidenceProvenance;
  associatedEntityType: string;
  associatedEntityId: string;
  /** Batch 4 hook: supersession leaves history intact. */
  supersededBy: string | null;
  createdAt: string;
};

/** Batch 4 contact-path hook — persist only; ranking/supersession deferred. */
export type ContactPathEvidenceHook = {
  kind: 'official_form' | 'email' | 'phone' | 'other';
  value: string;
  normalizedKey: string;
  provenance: EvidenceProvenance;
  preferredCandidate: boolean;
  supersededBy: string | null;
  createdAt: string;
};

export type AssociationCandidate = {
  entityType: 'content_item' | 'partnership' | 'sponsor_contact';
  entityId: string;
  contentItemId: string | null;
  partnershipId: string | null;
  sponsorContactId: string | null;
  label: string;
  confidence: number;
  matchReason: string;
};

export type AssociationResult =
  | {
      status: 'resolved';
      entityType: AssociationCandidate['entityType'];
      entityId: string;
      contentItemId: string | null;
      partnershipId: string | null;
      sponsorContactId: string | null;
      label: string;
      confidence: number;
      matchReason: string;
      createdOpportunity?: boolean;
    }
  | {
      status: 'ambiguous';
      candidates: AssociationCandidate[];
      reason: string;
    }
  | {
      status: 'unrelated';
      reason: string;
      softContextEntityId?: string | null;
    }
  | {
      status: 'none';
      reason: string;
    };

export type MutationRecord = {
  type:
    | 'persist_evidence'
    | 'update_verified_fact'
    | 'update_contact'
    | 'reconcile_stale_fact'
    | 'create_opportunity'
    | 'advance_lifecycle'
    | 'contact_path_hook';
  entityType: string;
  entityId: string;
  summary: string;
  idempotentHit?: boolean;
};

export type SafeActionType =
  | 'persist_evidence'
  | 'update_verified_fact'
  | 'create_pitch_draft'
  | 'update_pitch_draft'
  | 'create_follow_up'
  | 'advance_lifecycle'
  | 'send_email'
  | 'submit_form'
  | 'publish';

export type SafeActionRecord = {
  type: SafeActionType;
  status: 'executed' | 'skipped_idempotent' | 'blocked' | 'failed' | 'requires_approval';
  summary: string;
  draftId?: string | null;
  error?: string | null;
};

export type EvidenceBlocker = {
  code: string;
  message: string;
};

export type ResponseDelta = {
  whatIDid: string[];
  stillNeeded: string[];
  next: string[];
};

export type EvidenceOrchestrationResult = {
  handled: boolean;
  evidence: EvidenceItem[];
  association: AssociationResult;
  mutations: MutationRecord[];
  safeActionsExecuted: SafeActionRecord[];
  blockers: EvidenceBlocker[];
  responseDelta: ResponseDelta;
  answer: string;
  suggestedActions: string[];
  usedData: string[];
  confidence: number;
  contentItemId: string | null;
  partnershipId: string | null;
  draftId: string | null;
  evidenceOrchestration: {
    version: 1;
    association: AssociationResult;
    mutations: MutationRecord[];
    safeActionsExecuted: SafeActionRecord[];
    blockers: EvidenceBlocker[];
    responseDelta: ResponseDelta;
  };
};

export type EvidenceOrchestrationRequest = {
  message: string;
  conversationId: string;
  creatorId: string;
  pageContext?: string | null;
  contentItemIdHint?: string | null;
  softPartnershipId?: string | null;
  softContentItemId?: string | null;
  /** Injected for tests / smoke without paid LLM drafting. */
  draftMode?: 'auto' | 'template_only' | 'none';
};
