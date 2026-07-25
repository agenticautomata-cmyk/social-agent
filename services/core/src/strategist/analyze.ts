import OpenAI from 'openai';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db.js';
import { strategistBriefings } from '../schema.js';
import { env } from '../env.js';
import { buildCreatorStrategistProfile } from './profile.js';
import { buildStrategistSystemPrompt } from '../benson-personality/index.js';
import {
  buildOperationalFreshness,
  computeOperationalSnapshotVersion,
  extractStoredOperationalSnapshotVersion,
} from './operational-freshness.js';
import { buildOutreachTimingContext } from './outreach-context.js';
import {
  STRATEGIST_CACHE_MS,
  STRATEGIST_PROMPT_VERSION,
  type CreatorStrategistProfile,
  type OperationalFreshness,
  type StrategistAnalysis,
  type StrategistBriefingHighlights,
  type StrategistBriefingResponse,
  type StrategistTokenUsage,
} from './types.js';

const SYSTEM_PROMPT = buildStrategistSystemPrompt();

const AnalysisSchema = z.object({
  summary: z.string(),
  whatsWorking: z.array(z.string()).default([]),
  whatsNotWorking: z.array(z.string()).default([]),
  recommendedActions: z.array(z.string()).default([]),
  bensonObservation: z.string().nullable().optional(),
  opportunities: z.array(z.string()),
  risks: z.array(z.string()),
  contentRecommendations: z.array(z.string()),
  sponsorRecommendations: z.array(z.string()),
  scheduleRecommendations: z.array(z.string()),
  experiments: z.array(z.string()),
  stopDoing: z.string(),
});

const MODEL = 'gpt-4o-mini';
const INPUT_COST_PER_M = 0.15;
const OUTPUT_COST_PER_M = 0.6;

function estimateCost(usage: StrategistTokenUsage): number {
  return (
    (usage.promptTokens / 1_000_000) * INPUT_COST_PER_M +
    (usage.completionTokens / 1_000_000) * OUTPUT_COST_PER_M
  );
}

function normalizeAnalysis(raw: z.infer<typeof AnalysisSchema>): StrategistAnalysis {
  return {
    ...raw,
    whatsWorking: raw.whatsWorking.length > 0 ? raw.whatsWorking : raw.opportunities.slice(0, 6),
    whatsNotWorking: raw.whatsNotWorking.length > 0 ? raw.whatsNotWorking : raw.risks.slice(0, 6),
    recommendedActions:
      raw.recommendedActions.length > 0
        ? raw.recommendedActions
        : [
            ...raw.contentRecommendations.slice(0, 1),
            ...raw.scheduleRecommendations.slice(0, 1),
            ...raw.sponsorRecommendations.slice(0, 1),
          ].filter(Boolean),
    bensonObservation: raw.bensonObservation ?? null,
  };
}

function buildHighlights(
  analysis: StrategistAnalysis,
  profile: CreatorStrategistProfile | null,
): StrategistBriefingHighlights {
  const recommendedPostTimes =
    profile?.recommendedPostTimes.map((slot) => slot.label) ?? [];
  const recommendedPostingDay =
    recommendedPostTimes[0] ??
    profile?.bestPostingDays[0]?.bucket ??
    analysis.scheduleRecommendations[0] ??
    null;

  return {
    topOpportunities: (analysis.whatsWorking.length > 0 ? analysis.whatsWorking : analysis.opportunities).slice(0, 3),
    topRisks: (analysis.whatsNotWorking.length > 0 ? analysis.whatsNotWorking : analysis.risks).slice(0, 3),
    nextContentRecommendation: analysis.contentRecommendations[0] ?? null,
    bestSponsorProspect: analysis.sponsorRecommendations[0] ?? null,
    recommendedPostingDay,
    recommendedPostTimes,
  };
}

function resolveStaleState(input: {
  baseStale: boolean;
  cacheValid: boolean;
  row: typeof strategistBriefings.$inferSelect | null;
  operationalSnapshotVersion: string;
}): { stale: boolean; staleReason: StrategistBriefingResponse['staleReason'] } {
  if (!input.row) {
    return { stale: true, staleReason: 'cache_expired' };
  }

  const storedVersion = extractStoredOperationalSnapshotVersion(input.row.inputSnapshot);
  if (storedVersion && storedVersion !== input.operationalSnapshotVersion) {
    return { stale: true, staleReason: 'new_intake_since_analysis' };
  }

  if (input.row.promptVersion !== STRATEGIST_PROMPT_VERSION) {
    return { stale: true, staleReason: 'prompt_version' };
  }

  if (input.baseStale || !input.cacheValid) {
    return { stale: true, staleReason: 'cache_expired' };
  }

  return { stale: false, staleReason: null };
}

