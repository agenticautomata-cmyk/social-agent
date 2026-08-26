import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../../db.js';
import { outreachEmails } from '../../schema.js';
import {
  createSponsorFromOpportunity,
} from '../../sponsor-outreach/contacts.js';
import { SponsorBusinessIdentityRejectedError } from '../../sponsor-outreach/entity-identity.js';
import { createBensonOutreachDraft } from '../../sponsor-outreach/outreach.js';
import { draftSponsorOutreachFromOpportunity } from '../../sponsor-outreach/benson-drafting/draft.js';
import { evidenceIsActionableForDraft } from './classify.js';
import type {
  EvidenceBlocker,
  EvidenceItem,
  MutationRecord,
  SafeActionRecord,
} from './types.js';

/** External / irreversible actions always require explicit approval — never auto-exec. */
export const APPROVAL_REQUIRED_ACTIONS = new Set([
  'send_email',
  'submit_form',
  'publish',
]);

export function gateExternalAction(action: string): SafeActionRecord | null {
  const normalized = action.trim().toLowerCase().replace(/\s+/g, '_');
  if (
    APPROVAL_REQUIRED_ACTIONS.has(normalized) ||
    /\b(send|submit|publish)\b/i.test(action)
  ) {
    return {
      type: normalized.includes('submit')
        ? 'submit_form'
        : normalized.includes('publish')
          ? 'publish'
          : 'send_email',
      status: 'requires_approval',
      summary: `External action "${action}" requires explicit user approval — not executed`,
    };
  }
  return null;
}

async function findExistingDraft(sponsorContactId: string): Promise<string | null> {
  const existing = await db
    .select({ id: outreachEmails.id })
    .from(outreachEmails)
    .where(
      and(
        eq(outreachEmails.sponsorContactId, sponsorContactId),
        inArray(outreachEmails.status, ['draft', 'needs_approval']),
      ),
    )
    .orderBy(desc(outreachEmails.updatedAt))
    .limit(1);
  return existing[0]?.id ?? null;
}

function buildTemplatePitch(input: {
  businessName: string;
  email: string | null;
  evidence: EvidenceItem[];
}): { subject: string; body: string } {
  const rewards = input.evidence.find((e) => e.kind === 'rewards_program')?.value;
  const history = input.evidence.find((e) => e.kind === 'program_history')?.value;
  const form = input.evidence.find((e) => e.kind === 'official_intake_form_url')?.value;
  const lines = [
    `Hi ${input.businessName} team,`,
    '',
    `I'm reaching out about a potential local creator partnership with ${input.businessName}.`,
  ];
  if (rewards) lines.push('', `Local program note: ${rewards}`);
  if (history) lines.push('', `Background: ${history}`);
  if (form) lines.push('', `Official intake path on file: ${form}`);
  lines.push(
    '',
    'Happy to share a short media kit and a simple proposed collaboration.',
    '',
    'Thanks,',
    'Kellie',
  );
  return {
    subject: `Creator partnership — ${input.businessName}`,
    body: lines.join('\n'),
  };
}

