import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../db.js';
import { bensonChatMessages, bensonConversations } from '../../schema.js';
import { persistBensonConversationMessage } from '../conversations.js';
import type { AskBensonResponse } from '../types.js';
import { associateEvidence } from './associate.js';
import { classifyEvidence, shouldAttemptEvidenceOrchestration } from './classify.js';
import { executeSafeInternalActions, gateExternalAction } from './execute-safe.js';
import {
  buildResponseDelta,
  buildSuggestedActions,
  formatDeltaAnswer,
} from './format-delta.js';
import { mutateDurableStateFromEvidence } from './mutate.js';
import type {
  AssociationResult,
  EvidenceOrchestrationRequest,
  EvidenceOrchestrationResult,
} from './types.js';

async function loadSoftEntityHints(
  creatorId: string,
  conversationId: string,
): Promise<{ softPartnershipId: string | null; softContentItemId: string | null }> {
  const [conversation] = await db
    .select({
      primaryPartnershipId: bensonConversations.primaryPartnershipId,
    })
    .from(bensonConversations)
    .where(
      and(eq(bensonConversations.id, conversationId), eq(bensonConversations.creatorId, creatorId)),
    )
    .limit(1);

  const [recent] = await db
    .select({
      outputJson: bensonChatMessages.outputJson,
      inputSnapshot: bensonChatMessages.inputSnapshot,
    })
    .from(bensonChatMessages)
    .where(
      and(
        eq(bensonChatMessages.conversationId, conversationId),
        eq(bensonChatMessages.creatorId, creatorId),
        eq(bensonChatMessages.role, 'assistant'),
      ),
    )
    .orderBy(desc(bensonChatMessages.createdAt))
    .limit(1);

  const output = (recent?.outputJson ?? {}) as Record<string, unknown>;
  const partnershipId =
    conversation?.primaryPartnershipId ??
    (typeof output.partnershipId === 'string' ? output.partnershipId : null);

  let contentItemId: string | null = null;
  const collection = output.collection as { items?: Array<{ contentItemId?: string }> } | undefined;
  if (collection?.items?.[0]?.contentItemId) {
    contentItemId = collection.items[0].contentItemId;
  }

  return {
    softPartnershipId: partnershipId,
    softContentItemId: contentItemId,
  };
}

function emptyResult(
  association: AssociationResult,
  partial?: Partial<EvidenceOrchestrationResult>,
): EvidenceOrchestrationResult {
  const responseDelta = buildResponseDelta({
    association,
    mutations: [],
    actions: [],
    blockers: [],
  });
  return {
    handled: true,
    evidence: [],
    association,
    mutations: [],
    safeActionsExecuted: [],
    blockers: [],
    responseDelta,
    answer: formatDeltaAnswer(responseDelta),
    suggestedActions: buildSuggestedActions({
      association,
      actions: [],
      blockers: [],
      draftId: null,
      contentItemId: null,
      partnershipId: null,
    }),
    usedData: ['evidenceOrchestration'],
    confidence: 60,
    contentItemId: null,
    partnershipId: null,
    draftId: null,
    evidenceOrchestration: {
      version: 1,
      association,
      mutations: [],
      safeActionsExecuted: [],
      blockers: [],
      responseDelta,
    },
    ...partial,
  };
}