function rowToResponse(
  row: typeof strategistBriefings.$inferSelect,
  profile: NonNullable<Awaited<ReturnType<typeof buildCreatorStrategistProfile>>>,
  operationalFreshness: OperationalFreshness,
  operationalSnapshotVersion: string,
  options: { cached: boolean; stale: boolean; staleReason: StrategistBriefingResponse['staleReason'] },
): StrategistBriefingResponse {
  const parsed = AnalysisSchema.safeParse(row.outputJson);
  const tokenUsage = row.tokenUsage as StrategistTokenUsage;
  const cacheExpiresAt = new Date(row.createdAt.getTime() + STRATEGIST_CACHE_MS).toISOString();
  const analysis = parsed.success ? normalizeAnalysis(parsed.data) : null;

  return {
    ok: true,
    cached: options.cached,
    stale: options.stale,
    staleReason: options.staleReason,
    cacheExpiresAt,
    createdAt: row.createdAt.toISOString(),
    promptVersion: row.promptVersion,
    profile,
    analysis,
    highlights: analysis ? buildHighlights(analysis, profile) : null,
    operationalFreshness,
    operationalSnapshotVersion,
    tokenUsage,
    estimatedCost: Number(row.estimatedCost),
    briefingId: row.id,
    needsAnalysis: !parsed.success,
  };
}

function emptyOperationalResponse(
  partial: Partial<StrategistBriefingResponse>,
): StrategistBriefingResponse {
  return {
    ok: false,
    cached: false,
    stale: true,
    staleReason: 'cache_expired',
    cacheExpiresAt: null,
    createdAt: null,
    promptVersion: STRATEGIST_PROMPT_VERSION,
    profile: null,
    analysis: null,
    highlights: null,
    operationalFreshness: null,
    operationalSnapshotVersion: null,
    tokenUsage: null,
    estimatedCost: null,
    briefingId: null,
    needsAnalysis: true,
    ...partial,
  };
}

async function getLatestBriefing(creatorId: string) {
  const [row] = await db
    .select()
    .from(strategistBriefings)
    .where(eq(strategistBriefings.creatorId, creatorId))
    .orderBy(desc(strategistBriefings.createdAt))
    .limit(1);
  return row ?? null;
}

async function runOpenAiAnalysis(input: {
  profile: NonNullable<Awaited<ReturnType<typeof buildCreatorStrategistProfile>>>;
  operationalFreshness: OperationalFreshness;
  outreachTiming: Awaited<ReturnType<typeof buildOutreachTimingContext>>;
}): Promise<{ analysis: StrategistAnalysis; tokenUsage: StrategistTokenUsage; estimatedCost: number }> {
  if (!env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required for Benson Strategist analysis');
  }

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const response = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.55,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: JSON.stringify({
          profile: input.profile,
          operationalFreshness: input.operationalFreshness,
          outreachTiming: input.outreachTiming,
          instruction:
            'Include sponsor outreach timing in sponsorRecommendations when pitchWhileHot or nearTenK is set. Tie content momentum to who to pitch now.',
        }),
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned empty strategist response');

  const parsed = AnalysisSchema.parse(JSON.parse(content));
  const analysis = normalizeAnalysis(parsed);
  const tokenUsage: StrategistTokenUsage = {
    promptTokens: response.usage?.prompt_tokens ?? 0,
    completionTokens: response.usage?.completion_tokens ?? 0,
    totalTokens: response.usage?.total_tokens ?? 0,
    model: MODEL,
  };
  const estimatedCost = estimateCost(tokenUsage);

  return { analysis, tokenUsage, estimatedCost };
}

