import { createHash } from 'node:crypto';
import type {
  BensonEvidenceLedgerEntry,
  ContactPathEvidenceHook,
  EvidenceItem,
  EvidenceProvenance,
} from './types.js';

const LEDGER_KEY = 'bensonEvidenceLedger';
const CONTACT_PATH_KEY = 'contactPathEvidence';

export function readEvidenceLedger(metadata: Record<string, unknown> | null | undefined): BensonEvidenceLedgerEntry[] {
  const raw = metadata?.[LEDGER_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.filter((e): e is BensonEvidenceLedgerEntry => Boolean(e && typeof e === 'object'));
}

export function readContactPathEvidence(
  metadata: Record<string, unknown> | null | undefined,
): ContactPathEvidenceHook[] {
  const raw = metadata?.[CONTACT_PATH_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.filter((e): e is ContactPathEvidenceHook => Boolean(e && typeof e === 'object'));
}

export function buildProvenance(input: {
  conversationId: string;
  message: string;
}): EvidenceProvenance {
  return {
    conversationId: input.conversationId,
    capturedAt: new Date().toISOString(),
    operatorSource: 'user_supplied',
    messageExcerptHash: createHash('sha256').update(input.message.trim()).digest('hex').slice(0, 24),
    sourceScreen: 'ask_benson',
  };
}

export function appendEvidenceToLedger(input: {
  metadata: Record<string, unknown>;
  evidence: EvidenceItem[];
  provenance: EvidenceProvenance;
  entityType: string;
  entityId: string;
}): {
  metadata: Record<string, unknown>;
  added: BensonEvidenceLedgerEntry[];
  idempotentKeys: string[];
} {
  const ledger = readEvidenceLedger(input.metadata);
  const existingKeys = new Set(ledger.filter((e) => !e.supersededBy).map((e) => e.normalizedKey));
  const added: BensonEvidenceLedgerEntry[] = [];
  const idempotentKeys: string[] = [];

  for (const item of input.evidence) {
    if (existingKeys.has(item.normalizedKey)) {
      idempotentKeys.push(item.normalizedKey);
      continue;
    }
    const entry: BensonEvidenceLedgerEntry = {
      id: createHash('sha256')
        .update(`${item.normalizedKey}|${input.entityId}|${input.provenance.capturedAt}`)
        .digest('hex')
        .slice(0, 32),
      kind: item.kind,
      value: item.value,
      normalizedKey: item.normalizedKey,
      label: item.label,
      provenance: input.provenance,
      associatedEntityType: input.entityType,
      associatedEntityId: input.entityId,
      supersededBy: null,
      createdAt: input.provenance.capturedAt,
    };
    ledger.push(entry);
    existingKeys.add(item.normalizedKey);
    added.push(entry);
  }

  return {
    metadata: { ...input.metadata, [LEDGER_KEY]: ledger },
    added,
    idempotentKeys,
  };
}

/** Batch 4 hook: append contact-path evidence without ranking/supersession. */
export function appendContactPathHook(input: {
  metadata: Record<string, unknown>;
  evidence: EvidenceItem[];
  provenance: EvidenceProvenance;
}): {
  metadata: Record<string, unknown>;
  added: ContactPathEvidenceHook[];
  idempotentKeys: string[];
} {
  const list = readContactPathEvidence(input.metadata);
  const existingKeys = new Set(list.filter((e) => !e.supersededBy).map((e) => e.normalizedKey));
  const added: ContactPathEvidenceHook[] = [];
  const idempotentKeys: string[] = [];

  for (const item of input.evidence) {
    let kind: ContactPathEvidenceHook['kind'] | null = null;
    if (item.kind === 'official_intake_form_url') kind = 'official_form';
    else if (item.kind === 'contact_email') kind = 'email';
    else if (item.kind === 'contact_phone') kind = 'phone';
    if (!kind) continue;

    if (existingKeys.has(item.normalizedKey)) {
      idempotentKeys.push(item.normalizedKey);
      continue;
    }

    const hook: ContactPathEvidenceHook = {
      kind,
      value: item.value,
      normalizedKey: item.normalizedKey,
      provenance: input.provenance,
      preferredCandidate: kind === 'official_form' || kind === 'email',
      supersededBy: null,
      createdAt: input.provenance.capturedAt,
    };
    list.push(hook);
    existingKeys.add(item.normalizedKey);
    added.push(hook);
  }

  return {
    metadata: { ...input.metadata, [CONTACT_PATH_KEY]: list },
    added,
    idempotentKeys,
  };
}
