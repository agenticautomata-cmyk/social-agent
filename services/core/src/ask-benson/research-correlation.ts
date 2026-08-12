import {
  formatCompletedBriefAnswer,
  formatProvisionalBriefAnswer,
} from '../creator-partnership/decision-brief.js';
import type { PartnershipDecisionBrief } from '../creator-partnership/partnership-sources.js';
import {
  isResearchLeaseExpired,
  readPartnershipResearchAuthority,
  type PartnershipResearchAuthorityState,
} from '../creator-partnership/research-singleflight.js';
import {
  bindBensonAssistantResearchRun,
  clarifyBensonAssistantResearch,
  patchBensonAssistantMessageTerminal,
  type BensonEntityContext,
  type BensonTerminalMessagePatch,
  type BensonUiCard,
} from './conversations.js';

const TERMINAL_STATUSES = new Set(['complete', 'needs_verification', 'failed']);

export function isTerminalPartnershipResearchStatus(status: string | null | undefined): boolean {
  return Boolean(status && TERMINAL_STATUSES.has(status));
}

export function partnershipEntityContext(partnershipId: string): BensonEntityContext {
  return {
    associations: [
      {
        entityType: 'creator_partnership',
        entityId: partnershipId,
        role: 'primary',
        confidence: 1,
        source: 'ask_benson',
      },
    ],
    resolvedAt: new Date().toISOString(),
  };
}

export function buildBensonUiCardFromBrief(
  brief: PartnershipDecisionBrief | null | undefined,
): BensonUiCard | null {
  if (!brief) return null;
  return {
    type: 'decision_brief',
    headline: brief.headline,
    tier1: {
      phase: brief.phase,
      entities: brief.entities.slice(0, 3),
      localRelevance: brief.localRelevance,
      signal: brief.provisionalSignals[0] ?? null,
      gap: brief.knownGaps[0] ?? null,
      nextAction: brief.nextActions?.[0] ?? null,
      fitScore: brief.fitScore ?? null,
      researchStatus: brief.researchStatus,
      partnershipHref: brief.partnershipHref,
    },
    actions: (brief.nextActions ?? []).slice(0, 3).map((action) => ({
      label: action.action,
      why: action.why,
      href: action.href,
    })),
  };
}

export function terminalChatPatchFromAuthority(
  authority: PartnershipResearchAuthorityState,
): BensonTerminalMessagePatch | null {
  const status = authority.researchStatus;
  if (!isTerminalPartnershipResearchStatus(status)) return null;

  const metadata = authority.metadata ?? {};
  const brief =
    metadata.decisionBrief && typeof metadata.decisionBrief === 'object'
      ? (metadata.decisionBrief as PartnershipDecisionBrief)
      : null;

  if (status === 'failed') {
    const error =
      typeof authority.researchError === 'string' && authority.researchError.trim()
        ? authority.researchError.trim()
        : 'Research failed.';
    return {
      researchStatus: 'failed',
      decisionBrief: brief,
      uiCard: buildBensonUiCardFromBrief(brief),
      answer: `I couldn’t finish researching that opportunity. ${error}`,
      collection: {
        partnershipResearchStatus: 'failed',
        decisionBrief: brief,
      },
    };
  }

  const researchStatus = status === 'needs_verification' ? 'needs_verification' : 'complete';
  const formatted = brief
    ? formatCompletedBriefAnswer({ ...brief, researchStatus, phase: 'complete' })
    : null;

  return {
    researchStatus,
    decisionBrief: brief
      ? { ...brief, researchStatus, phase: 'complete', updatedAt: new Date().toISOString() }
      : null,
    uiCard: buildBensonUiCardFromBrief(
      brief ? { ...brief, researchStatus, phase: 'complete' } : null,
    ),
    answer: formatted?.answer,
    collection: {
      partnershipResearchStatus: researchStatus,
      decisionBrief: brief
        ? { ...brief, researchStatus, phase: 'complete', updatedAt: new Date().toISOString() }
        : null,
    },
  };
}

export function provisionalChatFieldsFromBrief(input: {
  partnershipId: string;
  researchStatus: string;
  decisionBrief: PartnershipDecisionBrief | null | undefined;
}): {
  partnershipId: string;
  researchStatus: string;
  decisionBrief: PartnershipDecisionBrief | null;
  uiCard: BensonUiCard | null;
  entityContext: BensonEntityContext;
  answer: string;
  evidence: string[];
  suggestedActions: string[];
} {
  const brief = input.decisionBrief ?? null;
  const formatted = brief
    ? isTerminalPartnershipResearchStatus(input.researchStatus) && brief.phase === 'complete'
      ? formatCompletedBriefAnswer(brief)
      : formatProvisionalBriefAnswer(brief)
    : {
        answer: `Captured opportunity candidate. Open /partnerships/${input.partnershipId}`,
        evidence: [] as string[],
        suggestedActions: [`Open Creator Partnership → /partnerships/${input.partnershipId}`],
      };

  return {
    partnershipId: input.partnershipId,
    researchStatus: input.researchStatus,
    decisionBrief: brief,
    uiCard: buildBensonUiCardFromBrief(brief),
    entityContext: partnershipEntityContext(input.partnershipId),
    answer: formatted.answer,
    evidence: formatted.evidence,
    suggestedActions: formatted.suggestedActions,
  };
}