export async function runEvidenceOrchestration(
  request: EvidenceOrchestrationRequest,
): Promise<EvidenceOrchestrationResult> {
  const evidence = classifyEvidence(request.message);
  if (evidence.length === 0) {
    return {
      ...emptyResult({ status: 'none', reason: 'No durable evidence signals in message' }),
      handled: false,
    };
  }

  const soft =
    request.softPartnershipId || request.softContentItemId
      ? {
          softPartnershipId: request.softPartnershipId ?? null,
          softContentItemId: request.softContentItemId ?? null,
        }
      : await loadSoftEntityHints(request.creatorId, request.conversationId);

  const association = await associateEvidence({
    message: request.message,
    evidence,
    softPartnershipId: soft.softPartnershipId,
    softContentItemId: soft.softContentItemId,
    contentItemIdHint: request.contentItemIdHint ?? null,
    allowCreate: true,
  });

  if (association.status === 'ambiguous') {
    const result = emptyResult(association, { evidence, confidence: 55 });
    result.suggestedActions = buildSuggestedActions({
      association,
      actions: [],
      blockers: [],
      draftId: null,
      contentItemId: null,
      partnershipId: null,
    });
    return result;
  }

  if (association.status === 'unrelated' || association.status === 'none') {
    return emptyResult(association, { evidence, confidence: 50 });
  }

  const mutateResult = await mutateDurableStateFromEvidence({
    message: request.message,
    conversationId: request.conversationId,
    evidence,
    association,
  });

  const { actions, blockers, draftId } = await executeSafeInternalActions({
    evidence,
    contentItemId: mutateResult.contentItemId,
    mutations: mutateResult.mutations,
    draftMode: request.draftMode ?? 'auto',
  });

  // Ensure decorative send/submit strings cannot look executable
  for (const decoy of ['Draft a pitch', 'Send email', 'Submit form']) {
    const gated = gateExternalAction(decoy);
    if (gated && gated.type !== 'send_email') {
      /* send already recorded */
    }
  }

  const responseDelta = buildResponseDelta({
    association,
    mutations: mutateResult.mutations,
    actions,
    blockers,
  });

  const answer = formatDeltaAnswer(responseDelta);
  const suggestedActions = buildSuggestedActions({
    association,
    actions,
    blockers,
    draftId,
    contentItemId: mutateResult.contentItemId,
    partnershipId: mutateResult.partnershipId,
  });

  return {
    handled: true,
    evidence,
    association,
    mutations: mutateResult.mutations,
    safeActionsExecuted: actions,
    blockers,
    responseDelta,
    answer,
    suggestedActions,
    usedData: ['evidenceOrchestration', 'durableState', 'safeInternalActions'],
    confidence: Math.round(association.confidence * 100),
    contentItemId: mutateResult.contentItemId,
    partnershipId: mutateResult.partnershipId,
    draftId,
    evidenceOrchestration: {
      version: 1,
      association,
      mutations: mutateResult.mutations,
      safeActionsExecuted: actions,
      blockers,
      responseDelta,
    },
  };
}

export async function tryEvidenceOrchestration(input: {
  message: string;
  conversationId: string;
  creatorId: string;
  pageContext?: string | null;
  contentItemIdHint?: string | null;
  draftMode?: 'auto' | 'template_only' | 'none';
}): Promise<{ handled: false } | { handled: true; result: EvidenceOrchestrationResult; response: AskBensonResponse }> {
  if (!shouldAttemptEvidenceOrchestration(input.message)) {
    return { handled: false };
  }

  const result = await runEvidenceOrchestration({
    message: input.message,
    conversationId: input.conversationId,
    creatorId: input.creatorId,
    pageContext: input.pageContext,
    contentItemIdHint: input.contentItemIdHint,
    draftMode: input.draftMode,
  });

  if (!result.handled) return { handled: false };

  await persistBensonConversationMessage({
    creatorId: input.creatorId,
    conversationId: input.conversationId,
    role: 'user',
    message: input.message,
    primaryPartnershipId: result.partnershipId,
    inputSnapshot: {
      pageContext: input.pageContext ?? null,
      evidenceOrchestration: true,
      contentItemIdHint: input.contentItemIdHint ?? null,
    },
    output: {},
    tokenUsage: {},
    estimatedCost: 0,
  });

  const assistant = await persistBensonConversationMessage({
    creatorId: input.creatorId,
    conversationId: input.conversationId,
    role: 'assistant',
    message: result.answer,
    primaryPartnershipId: result.partnershipId,
    output: {
      answer: result.answer,
      evidence: result.evidence.map((e) => e.label),
      suggestedActions: result.suggestedActions,
      usedData: result.usedData,
      confidence: result.confidence,
      partnershipId: result.partnershipId ?? undefined,
      contentItemId: result.contentItemId ?? undefined,
      draftId: result.draftId ?? undefined,
      responseDelta: result.responseDelta,
      evidenceOrchestration: result.evidenceOrchestration,
      entityContext: result.partnershipId
        ? {
            associations: [
              {
                entityType: 'creator_partnership',
                entityId: result.partnershipId,
                role: 'primary',
                confidence: result.confidence / 100,
                source: 'evidence_orchestration',
              },
            ],
            resolvedAt: new Date().toISOString(),
          }
        : result.contentItemId
          ? {
              associations: [
                {
                  entityType: 'content_item',
                  entityId: result.contentItemId,
                  role: 'primary',
                  confidence: result.confidence / 100,
                  source: 'evidence_orchestration',
                },
              ],
              resolvedAt: new Date().toISOString(),
            }
          : undefined,
    },
    tokenUsage: {},
    estimatedCost: 0,
  });

  return {
    handled: true,
    result,
    response: {
      ok: true,
      answer: result.answer,
      evidence: result.evidence.map((e) => e.label),
      suggestedActions: result.suggestedActions,
      usedData: result.usedData,
      confidence: result.confidence,
      conversationId: input.conversationId,
      messageId: assistant.id,
      cached: false,
      tokenUsage: null,
      estimatedCost: null,
    },
  };
}

export { shouldAttemptEvidenceOrchestration, classifyEvidence };