async function storeBriefing(input: {
  creatorId: string;
  profile: NonNullable<Awaited<ReturnType<typeof buildCreatorStrategistProfile>>>;
  operationalFreshness: OperationalFreshness;
  operationalSnapshotVersion: string;
  analysis: StrategistAnalysis;
  tokenUsage: StrategistTokenUsage;
  estimatedCost: number;
}) {
  const [row] = await db
    .insert(strategistBriefings)
    .values({
      creatorId: input.creatorId,
      promptVersion: STRATEGIST_PROMPT_VERSION,
      inputSnapshot: {
        profile: input.profile,
        operationalFreshness: input.operationalFreshness,
        operationalSnapshotVersion: input.operationalSnapshotVersion,
      },
      outputJson: input.analysis,
      tokenUsage: input.tokenUsage,
      estimatedCost: input.estimatedCost.toFixed(6),
    })
    .returning();

  return row!;
}

export async function getStrategistBriefing(options?: {
  force?: boolean;
}): Promise<StrategistBriefingResponse> {
  const [profile, operationalFreshness] = await Promise.all([
    buildCreatorStrategistProfile(),
    buildOperationalFreshness(),
  ]);
  const operationalSnapshotVersion = computeOperationalSnapshotVersion(operationalFreshness);

  if (!profile) {
    return emptyOperationalResponse({
      operationalFreshness,
      operationalSnapshotVersion,
      error: 'No creator analytics account found',
    });
  }

  const latest = await getLatestBriefing(profile.creatorId);
  const force = options?.force ?? false;
  const cacheValid =
    latest != null && Date.now() - latest.createdAt.getTime() < STRATEGIST_CACHE_MS;

  if (latest && cacheValid && !force) {
    const staleState = resolveStaleState({
      baseStale: false,
      cacheValid: true,
      row: latest,
      operationalSnapshotVersion,
    });
    return rowToResponse(latest, profile, operationalFreshness, operationalSnapshotVersion, {
      cached: true,
      stale: staleState.stale,
      staleReason: staleState.staleReason,
    });
  }

  if (latest && !force) {
    const staleState = resolveStaleState({
      baseStale: true,
      cacheValid: false,
      row: latest,
      operationalSnapshotVersion,
    });
    return rowToResponse(latest, profile, operationalFreshness, operationalSnapshotVersion, {
      cached: false,
      stale: true,
      staleReason: staleState.staleReason ?? 'cache_expired',
    });
  }

  const parsedLatest = latest ? AnalysisSchema.safeParse(latest.outputJson) : null;
  const staleState = resolveStaleState({
    baseStale: true,
    cacheValid: false,
    row: latest,
    operationalSnapshotVersion,
  });

  return {
    ok: true,
    cached: false,
    stale: true,
    staleReason: staleState.staleReason ?? 'cache_expired',
    cacheExpiresAt: null,
    createdAt: latest?.createdAt.toISOString() ?? null,
    promptVersion: STRATEGIST_PROMPT_VERSION,
    profile,
    analysis: parsedLatest?.success ? normalizeAnalysis(parsedLatest.data) : null,
    highlights: parsedLatest?.success
      ? buildHighlights(normalizeAnalysis(parsedLatest.data), profile)
      : null,
    operationalFreshness,
    operationalSnapshotVersion,
    tokenUsage: (latest?.tokenUsage as StrategistTokenUsage | undefined) ?? null,
    estimatedCost: latest ? Number(latest.estimatedCost) : null,
    briefingId: latest?.id ?? null,
    needsAnalysis: true,
  };
}

export async function analyzeStrategistBriefing(): Promise<StrategistBriefingResponse> {
  const [profile, operationalFreshness] = await Promise.all([
    buildCreatorStrategistProfile(),
    buildOperationalFreshness(),
  ]);
  if (!profile) {
    throw new Error('No creator analytics account found');
  }

  const operationalSnapshotVersion = computeOperationalSnapshotVersion(operationalFreshness);
  const outreachTiming = await buildOutreachTimingContext();
  const { analysis, tokenUsage, estimatedCost } = await runOpenAiAnalysis({
    profile,
    operationalFreshness,
    outreachTiming,
  });
  const row = await storeBriefing({
    creatorId: profile.creatorId,
    profile,
    operationalFreshness,
    operationalSnapshotVersion,
    analysis,
    tokenUsage,
    estimatedCost,
  });

  return rowToResponse(row, profile, operationalFreshness, operationalSnapshotVersion, {
    cached: false,
    stale: false,
    staleReason: null,
  });
}
