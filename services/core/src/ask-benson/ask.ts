import OpenAI from 'openai';
import { and, desc, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db } from '../db.js';
import { bensonChatMessages, creatorAccounts } from '../schema.js';
import { env } from '../env.js';
import { buildCreatorStrategistProfile } from '../strategist/profile.js';
import { buildAskBensonSystemPrompt } from '../benson-personality/index.js';
import {
  ASK_BENSON_PROMPT_VERSION,
  ASK_BENSON_CACHE_MS,
  type AskBensonGroundedContext,
  type AskBensonRequest,
  type AskBensonResponse,
  type AskBensonStructuredAnswer,
  type AskBensonTokenUsage,
  type AskBensonCollectionResult,
} from './types.js';
import { buildAskBensonContext, buildCacheKey, normalizeAskMessage } from './context.js';
import { serializeAskBensonValue, toPostgresTimestamp } from './serialize-context.js';
import { loadDraftDiscussionContext, draftDiscussionPromptBlock } from '../draft-intelligence/discuss.js';
import { loadContentItemIdFromConversation } from '../creator-interest/context.js';
import { collectOpportunitiesFromImage } from './collect-from-image.js';
import {
  ASK_BENSON_IMAGE_INSPECT_INSTRUCTION,
  buildAskBensonVisionUserContent,
  resolveAskBensonFollowUpContentItemId,
  shouldUseImageListingShortCircuit,
} from './chat-images.js';
import { collectOpportunitiesFromLink, extractUrls } from './collect-from-link.js';
import {
  buildUrlIntakeFailureAnswer,
  isPlainUrlRequest,
} from './url-intake-pipeline.js';
import { resolveAskBensonProviderStatus } from './provider-status.js';
import { buildEvidenceFirstUrlAnswer, buildEvidenceFirstImageAnswer } from './url-intake-answer.js';
import { extractLocationScopeFromMessage } from './url-geo.js';
import {
  correctionUserMessage,
  detectOperatorCorrection,
  resolveCorrectionTarget,
} from './operator-correction.js';
import { collectOpportunitiesFromLookup } from './collect-from-lookup.js';
import { enrichRecentOpportunities } from './enrich-opportunities.js';
import { detectLookupQuery, isEnrichOpportunitiesRequest } from './intake-intents.js';
import {
  isCreatorPartnershipIntake,
  readPartnershipResearchAuthority,
  runPartnershipResearch,
  shouldOpenCreatorOpportunityPipeline,
  submitCreatorPartnership,
} from '../creator-partnership/index.js';
import {
  persistBensonConversationMessage,
} from './conversations.js';
import {
  buildBensonUiCardFromBrief,
  catchUpAssistantToTerminalPartnership,
  isTerminalPartnershipResearchStatus,
  partnershipEntityContext,
  provisionalChatFieldsFromBrief,
} from './research-correlation.js';
import { searchInventoryForChat } from './inventory-search.js';
import { detectConciergeQuery, researchConciergeWeb } from './concierge-research.js';
import { buildConciergePicks } from './concierge-picks.js';
import {
  persistConciergeSaveAssistantMessage,
  tryHandleConciergeSaveMessage,
} from './concierge-save-intent.js';
import { isAnalyticsConversation, isCasualGreeting } from './analytics-conversation.js';
import {
  applyPreferenceUpdates,
  detectPassedBusiness,
  detectPreferenceUpdates,
  recordPassedOpportunity,
  type PreferenceUpdate,
} from '../creator-preferences/index.js';
import { scoreContentItemIds } from '../opportunity-scoring/index.js';
import { tryAnswerStudioNavigation } from '../benson-navigation/index.js';
import { tryEvidenceOrchestration } from './evidence-orchestration/index.js';

const SYSTEM_PROMPT = buildAskBensonSystemPrompt();

const AnswerSchema = z.object({
  answer: z.string(),
  evidence: z.array(z.string()).default([]),
  suggestedActions: z.array(z.string()).default([]),
  usedData: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(100).default(70),
});

function parseStructuredAnswer(content: string): z.infer<typeof AnswerSchema> {
  try {
    return AnswerSchema.parse(JSON.parse(content));
  } catch (parseErr) {
    const answerMatch = content.match(
      /"answer"\s*:\s*"([\s\S]*?)"\s*,\s*"(?:evidence|suggestedActions|usedData|confidence)"/,
    );
    if (answerMatch?.[1]) {
      const answer = answerMatch[1]
        .replace(/\\n/g, '\n')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
      return {
        answer,
        evidence: [],
        suggestedActions: [],
        usedData: [],
        confidence: 70,
      };
    }
    throw new Error(`Failed to parse Ask Benson JSON: ${content.slice(0, 200)}`);
  }
}

const MODEL = env.BENSON_ASK_MODEL;
const DEEP_MODEL = env.BENSON_ASK_DEEP_MODEL;
const CHAT_TEMPERATURE = 0.58;
const DEEP_TEMPERATURE = 0.48;
const INPUT_COST_PER_M = 0.15;
const OUTPUT_COST_PER_M = 0.6;
const DEEP_INPUT_COST_PER_M = 2.5;
const DEEP_OUTPUT_COST_PER_M = 10;
const MAX_HISTORY_MESSAGES = 12;
const RECENT_PHRASING_MESSAGES = 5;

function estimateCost(usage: AskBensonTokenUsage): number {
  const inputRate =
    usage.model === DEEP_MODEL ? DEEP_INPUT_COST_PER_M : INPUT_COST_PER_M;
  const outputRate =
    usage.model === DEEP_MODEL ? DEEP_OUTPUT_COST_PER_M : OUTPUT_COST_PER_M;
  return (
    (usage.promptTokens / 1_000_000) * inputRate +
    (usage.completionTokens / 1_000_000) * outputRate
  );
}

async function loadConversationHistory(creatorId: string, conversationId: string) {
  const rows = await db
    .select({
      role: bensonChatMessages.role,
      message: bensonChatMessages.message,
    })
    .from(bensonChatMessages)
    .where(
      and(
        eq(bensonChatMessages.creatorId, creatorId),
        eq(bensonChatMessages.conversationId, conversationId),
      ),
    )
    .orderBy(desc(bensonChatMessages.createdAt))
    .limit(MAX_HISTORY_MESSAGES);

  return rows.reverse().map((row) => ({
    role: row.role as 'user' | 'assistant',
    content: row.message,
  }));
}

type CachedAskResponse = {
  messageId: string;
  answer: string;
  evidence: string[];
  suggestedActions: string[];
  usedData: string[];
  confidence: number;
  outputJson: Record<string, unknown>;
};

