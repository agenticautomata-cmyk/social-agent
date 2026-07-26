import OpenAI from 'openai';
import { and, desc, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db } from '../db.js';
import { bensonChatMessages } from '../schema.js';
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
import { collectOpportunitiesFromLink, extractUrls } from './collect-from-link.js';
import {
  buildUrlIntakeFailureAnswer,
  isPlainUrlRequest,
} from './url-intake-pipeline.js';
import { buildEvidenceFirstUrlAnswer } from './url-intake-answer.js';
import { extractLocationScopeFromMessage } from './url-geo.js';
import { collectOpportunitiesFromLookup } from './collect-from-lookup.js';
import { enrichRecentOpportunities } from './enrich-opportunities.js';
import { detectLookupQuery, isEnrichOpportunitiesRequest } from './intake-intents.js';
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
    sourceUrls: extras?.sourceUrls,
    lookupQuery: extras?.lookupQuery,
    urlIntakeDiagnostics: collected.urlIntakeDiagnostics,
    urlIntakeSummary: collected.urlIntakeSummary,
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
}): Promise<string | null> {
  const [assistantRow] = await db
    .insert(bensonChatMessages)
    .values({
      creatorId: input.profile.creatorId,
      conversationId: input.conversationId,
      role: 'assistant',
      message: input.structured.answer,
      inputSnapshot: {
        snapshotVersion: input.context.snapshotVersion,
        pageContext: input.request.pageContext ?? null,
        mediaKitId: input.request.mediaKitId ?? null,
        contentItemId: input.contentItemId ?? null,
        imageHash: input.imageHash,
        promptVersion: ASK_BENSON_PROMPT_VERSION,
        urlIntakeSkippedLlm: true,
      },
      outputJson: {
        ...input.structured,
        collection: input.collection ?? null,
      },
      tokenUsage: {},
      estimatedCost: '0',
    })
    .returning();
  return assistantRow?.id ?? null;
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
  const intakeItemsCollected =
    input.intakeMode &&
    Boolean(
      input.collection &&
        (input.collection.items.length > 0 ||
          input.collection.created > 0 ||
          input.collection.updated > 0),
    );
  const attachImageToReply = Boolean(
    input.image && input.intakeMode && !intakeItemsCollected,
  );
  const userContent: OpenAI.Chat.ChatCompletionUserMessageParam['content'] = attachImageToReply
    ? [
        { type: 'text', text: userText },
        {
          type: 'image_url',
          image_url: { url: input.image!.dataUrl, detail: 'auto' },
        },
      ]
    : userText;

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

  const effectiveMessage =
    message ||
    "What's in this image? Tell me what you see and how it fits my content or sponsor strategy.";

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

  const conversationId = request.conversationId ?? randomUUID();

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
  if (message) {
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

  const contentItemId =
    request.contentItemId ??
    (request.conversationId ? await loadContentItemIdFromConversation(request.conversationId) : undefined);

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
  const pastedUrls = message ? extractUrls(message) : [];
  const locationScopeFollowUp =
    message && pastedUrls.length === 0 ? extractLocationScopeFromMessage(message) : null;
  let linkCollectionUrls = pastedUrls;
  const lookupQuery =
    message && pastedUrls.length === 0 && !locationScopeFollowUp ? detectLookupQuery(message) : null;
  const enrichRequest =
    message && pastedUrls.length === 0 && !lookupQuery && !locationScopeFollowUp
      ? isEnrichOpportunitiesRequest(message)
      : false;

  const cacheEligible =
    Boolean(message) &&
    !image &&
    pastedUrls.length === 0 &&
    !locationScopeFollowUp &&
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

  if (image) {
    try {
      const collected = await collectOpportunitiesFromImage({
        image,
        userMessage: effectiveMessage,
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
    try {
      const collected = await collectOpportunitiesFromLink({
        urls: linkCollectionUrls,
        userMessage: effectiveMessage,
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
      imageHash: image?.contentHash ?? null,
      pastedUrls: pastedUrls.length > 0 ? pastedUrls : null,
      promptVersion: ASK_BENSON_PROMPT_VERSION,
      ...(responseCacheKey ? { cacheKey: responseCacheKey } : {}),
    },
    outputJson: {},
    tokenUsage: {},
    estimatedCost: '0',
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

  const fetchTotallyFailed =
    collection?.urlIntakeDiagnostics?.every(
      (d) => !d.fetchOk && d.textLength === 0 && !d.webSearchFallback,
    ) ?? false;

  if (urlIntakeFailed && fetchTotallyFailed && collection) {
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
