import type {
  AssociationResult,
  EvidenceBlocker,
  MutationRecord,
  ResponseDelta,
  SafeActionRecord,
} from './types.js';

/**
 * Suggested-action contract:
 * - Prefer executed internal operations ("Review draft") over decorative "Draft a pitch"
 * - External work must be labeled as requiring approval / suggestion
 */
export function buildSuggestedActions(input: {
  association: AssociationResult;
  actions: SafeActionRecord[];
  blockers: EvidenceBlocker[];
  draftId: string | null;
  contentItemId: string | null;
  partnershipId: string | null;
}): string[] {
  const out: string[] = [];

  if (input.association.status === 'ambiguous') {
    out.push('Clarify which business/opportunity this evidence belongs to');
    return out;
  }

  if (input.association.status === 'unrelated') {
    out.push('Name the opportunity this evidence should attach to');
    return out;
  }

  const draftAction = input.actions.find(
    (a) =>
      (a.type === 'create_pitch_draft' || a.type === 'update_pitch_draft') &&
      (a.status === 'executed' || a.status === 'skipped_idempotent'),
  );
  if (draftAction && input.draftId) {
    out.push('Review draft');
  } else if (input.blockers.some((b) => b.code === 'insufficient_for_draft')) {
    out.push('Suggestion (Benson cannot draft yet): supply a contact email or official intake URL');
  } else if (input.actions.some((a) => a.type === 'create_pitch_draft' && a.status === 'failed')) {
    out.push('Suggestion (draft failed): retry after checking opportunity contact fields');
  }

  if (input.partnershipId) {
    out.push(`Open partnership /partnerships/${input.partnershipId}`);
  } else if (input.contentItemId) {
    out.push(`Open opportunity /discoveries/${input.contentItemId}`);
  }

  if (input.actions.some((a) => a.status === 'requires_approval' && a.type === 'submit_form')) {
    out.push('Suggestion (requires approval): submit official influencer form when ready');
  }
  if (input.actions.some((a) => a.status === 'requires_approval' && a.type === 'send_email')) {
    out.push('Suggestion (requires approval): send pitch after review');
  }

  return out.slice(0, 6);
}

export function buildResponseDelta(input: {
  association: AssociationResult;
  mutations: MutationRecord[];
  actions: SafeActionRecord[];
  blockers: EvidenceBlocker[];
}): ResponseDelta {
  const whatIDid: string[] = [];
  const stillNeeded: string[] = [];
  const next: string[] = [];

  if (input.association.status === 'ambiguous') {
    return {
      whatIDid: ['Did not mutate — entity match is ambiguous'],
      stillNeeded: [input.association.reason],
      next: input.association.candidates.map((c) => `Chooser: ${c.label} (${c.matchReason})`),
    };
  }

  if (input.association.status === 'unrelated') {
    return {
      whatIDid: ['Did not attach evidence to the current conversation entity'],
      stillNeeded: [input.association.reason],
      next: ['Name the correct opportunity/business for this evidence'],
    };
  }

  if (input.association.status === 'none') {
    return {
      whatIDid: ['No durable mutation'],
      stillNeeded: [input.association.reason],
      next: ['Provide a business name or link tied to an existing opportunity'],
    };
  }

  for (const m of input.mutations) {
    if (m.idempotentHit) continue;
    whatIDid.push(m.summary);
  }
  for (const a of input.actions) {
    if (a.type === 'create_pitch_draft' && a.status === 'executed') {
      whatIDid.push('Created pitch draft');
    }
    if (a.type === 'update_pitch_draft' && (a.status === 'executed' || a.status === 'skipped_idempotent')) {
      if (!whatIDid.some((l) => /draft/i.test(l))) whatIDid.push('Draft updated');
    }
    if (a.status === 'failed') {
      stillNeeded.push(a.summary);
    }
  }

  if (whatIDid.length === 0) {
    whatIDid.push('No new durable changes (idempotent replay)');
  }

  for (const b of input.blockers) {
    if (b.code === 'insufficient_for_draft') {
      stillNeeded.push(b.message);
    } else if (b.code === 'draft_failed') {
      stillNeeded.push(b.message);
    }
  }

  const hasForm = input.actions.some((a) => a.type === 'submit_form');
  if (hasForm) {
    stillNeeded.push('Official form submit requires your approval (not auto-submitted)');
  }

  if (stillNeeded.length === 0) {
    stillNeeded.push('Current promotion details are optional, not blocking');
  }

  if (input.actions.some((a) => a.type === 'create_pitch_draft' || a.type === 'update_pitch_draft')) {
    next.push('Review draft');
  } else {
    next.push('Add missing contact path if you want a pitch draft');
  }
  next.push('Send/submit only after explicit approval');

  return { whatIDid, stillNeeded, next };
}

export function formatDeltaAnswer(delta: ResponseDelta): string {
  const lines = [
    'WHAT I DID',
    ...delta.whatIDid.map((l) => `- ${l}`),
    '',
    'STILL NEEDED',
    ...delta.stillNeeded.map((l) => `- ${l}`),
    '',
    'NEXT',
    ...delta.next.map((l) => `- ${l}`),
  ];
  return lines.join('\n');
}