async function lookupCachedAskResponse(
  creatorId: string,
  cacheKey: string,
): Promise<CachedAskResponse | null> {
  const sinceIso = toPostgresTimestamp(new Date(Date.now() - ASK_BENSON_CACHE_MS));
  const rows = await db
    .select({
      id: bensonChatMessages.id,
      message: bensonChatMessages.message,
      outputJson: bensonChatMessages.outputJson,
    })
    .from(bensonChatMessages)
    .where(
      and(
        eq(bensonChatMessages.creatorId, creatorId),
        eq(bensonChatMessages.role, 'assistant'),
        sql`${bensonChatMessages.createdAt} >= ${sinceIso}::timestamptz`,
        sql`${bensonChatMessages.inputSnapshot}->>'cacheKey' = ${cacheKey}`,
      ),
    )
    .orderBy(desc(bensonChatMessages.createdAt))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const output = (row.outputJson ?? {}) as Record<string, unknown>;
  return {
    messageId: row.id,
    answer: row.message,
    evidence: Array.isArray(output.evidence) ? (output.evidence as string[]) : [],
    suggestedActions: Array.isArray(output.suggestedActions)
      ? (output.suggestedActions as string[])
      : [],
    usedData: Array.isArray(output.usedData) ? (output.usedData as string[]) : [],
    confidence: typeof output.confidence === 'number' ? output.confidence : 70,
    outputJson: output,
  };
}

async function loadRecentPhrasing(creatorId: string): Promise<string[]> {
  const rows = await db
    .select({ message: bensonChatMessages.message })
    .from(bensonChatMessages)
    .where(
      and(eq(bensonChatMessages.creatorId, creatorId), eq(bensonChatMessages.role, 'assistant')),
    )
    .orderBy(desc(bensonChatMessages.createdAt))
    .limit(RECENT_PHRASING_MESSAGES);

  return rows.map((row) => row.message.slice(0, 180)).filter(Boolean);
}

function sessionMentionedElliott(
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
): boolean {
  return history.some(
    (msg) => msg.role === 'assistant' && /\belliott\b/i.test(msg.content),
  );
}

function toCollectionResult(
  collected: Awaited<ReturnType<typeof collectOpportunitiesFromImage>> &
    Partial<{
      urlIntakeDiagnostics?: AskBensonCollectionResult['urlIntakeDiagnostics'];
      urlIntakeSummary?: AskBensonCollectionResult['urlIntakeSummary'];
    }>,
  source: AskBensonCollectionResult['source'],
  extras?: { sourceUrls?: string[]; lookupQuery?: string },
): AskBensonCollectionResult {
  const sourceUrls = extras?.sourceUrls;
  const providerStatus = resolveAskBensonProviderStatus({
    sourceUrls,
    diagnostics: collected.urlIntakeDiagnostics,
    complete:
      collected.extractedCount > 0 ||
      collected.created > 0 ||
      collected.updated > 0 ||
      collected.items.length > 0,
  });
  return {
    documentTitle: collected.documentTitle,
    extractedCount: collected.extractedCount,
    created: collected.created,
    updated: collected.updated,
    enrichmentsAttempted: collected.enrichmentsAttempted,
    webResearchAttempted: collected.webResearchAttempted,
    sourceProposalsCreated: collected.sourceProposalsCreated,
    scrapeSourcesRegistered: collected.scrapeSourcesRegistered,
    source,
    sourceUrls,
    lookupQuery: extras?.lookupQuery,
    urlIntakeDiagnostics: collected.urlIntakeDiagnostics,
    urlIntakeSummary: collected.urlIntakeSummary,
    providerStatus,
    items: collected.items,
  };
}

async function persistUrlIntakeAssistantMessage(input: {
  profile: { creatorId: string };
  conversationId: string;
  context: AskBensonGroundedContext;
  request: AskBensonRequest;
  contentItemId: string | null;
  imageHash: string | null;
  structured: AskBensonStructuredAnswer;
  collection: AskBensonCollectionResult | null;
  researchStatus?: string | null;
  researchRunId?: string | null;
}): Promise<string | null> {
  const partnershipId = input.collection?.partnershipId ?? null;
  const researchStatus =
    input.researchStatus ??
    input.collection?.partnershipResearchStatus ??
    (partnershipId ? 'provisional' : null);
  const entityContext = partnershipId ? partnershipEntityContext(partnershipId) : undefined;
  const message = await persistBensonConversationMessage({
    creatorId: input.profile.creatorId,
    conversationId: input.conversationId,
    role: 'assistant',
    message: input.structured.answer,
    primaryPartnershipId: partnershipId,
    inputSnapshot: {
      snapshotVersion: input.context.snapshotVersion,
      pageContext: input.request.pageContext ?? null,
      mediaKitId: input.request.mediaKitId ?? null,
      contentItemId: input.contentItemId ?? null,
      imageHash: input.imageHash,
      promptVersion: ASK_BENSON_PROMPT_VERSION,
      urlIntakeSkippedLlm: true,
    },
    output: serializeAskBensonValue({
      ...input.structured,
      collection: input.collection ?? null,
      partnershipId,
      researchRunId: input.researchRunId ?? null,
      researchStatus,
      decisionBrief: input.collection?.decisionBrief ?? null,
      uiCard: buildBensonUiCardFromBrief(input.collection?.decisionBrief ?? null),
      entityContext,
      providerStatus: input.collection?.providerStatus ?? null,
      updatedAt: new Date().toISOString(),
    }) as Record<string, unknown>,
    tokenUsage: {},
    estimatedCost: 0,
  });
  return message.id;
}

async function launchChatPartnershipResearch(input: {
  creatorId: string;
  partnershipId: string;
  originAssistantMessageId: string;
  researchStatus: string;
  /** When true, the assistant row was already persisted as terminal with researchRunId. */
  alreadyTerminalPersisted?: boolean;
}): Promise<void> {
  if (isTerminalPartnershipResearchStatus(input.researchStatus)) {
    if (input.alreadyTerminalPersisted) return;
    await catchUpAssistantToTerminalPartnership({
      creatorId: input.creatorId,
      messageId: input.originAssistantMessageId,
      partnershipId: input.partnershipId,
    });
    return;
  }

  void runPartnershipResearch(input.partnershipId, {
    trigger: 'ask_benson',
    originAssistantMessageId: input.originAssistantMessageId,
    creatorId: input.creatorId,
  }).catch((err) => {
    console.warn(
      '[ask-benson] partnership research failed:',
      err instanceof Error ? err.message : err,
    );
  });
}

function prepareContextForModel(input: {
  context: AskBensonGroundedContext;
  isGreeting: boolean;
  intakeMode: boolean;
  conciergeMode: boolean;
  liveResearchMode: boolean;
}): AskBensonGroundedContext {
  let ctx = input.context;

  if (input.isGreeting && ctx.latestPost && ctx.latestPost.hoursSincePost > 36) {
    ctx = { ...ctx, latestPost: null };
  }

  if (input.liveResearchMode) {
    ctx = {
      ...ctx,
      topOpportunities: [],
      inventorySearch: null,
      topVideos: [],
      growthTrend: [],
      engagementTrend: [],
      recentGrowth: [],
      strategistBriefing: null,
      latestProgressBrief: null,
      recentDeclines: [],
      underperformers: [],
    };
  } else if (input.intakeMode || input.conciergeMode) {
    ctx = {
      ...ctx,
      topOpportunities: input.intakeMode ? [] : ctx.topOpportunities,
      topVideos: [],
      growthTrend: [],
      engagementTrend: [],
      recentGrowth: [],
      strategistBriefing: null,
      latestProgressBrief: null,
      recentDeclines: [],
      underperformers: [],
    };
  }

  return ctx;
}