export async function executeSafeInternalActions(input: {
  evidence: EvidenceItem[];
  contentItemId: string | null;
  mutations: MutationRecord[];
  draftMode?: 'auto' | 'template_only' | 'none';
}): Promise<{
  actions: SafeActionRecord[];
  blockers: EvidenceBlocker[];
  draftId: string | null;
}> {
  const actions: SafeActionRecord[] = [];
  const blockers: EvidenceBlocker[] = [];
  let draftId: string | null = null;
  const draftMode = input.draftMode ?? 'auto';

  // Reflect persist/update mutations as executed safe actions
  for (const m of input.mutations) {
    if (m.type === 'persist_evidence') {
      actions.push({
        type: 'persist_evidence',
        status: m.idempotentHit ? 'skipped_idempotent' : 'executed',
        summary: m.summary,
      });
    }
    if (m.type === 'update_verified_fact' || m.type === 'update_contact') {
      actions.push({
        type: 'update_verified_fact',
        status: m.idempotentHit ? 'skipped_idempotent' : 'executed',
        summary: m.summary,
      });
    }
    if (m.type === 'advance_lifecycle') {
      actions.push({
        type: 'advance_lifecycle',
        status: 'executed',
        summary: m.summary,
      });
    }
  }

  // Never auto-send / auto-submit
  actions.push({
    type: 'send_email',
    status: 'requires_approval',
    summary: 'Send remains approval-gated — no email sent',
  });
  if (input.evidence.some((e) => e.kind === 'official_intake_form_url')) {
    actions.push({
      type: 'submit_form',
      status: 'requires_approval',
      summary: 'Official form recorded; form submit requires explicit approval',
    });
  }

  if (draftMode === 'none') {
    return { actions, blockers, draftId };
  }

  if (!input.contentItemId) {
    blockers.push({
      code: 'missing_content_item',
      message: 'No opportunity content item to draft against',
    });
    return { actions, blockers, draftId };
  }

  if (!evidenceIsActionableForDraft(input.evidence)) {
    blockers.push({
      code: 'insufficient_for_draft',
      message: 'Evidence persisted, but not yet actionable enough for an internal pitch draft',
    });
    return { actions, blockers, draftId };
  }

  try {
    const { contact } = await createSponsorFromOpportunity(input.contentItemId);
    const existing = await findExistingDraft(contact.id);
    if (existing) {
      draftId = existing;
      actions.push({
        type: 'update_pitch_draft',
        status: 'skipped_idempotent',
        summary: 'Draft already exists — reused (no duplicate)',
        draftId: existing,
      });
      return { actions, blockers, draftId };
    }

    if (draftMode === 'auto') {
      try {
        const llm = await draftSponsorOutreachFromOpportunity(input.contentItemId, {
          ignoreDailyCap: true,
        });
        if (llm.emailId) {
          draftId = llm.emailId;
          actions.push({
            type: llm.skipped === 'existing_draft' ? 'update_pitch_draft' : 'create_pitch_draft',
            status: llm.skipped === 'existing_draft' ? 'skipped_idempotent' : 'executed',
            summary: llm.skipped === 'existing_draft' ? 'Draft updated (existing)' : 'Draft created',
            draftId: llm.emailId,
          });
          return { actions, blockers, draftId };
        }
        if (llm.skipped && llm.skipped !== 'existing_draft') {
          // Fall through to template draft for safe internal artifact
        }
      } catch {
        // Fall through to template — avoid failing the orchestration on LLM errors
      }
    }

    const email = input.evidence.find((e) => e.kind === 'contact_email')?.value ?? contact.email;
    const template = buildTemplatePitch({
      businessName: contact.businessName,
      email,
      evidence: input.evidence,
    });
    const row = await createBensonOutreachDraft({
      sponsorContactId: contact.id,
      subject: template.subject,
      body: template.body,
      pitchReadinessStatus: email ? 'ready_for_review' : 'researching',
      bensonDraftContext: {
        kind: 'evidence_orchestration_template',
        contentItemId: input.contentItemId,
        contactEmail: email,
        source: 'ask_benson_evidence_orchestration',
      },
    });
    draftId = row.id;
    actions.push({
      type: 'create_pitch_draft',
      status: 'executed',
      summary: 'Draft created',
      draftId: row.id,
    });
  } catch (err) {
    if (err instanceof SponsorBusinessIdentityRejectedError) {
      blockers.push({
        code: 'sponsor_business_identity_rejected',
        message: `Not a defensible sponsor business (${err.reason})`,
      });
      return { actions, blockers, draftId };
    }
    const message = err instanceof Error ? err.message : 'draft_failed';
    actions.push({
      type: 'create_pitch_draft',
      status: 'failed',
      summary: `Internal draft failed: ${message}`,
      error: message,
    });
    blockers.push({ code: 'draft_failed', message });
  }

  return { actions, blockers, draftId };
}