async function clarifyAssistantResearchJoin(input: {
  creatorId: string;
  messageId: string;
  partnershipId: string;
  reason: 'unbound' | 'run_changed';
}): Promise<void> {
  const answer =
    input.reason === 'run_changed'
      ? 'That opportunity’s research cycle changed while I was attaching this message. Open the partnership or ask again to refresh.'
      : 'I couldn’t attach this message to an active research run. Open the partnership or ask again to refresh.';

  await clarifyBensonAssistantResearch({
    creatorId: input.creatorId,
    messageId: input.messageId,
    partnershipId: input.partnershipId,
    answer,
    reason: input.reason,
  });
}

/**
 * Race-safe join for a provisional assistant when claimPartnershipResearch
 * returns claimed:false. Never grants research ownership.
 */
/** Attach a provisional assistant to an already-terminal partnership (re-paste / resume). */
export async function catchUpAssistantToTerminalPartnership(input: {
  creatorId: string;
  messageId: string;
  partnershipId: string;
}): Promise<boolean> {
  const authority = await readPartnershipResearchAuthority(input.partnershipId);
  if (!authority?.researchRunId || !isTerminalPartnershipResearchStatus(authority.researchStatus)) {
    return false;
  }
  const bound = await bindBensonAssistantResearchRun({
    creatorId: input.creatorId,
    messageId: input.messageId,
    partnershipId: input.partnershipId,
    researchRunId: authority.researchRunId,
  });
  if (!bound) return false;
  const patch = terminalChatPatchFromAuthority(authority);
  if (!patch) return false;
  return patchBensonAssistantMessageTerminal({
    creatorId: input.creatorId,
    messageId: input.messageId,
    partnershipId: input.partnershipId,
    researchRunId: authority.researchRunId,
    patch,
  });
}

export async function joinActivePartnershipResearchForChat(input: {
  creatorId: string;
  messageId: string;
  partnershipId: string;
}): Promise<{ joined: boolean; researchRunId: string | null; caughtUp: boolean }> {
  const authority = await readPartnershipResearchAuthority(input.partnershipId);
  if (!authority?.researchRunId) {
    await clarifyAssistantResearchJoin({ ...input, reason: 'unbound' });
    return { joined: false, researchRunId: null, caughtUp: false };
  }

  const joinResearchRunId = authority.researchRunId;
  const activelyResearching =
    authority.researchStatus === 'researching' &&
    !isResearchLeaseExpired(authority.researchStartedAt);

  // Join path only attaches to a verified active lease. Already-terminal
  // partnerships are correlated in the Ask path before research launch.
  if (!activelyResearching) {
    await clarifyAssistantResearchJoin({ ...input, reason: 'unbound' });
    return { joined: false, researchRunId: joinResearchRunId, caughtUp: false };
  }

  const bound = await bindBensonAssistantResearchRun({
    creatorId: input.creatorId,
    messageId: input.messageId,
    partnershipId: input.partnershipId,
    researchRunId: joinResearchRunId,
  });
  if (!bound) {
    return { joined: false, researchRunId: joinResearchRunId, caughtUp: false };
  }

  const after = await readPartnershipResearchAuthority(input.partnershipId);
  if (!after?.researchRunId) {
    await clarifyAssistantResearchJoin({ ...input, reason: 'run_changed' });
    return { joined: false, researchRunId: joinResearchRunId, caughtUp: false };
  }

  if (after.researchRunId !== joinResearchRunId) {
    await clarifyAssistantResearchJoin({ ...input, reason: 'run_changed' });
    return { joined: false, researchRunId: joinResearchRunId, caughtUp: false };
  }

  if (
    after.researchStatus === 'researching' &&
    !isResearchLeaseExpired(after.researchStartedAt)
  ) {
    return { joined: true, researchRunId: joinResearchRunId, caughtUp: false };
  }

  if (isTerminalPartnershipResearchStatus(after.researchStatus)) {
    const patch = terminalChatPatchFromAuthority(after);
    if (patch) {
      await patchBensonAssistantMessageTerminal({
        creatorId: input.creatorId,
        messageId: input.messageId,
        partnershipId: input.partnershipId,
        researchRunId: joinResearchRunId,
        patch,
      });
    }
    return { joined: true, researchRunId: joinResearchRunId, caughtUp: true };
  }

  await clarifyAssistantResearchJoin({ ...input, reason: 'run_changed' });
  return { joined: false, researchRunId: joinResearchRunId, caughtUp: false };
}