async function runOpenAiAsk(input: {
  context: AskBensonGroundedContext;
  message: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  sessionFlags: { elliottMentioned: boolean };
  analyticsConversation: boolean;
  isGreeting: boolean;
  intakeMode: boolean;
  conciergeMode: boolean;
  liveResearchMode: boolean;
  appliedPreferenceUpdates: PreferenceUpdate[];
  image?: AskBensonRequest['image'];
  collection?: AskBensonCollectionResult | null;
}): Promise<{
  structured: AskBensonStructuredAnswer;
  tokenUsage: AskBensonTokenUsage;
  estimatedCost: number;
}> {
  if (!env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required for Ask Benson');
  }

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const useDeepModel =
    env.BENSON_ASK_DEEP_MODEL_ENABLED &&
    input.analyticsConversation &&
    !input.image &&
    !input.intakeMode &&
    !input.conciergeMode;
  const model = useDeepModel ? DEEP_MODEL : MODEL;

  const contextForModel = prepareContextForModel({
    context: input.context,
    isGreeting: input.isGreeting,
    intakeMode: input.intakeMode,
    conciergeMode: input.conciergeMode,
    liveResearchMode: input.liveResearchMode,
  });

  const userPayload = {
    question: input.message,
    creatorData: serializeAskBensonValue(contextForModel),
    sessionFlags: input.sessionFlags,
    conversationMeta: {
      analyticsConversation: input.analyticsConversation,
      isGreeting: input.isGreeting,
      intakeMode: input.intakeMode,
      conciergeMode: input.conciergeMode,
      liveResearchMode: input.liveResearchMode,
      inventoryDiscoveryMode: input.conciergeMode && Boolean(contextForModel.inventorySearch),
      pipelineDegraded: contextForModel.pipelineHealth.isStale,
      turnNumber: input.history.length + 1,
      priorTurns: input.history.length,
      appliedPreferenceUpdates:
        input.appliedPreferenceUpdates.length > 0 ? input.appliedPreferenceUpdates : null,
    },
    attachedImage: input.image
      ? {
          originalFilename: input.image.originalFilename,
          mimeType: input.image.mimeType,
          fileSize: input.image.fileSize,
        }
      : null,
    collectedFromImage:
      input.collection?.source === 'image' ? input.collection : contextForModel.collectedFromImage ?? null,
    collectedFromLink:
      input.collection?.source === 'link' ? input.collection : contextForModel.collectedFromLink ?? null,
    collectedFromLookup:
      input.collection?.source === 'lookup' ? input.collection : null,
    collectedFromEnrichment:
      input.collection?.source === 'enrich' ? input.collection : null,
  };

  const userText = JSON.stringify(userPayload);
  const userContent: OpenAI.Chat.ChatCompletionUserMessageParam['content'] =
    buildAskBensonVisionUserContent({
      text: userText,
      imageDataUrl: input.image?.dataUrl ?? null,
    }) as OpenAI.Chat.ChatCompletionUserMessageParam['content'];

  const recordPrompt =
    typeof input.context.recordDiscussion?.discussionPrompt === 'string'
      ? input.context.recordDiscussion.discussionPrompt
      : null;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...(recordPrompt ? [{ role: 'system' as const, content: recordPrompt }] : []),
    ...input.history.map((h) => ({
      role: h.role,
      content: h.content,
    })),
    { role: 'user', content: userContent },
  ];

  const maxTokens = input.intakeMode
    ? 900
    : input.conciergeMode
      ? 950
      : input.analyticsConversation
        ? 1400
        : input.isGreeting
          ? 180
          : 700;

  const response = await client.chat.completions.create({
    model,
    temperature: input.analyticsConversation ? DEEP_TEMPERATURE : CHAT_TEMPERATURE,
    max_tokens: maxTokens,
    response_format: { type: 'json_object' },
    messages,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned empty Ask Benson response');

  const structured = parseStructuredAnswer(content);
  const tokenUsage: AskBensonTokenUsage = {
    promptTokens: response.usage?.prompt_tokens ?? 0,
    completionTokens: response.usage?.completion_tokens ?? 0,
    totalTokens: response.usage?.total_tokens ?? 0,
    model,
  };

  return { structured, tokenUsage, estimatedCost: estimateCost(tokenUsage) };
}

export async function askBenson(request: AskBensonRequest): Promise<AskBensonResponse> {
  const message = request.message?.trim();
  const image = request.image ?? null;
  if (!message && !image) {
    return {
      ok: false,
      answer: '',
      evidence: [],
      suggestedActions: [],
      usedData: [],
      confidence: 0,
      conversationId: request.conversationId ?? randomUUID(),
      messageId: null,
      cached: false,
      tokenUsage: null,
      estimatedCost: null,
      error: 'message or image is required',
    };
  }

  const historyMessage = message || (image ? '(image)' : '');
  const effectiveMessage = message || (image ? ASK_BENSON_IMAGE_INSPECT_INSTRUCTION : '');

  const conversationId = request.conversationId ?? randomUUID();

  // Program Library quiet save — before partnership URL research storm.
  if (message && !image) {
    try {
      const { tryProgramLibraryIntake } = await import('../program-library/intake.js');
      const pl = await tryProgramLibraryIntake({
        message: effectiveMessage,
        conversationId,
        sourceScreen: 'ask_benson',
      });
      if (pl.handled) {
        return pl.response;
      }
    } catch (err) {
      console.warn(
        '[ask-benson] program library intake failed; falling through:',
        err instanceof Error ? err.message : err,
      );
    }
  }

  // Batch 1: evidence → associate → durable mutate → safe internal action → delta.
  // Runs before partnership URL research / LLM paraphrase so operator-supplied
  // contact/form evidence becomes durable state instead of chat suggestions.
  if (message && !image) {
    try {
      const { resolveOperatorCreatorId } = await import('../tiktok-operator/resolve-creator.js');
      let orchCreatorId: string | null = null;
      try {
        orchCreatorId = await resolveOperatorCreatorId();
      } catch {
        const [fallback] = await db.select({ id: creatorAccounts.id }).from(creatorAccounts).limit(1);
        orchCreatorId = fallback?.id ?? null;
      }
      if (orchCreatorId) {
        const draftMode =
          process.env.BENSON_EVIDENCE_DRAFT_MODE === 'template_only'
            ? ('template_only' as const)
            : process.env.BENSON_EVIDENCE_DRAFT_MODE === 'none'
              ? ('none' as const)
              : ('auto' as const);
        const orch = await tryEvidenceOrchestration({
          message: effectiveMessage,
          conversationId,
          creatorId: orchCreatorId,
          pageContext: request.pageContext ?? null,
          contentItemIdHint: request.contentItemId ?? null,
          draftMode,
        });
        if (orch.handled) {
          return orch.response;
        }
      }
    } catch (err) {
      console.warn(
        '[ask-benson] evidence orchestration failed; falling through:',
        err instanceof Error ? err.message : err,
      );
    }
  }

  // Fast path: URL → creator-opportunity pipeline (provisional brief).
  // Runs BEFORE heavy strategist profile / context build so sync stays ~1–3s.
  if (env.PARTNERSHIP_URL_INTELLIGENCE && message && !image) {
    const fastUrls = extractUrls(message);
    if (fastUrls.length > 0) {
      const gate = shouldOpenCreatorOpportunityPipeline(message);
      if (gate.open) {
        try {
          const syncStarted = Date.now();
          // Must match conversation API ownership (resolveOperatorCreatorId), not an arbitrary first row.
          const { resolveOperatorCreatorId } = await import('../tiktok-operator/resolve-creator.js');
          let lightCreatorId: string | null = null;
          try {
            lightCreatorId = await resolveOperatorCreatorId();
          } catch {
            const [fallback] = await db.select({ id: creatorAccounts.id }).from(creatorAccounts).limit(1);
            lightCreatorId = fallback?.id ?? null;
          }
          if (!lightCreatorId) {
            return {
              ok: false,
              answer: '',
              evidence: [],
              suggestedActions: [],
              usedData: [],
              confidence: 0,
              conversationId,
              messageId: null,
              cached: false,
              tokenUsage: null,
              estimatedCost: null,
              error: 'No creator analytics account found',
            };
          }
          const lightAccount = { id: lightCreatorId };
          const submitted = await submitCreatorPartnership(
            {
              url: fastUrls[0],
              text: message,
              sourceScreen: 'ask_benson',
              initialIntakeRoute: gate.initialRoute ?? 'creator_partnership',
            },
            { skipResearch: true },
          );
          const authority = await readPartnershipResearchAuthority(submitted.partnershipId);
          const researchStatus = authority?.researchStatus ?? submitted.researchStatus;
          const alreadyTerminal = isTerminalPartnershipResearchStatus(researchStatus);
          const briefTitle =
            submitted.decisionBrief?.headline ?? fastUrls[0] ?? 'Creator partnership';
          const provisional = provisionalChatFieldsFromBrief({
            partnershipId: submitted.partnershipId,
            researchStatus: alreadyTerminal ? researchStatus : 'provisional',
            decisionBrief: submitted.decisionBrief,
          });
          const collection: AskBensonCollectionResult = {
            documentTitle: briefTitle,
            extractedCount: 1,
            created: submitted.duplicate ? 0 : 1,
            updated: submitted.duplicate ? 1 : 0,
            enrichmentsAttempted: 0,
            source: 'creator_partnership',
            intakeRoute: gate.initialRoute ?? 'creator_partnership',
            partnershipId: submitted.partnershipId,
            partnershipResearchStatus: provisional.researchStatus,
            decisionBrief: submitted.decisionBrief ?? null,
            providerStatus: resolveAskBensonProviderStatus({
              sourceUrls: fastUrls,
              diagnostics: [],
              complete: alreadyTerminal && researchStatus !== 'failed',
              terminal: researchStatus === 'failed',
            }),
            syncMs: Date.now() - syncStarted,
            items: [
              {
                contentItemId: submitted.contentItemId,
                title: briefTitle,
                location: null,
                eventStartsAt: null,
                relevanceScore: 0.7,
                urgencyScore: 0.5,
                outcome: submitted.duplicate ? 'updated' : 'created',
                sourceUrl: fastUrls[0] ?? null,
                partnershipId: submitted.partnershipId,
              },
            ],
          };
          const structured: AskBensonStructuredAnswer = {
            answer: provisional.answer,
            evidence: provisional.evidence,
            suggestedActions: provisional.suggestedActions,
            usedData: ['creatorPartnership', 'urlIntelligence', 'decisionBrief', 'fastPath'],
            confidence: 72,
          };
          const lightProfile = { creatorId: lightAccount.id };
          await persistBensonConversationMessage({
            creatorId: lightProfile.creatorId,
            conversationId,
            role: 'user',
            message: effectiveMessage,
            primaryPartnershipId: submitted.partnershipId,
            inputSnapshot: {
              pageContext: request.pageContext ?? null,
              pastedUrls: fastUrls,
              promptVersion: ASK_BENSON_PROMPT_VERSION,
              urlOpportunityFastPath: true,
              wallMs: Date.now() - syncStarted,
              entityContext: partnershipEntityContext(submitted.partnershipId),
            },
            output: {},
            tokenUsage: {},
            estimatedCost: 0,
          });
          const messageId = await persistUrlIntakeAssistantMessage({
            profile: lightProfile,
            conversationId,
            context: { snapshotVersion: 'url-opportunity-fast-path' } as AskBensonGroundedContext,
            request,
            contentItemId: submitted.contentItemId,
            imageHash: null,
            structured,
            collection,
            researchStatus: provisional.researchStatus,
            researchRunId: alreadyTerminal ? authority?.researchRunId ?? null : null,
          });
          if (messageId) {
            await launchChatPartnershipResearch({
              creatorId: lightProfile.creatorId,
              partnershipId: submitted.partnershipId,
              originAssistantMessageId: messageId,
              researchStatus,
              alreadyTerminalPersisted: alreadyTerminal && Boolean(authority?.researchRunId),
            });
          }
          return {
            ok: true,
            answer: structured.answer,
            evidence: structured.evidence,
            suggestedActions: structured.suggestedActions,
            usedData: structured.usedData,
            confidence: structured.confidence,
            conversationId,
            messageId,
            cached: false,
            tokenUsage: null,
            estimatedCost: null,
            collection,
          };
        } catch (err) {
          console.warn(
            '[ask-benson] URL opportunity fast path failed; falling through:',
            err instanceof Error ? err.message : err,
          );
        }
      }
    }
  }

  const profile = await buildCreatorStrategistProfile();
  if (!profile) {
    return {
      ok: false,
      answer: '',
      evidence: [],
      suggestedActions: [],
      usedData: [],
      confidence: 0,
      conversationId: request.conversationId ?? randomUUID(),
      messageId: null,
      cached: false,
      tokenUsage: null,
      estimatedCost: null,
      error: 'No creator analytics account found',
    };
  }

  if (
    message &&
    request.conversationId &&
    !image &&
    !extractUrls(message).length &&
    !detectLookupQuery(message) &&
    !isEnrichOpportunitiesRequest(message)
  ) {
    try {
      const saveHandled = await tryHandleConciergeSaveMessage({
        creatorId: profile.creatorId,
        conversationId: request.conversationId,
        message,
      });
      if (saveHandled) {
        const messageId = await persistConciergeSaveAssistantMessage({
          creatorId: profile.creatorId,
          conversationId: request.conversationId,
          userMessage: message,
          answer: saveHandled.answer,
          suggestedActions: saveHandled.suggestedActions,
          updatedPicks: saveHandled.updatedPicks,
          saveResult: saveHandled.saveResult,
        });
        return {
          ok: true,
          answer: saveHandled.answer,
          evidence: [],
          suggestedActions: saveHandled.suggestedActions,
          usedData: ['conciergeSave'],
          confidence: 92,
          conversationId: request.conversationId,
          messageId,
          cached: false,
          tokenUsage: null,
          estimatedCost: null,
          conciergePicks: saveHandled.updatedPicks,
          conciergeSaveResult: saveHandled.saveResult,
        };
      }
    } catch (err) {
      console.warn(
        '[ask-benson] concierge save intent failed:',
        err instanceof Error ? err.message : err,
      );
    }
  }

  let appliedPreferenceUpdates: PreferenceUpdate[] = [];
  const earlyUrls = message ? extractUrls(message) : [];
  // Skip LLM preference detection for URL intake — it blocks the sync path (1–3s budget).
  const skipPreferenceLlm =
    earlyUrls.length > 0 || Boolean(image) || Boolean(detectLookupQuery(message ?? ''));
  if (message && !skipPreferenceLlm) {
    try {
      const detected = await detectPreferenceUpdates(message);
      if (detected.length > 0) {
        const result = await applyPreferenceUpdates(detected, 'chat');
        appliedPreferenceUpdates = result.applied;
        if (appliedPreferenceUpdates.length > 0) {
          console.log(
            '[ask-benson] learned preference:',
            appliedPreferenceUpdates
              .map((u) => `${u.action} ${u.category}`)
              .join(', '),
          );
        }
      } else {
        const passedPhrase = await detectPassedBusiness(message);
        if (passedPhrase) {
          await recordPassedOpportunity(passedPhrase, 'chat', `Kellie said: "${message.slice(0, 160)}"`);
          console.log('[ask-benson] recorded passed opportunity:', passedPhrase);
        }
      }
    } catch (err) {
      console.warn(
        '[ask-benson] preference detection failed:',
        err instanceof Error ? err.message : err,
      );
    }
  }

  const inheritedContentItemId = request.conversationId
    ? await loadContentItemIdFromConversation(request.conversationId)
    : undefined;
  const contentItemId = resolveAskBensonFollowUpContentItemId({
    hasImage: Boolean(image),
    requestContentItemId: request.contentItemId,
    inheritedContentItemId,
  });

  const context = await buildAskBensonContext({
    pageContext: request.pageContext,
    mediaKitId: request.mediaKitId,
    contentItemId: contentItemId ?? undefined,
  });
  if (!context) {
    return {
      ok: false,
      answer: '',
      evidence: [],
      suggestedActions: [],
      usedData: [],
      confidence: 0,
      conversationId: request.conversationId ?? randomUUID(),
      messageId: null,
      cached: false,
      tokenUsage: null,
      estimatedCost: null,
      error: 'Failed to build creator context',
    };
  }

  context.recentPhrasing = await loadRecentPhrasing(profile.creatorId);

  if (request.draftAssetId) {
    const draftCtx = await loadDraftDiscussionContext(request.draftAssetId);
    if (draftCtx) {
      context.draftDiscussion = {
        ...draftCtx,
        discussionPrompt: draftDiscussionPromptBlock(draftCtx),
      };
    }
  }

  let collection: AskBensonCollectionResult | null = null;
  let pendingPartnershipResearch: {
    partnershipId: string;
    researchStatus: string;
    researchRunId: string | null;
  } | null = null;
  const pastedUrls = message ? extractUrls(message) : [];
  const locationScopeFollowUp =
    message && pastedUrls.length === 0 ? extractLocationScopeFromMessage(message) : null;
  const operatorCorrection =
    message && pastedUrls.length === 0 && !locationScopeFollowUp
      ? detectOperatorCorrection(message)
      : null;
  let linkCollectionUrls = pastedUrls;
  let correctionAmbiguous = false;
  let intakeUserMessage = effectiveMessage;
  if (operatorCorrection && request.conversationId) {
    const target = await resolveCorrectionTarget({
      creatorId: profile.creatorId,
      conversationId: request.conversationId,
      correction: operatorCorrection,
    });
    if (target?.sourceUrl) {
      linkCollectionUrls = [target.sourceUrl];
      intakeUserMessage = correctionUserMessage(operatorCorrection, effectiveMessage);
    } else {
      correctionAmbiguous = true;
    }
  } else if (operatorCorrection && !request.conversationId) {
    correctionAmbiguous = true;
  }
  const lookupQuery =
    message && pastedUrls.length === 0 && !locationScopeFollowUp && !operatorCorrection
      ? detectLookupQuery(message)
      : null;
  const enrichRequest =
    message &&
    pastedUrls.length === 0 &&
    !lookupQuery &&
    !locationScopeFollowUp &&
    !operatorCorrection
      ? isEnrichOpportunitiesRequest(message)
      : false;

  const cacheEligible =
    Boolean(message) &&
    !image &&
    pastedUrls.length === 0 &&
    !locationScopeFollowUp &&
    !operatorCorrection &&
    !lookupQuery &&
    !enrichRequest &&
    !request.draftAssetId &&
    !contentItemId;

  let responseCacheKey: string | null = null;
  if (cacheEligible && message) {
    responseCacheKey = buildCacheKey(
      normalizeAskMessage(message),
      context.snapshotVersion,
      request.mediaKitId,
      null,
    );
    const cached = await lookupCachedAskResponse(profile.creatorId, responseCacheKey);
    if (cached) {
      await db.insert(bensonChatMessages).values({
        creatorId: profile.creatorId,
        conversationId,
        role: 'user',
        message: effectiveMessage,
        inputSnapshot: {
          snapshotVersion: context.snapshotVersion,
          pageContext: request.pageContext ?? null,
          mediaKitId: request.mediaKitId ?? null,
          contentItemId: contentItemId ?? null,
          imageHash: null,
          pastedUrls: null,
          promptVersion: ASK_BENSON_PROMPT_VERSION,
          cacheKey: responseCacheKey,
        },
        outputJson: {},
        tokenUsage: {},
        estimatedCost: '0',
      });

      const [assistantRow] = await db
        .insert(bensonChatMessages)
        .values({
          creatorId: profile.creatorId,
          conversationId,
          role: 'assistant',
          message: cached.answer,
          inputSnapshot: {
            snapshotVersion: context.snapshotVersion,
            pageContext: request.pageContext ?? null,
            mediaKitId: request.mediaKitId ?? null,
            contentItemId: contentItemId ?? null,
            imageHash: null,
            promptVersion: ASK_BENSON_PROMPT_VERSION,
            cacheKey: responseCacheKey,
            cacheHit: true,
          },
          outputJson: cached.outputJson,
          tokenUsage: {},
          estimatedCost: '0',
        })
        .returning();

      return {
        ok: true,
        answer: cached.answer,
        evidence: cached.evidence,
        suggestedActions: cached.suggestedActions,
        usedData: [...cached.usedData, 'cacheHit'],
        confidence: cached.confidence,
        conversationId,
        messageId: assistantRow?.id ?? cached.messageId,
        cached: true,
        tokenUsage: null,
        estimatedCost: 0,
        conciergePicks: Array.isArray(cached.outputJson.conciergePicks)
          ? (cached.outputJson.conciergePicks as AskBensonResponse['conciergePicks'])
          : undefined,
      };
    }
  }

  if (
    message &&
    !image &&
    pastedUrls.length === 0 &&
    !lookupQuery &&
    !enrichRequest
  ) {
    const navigation = tryAnswerStudioNavigation(message, {
      openTasks: context.openTasks,
    });
    if (navigation) {
      await db.insert(bensonChatMessages).values({
        creatorId: profile.creatorId,
        conversationId,
        role: 'user',
        message: effectiveMessage,
        inputSnapshot: {
          snapshotVersion: context.snapshotVersion,
          pageContext: request.pageContext ?? null,
          mediaKitId: request.mediaKitId ?? null,
          contentItemId: contentItemId ?? null,
          imageHash: null,
          pastedUrls: null,
          promptVersion: ASK_BENSON_PROMPT_VERSION,
        },
        outputJson: {},
        tokenUsage: {},
        estimatedCost: '0',
      });

      const [assistantRow] = await db
        .insert(bensonChatMessages)
        .values({
          creatorId: profile.creatorId,
          conversationId,
          role: 'assistant',
          message: navigation.answer,
          inputSnapshot: {
            snapshotVersion: context.snapshotVersion,
            pageContext: request.pageContext ?? null,
            mediaKitId: request.mediaKitId ?? null,
            contentItemId: contentItemId ?? null,
            imageHash: null,
            promptVersion: ASK_BENSON_PROMPT_VERSION,
          },
          outputJson: {
            answer: navigation.answer,
            evidence: navigation.href
              ? [`Matched ${navigation.matchedTask ?? navigation.matchedRoute ?? 'studio route'} → ${navigation.href}`]
              : [],
            suggestedActions: navigation.suggestedActions,
            usedData: ['studioNavigation', 'openTasks'],
            confidence: 95,
            navigationHref: navigation.href,
          },
          tokenUsage: {},
          estimatedCost: '0',
        })
        .returning();

      return {
        ok: true,
        answer: navigation.answer,
        evidence: navigation.href
          ? [`Open ${navigation.href}`]
          : [],
        suggestedActions: navigation.suggestedActions,
        usedData: ['studioNavigation', 'openTasks'],
        confidence: 95,
        conversationId,
        messageId: assistantRow?.id ?? null,
        cached: false,
        tokenUsage: null,
        estimatedCost: null,
      };
    }
  }

  if (locationScopeFollowUp && linkCollectionUrls.length === 0 && request.conversationId) {
    const priorMessages = await loadConversationHistory(profile.creatorId, conversationId);
    const historyText = [...priorMessages].reverse().slice(0, 12).map((m) => m.content).join('\n');
    linkCollectionUrls = extractUrls(historyText, 1);
  }

  if (correctionAmbiguous && linkCollectionUrls.length === 0) {
    const structured: AskBensonStructuredAnswer = {
      answer:
        'I heard a correction, but I am not sure which recent item you mean. Name the place or event, or paste the official URL again, and I will update that same record.',
      evidence: ['Operator correction referent was ambiguous — no durable state changed'],
      suggestedActions: ['Paste the official URL', 'Name the event or business'],
      usedData: ['operatorCorrection'],
      confidence: 70,
    };
    await persistBensonConversationMessage({
      creatorId: profile.creatorId,
      conversationId,
      role: 'user',
      message: effectiveMessage,
      inputSnapshot: {
        snapshotVersion: context.snapshotVersion,
        pageContext: request.pageContext ?? null,
        contentItemId: contentItemId ?? null,
        promptVersion: ASK_BENSON_PROMPT_VERSION,
      },
      output: {},
      tokenUsage: {},
      estimatedCost: 0,
    });
    const messageId = await persistUrlIntakeAssistantMessage({
      profile,
      conversationId,
      context,
      request,
      contentItemId: contentItemId ?? null,
      imageHash: image?.contentHash ?? null,
      structured,
      collection: null,
    });
    return {
      ok: true,
      answer: structured.answer,
      evidence: structured.evidence,
      suggestedActions: structured.suggestedActions,
      usedData: structured.usedData,
      confidence: structured.confidence,
      conversationId,
      messageId,
      cached: false,
      tokenUsage: null,
      estimatedCost: null,
    };
  }

  if (image) {
    try {
      const collected = await collectOpportunitiesFromImage({
        image,
        userMessage: message,
      });
      collection = toCollectionResult(collected, 'image');
      context.collectedFromImage = collection;

      const newIds = collected.items
        .filter((item) => item.outcome === 'created')
        .map((item) => item.contentItemId);
      if (newIds.length > 0) {
        collection.scoredCount = await scoreContentItemIds(newIds);
      }
    } catch (err) {
      const intakeError = err instanceof Error ? err.message : 'Image extraction failed';
      console.warn('[ask-benson] image collection failed:', intakeError);
      context.collectedFromImage = {
        documentTitle: null,
        extractedCount: 0,
        created: 0,
        updated: 0,
        enrichmentsAttempted: 0,
        source: 'image',
        items: [],
        intakeError,
      };
      collection = context.collectedFromImage;
    }
  } else if (linkCollectionUrls.length > 0) {
    const opportunityGate = env.PARTNERSHIP_URL_INTELLIGENCE
      ? shouldOpenCreatorOpportunityPipeline(effectiveMessage)
      : {
          open: isCreatorPartnershipIntake(effectiveMessage),
          initialRoute: isCreatorPartnershipIntake(effectiveMessage)
            ? ('creator_partnership' as const)
            : null,
          reason: 'legacy_flag_off',
        };

    if (opportunityGate.open) {
      try {
        const submitted = await submitCreatorPartnership(
          {
            url: linkCollectionUrls[0],
            text: effectiveMessage,
            sourceScreen: 'ask_benson',
            initialIntakeRoute: opportunityGate.initialRoute ?? 'creator_partnership',
          },
          { skipResearch: true },
        );
        const authority = await readPartnershipResearchAuthority(submitted.partnershipId);
        const researchStatus = authority?.researchStatus ?? submitted.researchStatus;
        const briefTitle = submitted.decisionBrief?.headline ?? linkCollectionUrls[0] ?? 'Creator partnership';
        collection = {
          documentTitle: briefTitle,
          extractedCount: 1,
          created: submitted.duplicate ? 0 : 1,
          updated: submitted.duplicate ? 1 : 0,
          enrichmentsAttempted: 0,
          source: 'creator_partnership',
          intakeRoute: opportunityGate.initialRoute ?? 'creator_partnership',
          partnershipId: submitted.partnershipId,
          partnershipResearchStatus: isTerminalPartnershipResearchStatus(researchStatus)
            ? researchStatus
            : 'provisional',
          decisionBrief: submitted.decisionBrief ?? null,
          providerStatus: resolveAskBensonProviderStatus({
            sourceUrls: linkCollectionUrls,
            diagnostics: [],
          }),
          syncMs: submitted.syncMs,
          items: [
            {
              contentItemId: submitted.contentItemId,
              title: briefTitle,
              location: null,
              eventStartsAt: null,
              relevanceScore: 0.7,
              urgencyScore: 0.5,
              outcome: submitted.duplicate ? 'updated' : 'created',
              sourceUrl: linkCollectionUrls[0] ?? null,
              partnershipId: submitted.partnershipId,
            },
          ],
        };
        context.collectedFromLink = collection;
        pendingPartnershipResearch = {
          partnershipId: submitted.partnershipId,
          researchStatus,
          researchRunId: authority?.researchRunId ?? null,
        };
      } catch (err) {
        console.warn(
          '[ask-benson] creator partnership intake failed:',
          err instanceof Error ? err.message : err,
        );
      }
    } else {
      try {
        const collected = await collectOpportunitiesFromLink({
          urls: linkCollectionUrls,
          userMessage: intakeUserMessage,
        });
        collection = toCollectionResult(collected, 'link', { sourceUrls: collected.sourceUrls });
        context.collectedFromLink = collection;

        const newIds = collected.items
          .filter((item) => item.outcome === 'created')
          .map((item) => item.contentItemId);
        if (newIds.length > 0) {
          collection.scoredCount = await scoreContentItemIds(newIds);
        }
      } catch (err) {
        console.warn(
          '[ask-benson] link collection failed:',
          err instanceof Error ? err.message : err,
        );
      }
    }
  } else if (lookupQuery) {
    try {
      const collected = await collectOpportunitiesFromLookup({
        query: lookupQuery,
        userMessage: effectiveMessage,
      });
      collection = toCollectionResult(collected, 'lookup', { lookupQuery: collected.lookupQuery });
      context.collectedFromLink = collection;

      const newIds = collected.items
        .filter((item) => item.outcome === 'created')
        .map((item) => item.contentItemId);
      if (newIds.length > 0) {
        collection.scoredCount = await scoreContentItemIds(newIds);
      }
    } catch (err) {
      console.warn(
        '[ask-benson] lookup collection failed:',
        err instanceof Error ? err.message : err,
      );
    }
  } else if (enrichRequest) {
    try {
      const collected = await enrichRecentOpportunities();
      collection = toCollectionResult(collected, 'enrich');
      context.collectedFromLink = collection;
    } catch (err) {
      console.warn(
        '[ask-benson] opportunity enrichment failed:',
        err instanceof Error ? err.message : err,
      );
    }
  }

  const conciergeQuery =
    message && !image && pastedUrls.length === 0 && !lookupQuery && !enrichRequest
      ? detectConciergeQuery(message)
      : null;

  let inventorySearchMatches: Awaited<ReturnType<typeof searchInventoryForChat>>['matches'] = [];

  if (conciergeQuery?.inventoryQuery) {
    try {
      const searchResult = await searchInventoryForChat({
        query: conciergeQuery.inventoryQuery,
        excludedCategories: context.creatorPreferences.excludedCategories,
      });
      inventorySearchMatches = searchResult.matches;
      context.inventorySearch = {
        dateWindow: searchResult.query.dateWindow,
        keywords: searchResult.query.keywords,
        matchCount: searchResult.matchCount,
        widenedFrom: searchResult.widenedFrom,
        matches: searchResult.matches.map((match) => ({
          id: match.id,
          title: match.title,
          summary: match.summary,
          category: match.category,
          eventDate: match.eventDate,
          eventDateLabel: match.eventDateLabel,
          location: match.location,
          venue: match.venue,
          sourceName: match.sourceName,
          whyItMatters: match.whyItMatters,
          reviewUrl: match.reviewUrl,
          matchReasons: match.matchReasons,
        })),
      };
    } catch (err) {
      console.warn(
        '[ask-benson] inventory search failed:',
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (conciergeQuery) {
    try {
      const webResearch = await researchConciergeWeb({ query: conciergeQuery });
      context.conciergeWebResearch = webResearch;
    } catch (err) {
      console.warn(
        '[ask-benson] concierge web research failed:',
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (conciergeQuery) {
    const conciergePicks = buildConciergePicks({
      inventoryMatches: inventorySearchMatches,
      webResearch: context.conciergeWebResearch,
      webFirst: conciergeQuery.kind === 'research',
    });
    context.conciergePicks = conciergePicks.length > 0 ? conciergePicks : null;
  }

  const history = request.conversationId
    ? await loadConversationHistory(profile.creatorId, conversationId)
    : [];

  const isGreeting = isCasualGreeting(effectiveMessage);
  const intakeMode =
    Boolean(image) || linkCollectionUrls.length > 0 || Boolean(lookupQuery) || enrichRequest;
  const liveResearchMode = conciergeQuery?.kind === 'research';
  const conciergeMode = Boolean(conciergeQuery && !intakeMode);
  const analyticsConversation =
    !intakeMode &&
    !conciergeMode &&
    isAnalyticsConversation(effectiveMessage, history.length);

  await persistBensonConversationMessage({
    creatorId: profile.creatorId,
    conversationId,
    role: 'user',
    message: historyMessage,
    primaryPartnershipId: collection?.partnershipId ?? pendingPartnershipResearch?.partnershipId ?? null,
    inputSnapshot: {
      snapshotVersion: context.snapshotVersion,
      pageContext: request.pageContext ?? null,
      mediaKitId: request.mediaKitId ?? null,
      contentItemId: contentItemId ?? null,
      imageHash: image?.contentHash ?? null,
      pastedUrls: pastedUrls.length > 0 ? pastedUrls : null,
      promptVersion: ASK_BENSON_PROMPT_VERSION,
      ...(responseCacheKey ? { cacheKey: responseCacheKey } : {}),
      ...(collection?.partnershipId
        ? { entityContext: partnershipEntityContext(collection.partnershipId) }
        : {}),
    },
    output: {},
    tokenUsage: {},
    estimatedCost: 0,
  });

  const urlIntakeRan = linkCollectionUrls.length > 0;
  const urlIntakeFailed =
    urlIntakeRan &&
    collection &&
    collection.extractedCount === 0 &&
    collection.items.length === 0 &&
    collection.created === 0 &&
    collection.updated === 0 &&
    (collection.urlIntakeSummary?.quarantinedCount ?? 0) === 0;

  // HTTP 200 with 0 usable chars is a total intake failure — do not treat web-search
  // invention or prior conversation entity context as authority for durable mutation.
  const fetchTotallyFailed =
    collection?.urlIntakeDiagnostics?.every(
      (d) =>
        (!d.fetchOk || d.textLength === 0) &&
        !d.webSearchFallback,
    ) ?? false;
  const noSupportedEntityOutcome =
    collection?.urlIntakeSummary?.qualificationOutcome === 'NO_SUPPORTED_ENTITY' ||
    collection?.urlIntakeSummary?.qualificationOutcome === 'ENTITY_REJECTED';
  const socialOrHubOutcome =
    collection?.urlIntakeSummary?.qualificationOutcome === 'SOCIAL_POST_INTAKE' ||
    collection?.urlIntakeSummary?.qualificationOutcome === 'SOCIAL_PROFILE_SOURCE' ||
    collection?.urlIntakeSummary?.qualificationOutcome === 'LINK_HUB_INTAKE';

  if (urlIntakeFailed && (fetchTotallyFailed || noSupportedEntityOutcome) && collection && !socialOrHubOutcome) {
    collection.providerStatus = resolveAskBensonProviderStatus({
      sourceUrls: linkCollectionUrls,
      diagnostics: collection.urlIntakeDiagnostics ?? [],
      terminal: true,
    });
    const failure = buildUrlIntakeFailureAnswer({
      urls: linkCollectionUrls,
      diagnostics: collection.urlIntakeDiagnostics ?? [],
      userMessage: effectiveMessage,
    });
    const structured: AskBensonStructuredAnswer = {
      answer: failure.answer,
      evidence: failure.evidence,
      suggestedActions: failure.suggestedActions,
      usedData: ['urlIntake', 'urlIntakeDiagnostics'],
      confidence: isPlainUrlRequest(effectiveMessage, linkCollectionUrls) ? 72 : 68,
    };

    const messageId = await persistUrlIntakeAssistantMessage({
      profile,
      conversationId,
      context,
      request,
      contentItemId: contentItemId ?? null,
      imageHash: image?.contentHash ?? null,
      structured,
      collection,
    });

    return {
      ok: true,
      answer: structured.answer,
      evidence: structured.evidence,
      suggestedActions: structured.suggestedActions,
      usedData: structured.usedData,
      confidence: structured.confidence,
      conversationId,
      messageId,
      cached: false,
      tokenUsage: null,
      estimatedCost: null,
      collection,
    };
  }

  // Partnership provisional brief — sync path, no LLM, no network beyond DB.
  if (urlIntakeRan && collection?.source === 'creator_partnership' && collection.decisionBrief) {
    const provisional = provisionalChatFieldsFromBrief({
      partnershipId: collection.partnershipId!,
      researchStatus: collection.partnershipResearchStatus ?? 'provisional',
      decisionBrief: collection.decisionBrief,
    });
    const structured: AskBensonStructuredAnswer = {
      answer: provisional.answer,
      evidence: provisional.evidence,
      suggestedActions: provisional.suggestedActions,
      usedData: ['creatorPartnership', 'urlIntelligence', 'decisionBrief'],
      confidence: 72,
    };

    const alreadyTerminal = Boolean(
      pendingPartnershipResearch &&
        isTerminalPartnershipResearchStatus(pendingPartnershipResearch.researchStatus),
    );
    const messageId = await persistUrlIntakeAssistantMessage({
      profile,
      conversationId,
      context,
      request,
      contentItemId: collection.items[0]?.contentItemId ?? contentItemId ?? null,
      imageHash: image?.contentHash ?? null,
      structured,
      collection,
      researchStatus: provisional.researchStatus,
      researchRunId: alreadyTerminal ? pendingPartnershipResearch?.researchRunId ?? null : null,
    });

    if (messageId && pendingPartnershipResearch) {
      await launchChatPartnershipResearch({
        creatorId: profile.creatorId,
        partnershipId: pendingPartnershipResearch.partnershipId,
        originAssistantMessageId: messageId,
        researchStatus: pendingPartnershipResearch.researchStatus,
        alreadyTerminalPersisted:
          alreadyTerminal && Boolean(pendingPartnershipResearch.researchRunId),
      });
    }

    return {
      ok: true,
      answer: structured.answer,
      evidence: structured.evidence,
      suggestedActions: structured.suggestedActions,
      usedData: structured.usedData,
      confidence: structured.confidence,
      conversationId,
      messageId,
      cached: false,
      tokenUsage: null,
      estimatedCost: null,
      collection,
    };
  }

  if (urlIntakeRan && collection?.urlIntakeSummary) {
    const evidence = buildEvidenceFirstUrlAnswer({
      summary: collection.urlIntakeSummary,
      pageUrl: linkCollectionUrls[0]!,
      userMessage: effectiveMessage,
    });
    const structured: AskBensonStructuredAnswer = {
      answer: evidence.answer,
      evidence: evidence.evidence,
      suggestedActions: evidence.suggestedActions,
      usedData: ['urlIntake', 'urlIntakeSummary', 'urlIntakeQualification'],
      confidence: collection.urlIntakeSummary.qualifiedCount > 0 ? 78 : 74,
    };

    const messageId = await persistUrlIntakeAssistantMessage({
      profile,
      conversationId,
      context,
      request,
      contentItemId: contentItemId ?? null,
      imageHash: image?.contentHash ?? null,
      structured,
      collection,
    });

    return {
      ok: true,
      answer: structured.answer,
      evidence: structured.evidence,
      suggestedActions: structured.suggestedActions,
      usedData: structured.usedData,
      confidence: structured.confidence,
      conversationId,
      messageId,
      cached: false,
      tokenUsage: null,
      estimatedCost: null,
      collection,
    };
  }

  if (
    image &&
    collection &&
    shouldUseImageListingShortCircuit({
      hasImage: true,
      userMessage: message ?? '',
      collection,
    })
  ) {
    const savedTitles = collection.items.map((item) => item.title);
    const imageAnswer = buildEvidenceFirstImageAnswer({
      documentTitle: collection.documentTitle,
      extractedCount: collection.extractedCount,
      created: collection.created,
      updated: collection.updated,
      savedTitles,
      intakeError: collection.intakeError ?? null,
      userMessage: message ?? '',
    });
    const structured: AskBensonStructuredAnswer = {
      answer: imageAnswer.answer,
      evidence: imageAnswer.evidence,
      suggestedActions: imageAnswer.suggestedActions,
      usedData: ['imageIntake', 'imageExtraction'],
      confidence: collection.created + collection.updated > 0 ? 78 : 68,
    };

    const messageId = await persistUrlIntakeAssistantMessage({
      profile,
      conversationId,
      context,
      request,
      contentItemId: contentItemId ?? null,
      imageHash: image.contentHash ?? null,
      structured,
      collection,
    });

    return {
      ok: true,
      answer: structured.answer,
      evidence: structured.evidence,
      suggestedActions: structured.suggestedActions,
      usedData: structured.usedData,
      confidence: structured.confidence,
      conversationId,
      messageId,
      cached: false,
      tokenUsage: null,
      estimatedCost: null,
      collection,
    };
  }


  const { structured, tokenUsage, estimatedCost } = await runOpenAiAsk({
    context,
    message: effectiveMessage,
    history,
    sessionFlags: { elliottMentioned: sessionMentionedElliott(history) },
    analyticsConversation,
    isGreeting,
    intakeMode,
    conciergeMode,
    liveResearchMode,
    appliedPreferenceUpdates,
    image,
    collection,
  });

  const [assistantRow] = await db
    .insert(bensonChatMessages)
    .values({
      creatorId: profile.creatorId,
      conversationId,
      role: 'assistant',
      message: structured.answer,
      inputSnapshot: {
        snapshotVersion: context.snapshotVersion,
        pageContext: request.pageContext ?? null,
        mediaKitId: request.mediaKitId ?? null,
      contentItemId: contentItemId ?? null,
        imageHash: image?.contentHash ?? null,
        promptVersion: ASK_BENSON_PROMPT_VERSION,
        ...(responseCacheKey ? { cacheKey: responseCacheKey } : {}),
      },
      outputJson: {
        ...structured,
        conciergePicks: context.conciergePicks ?? [],
        collection: collection ?? null,
      },
      tokenUsage,
      estimatedCost: estimatedCost.toFixed(6),
    })
    .returning();

  return {
    ok: true,
    answer: structured.answer,
    evidence: structured.evidence,
    suggestedActions: structured.suggestedActions,
    usedData: structured.usedData,
    confidence: structured.confidence,
    conversationId,
    messageId: assistantRow?.id ?? null,
    cached: false,
    tokenUsage,
    estimatedCost,
    collection,
    conciergePicks: context.conciergePicks ?? undefined,
  };
}
