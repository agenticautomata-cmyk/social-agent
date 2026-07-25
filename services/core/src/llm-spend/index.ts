import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '../db.js';
import {
  bensonChatMessages,
  bensonDiscoveries,
  bensonLearnings,
  bensonProgressBriefs,
  llmUsageEvents,
  strategistBriefings,
} from '../schema.js';
import { env } from '../env.js';
import { sendTelegramMessage } from '../telegram-notifications/send.js';
import { getOutcomeCardSummary } from '../outcome-engine/analytics.js';

export type LlmSpendSource =
  | 'ask_benson'
  | 'strategist'
  | 'pulse'
  | 'learning'
  | 'discovery'
  | 'opportunity_scoring'
  | 'gmail_digest'
  | 'web_search'
  | 'intake'
  | 'outreach'
  | 'other';

export type RecordLlmUsageInput = {
  source: LlmSpendSource | string;
  model?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  estimatedCost: number;
  metadata?: Record<string, unknown>;
};

export type SpendBreakdownRow = {
  source: string;
  runs: number;
  costUsd: number;
};

export type SpendSummary = {
  periodDays: number;
  trackedCostUsd: number;
  eventsCostUsd: number;
  totalCostUsd: number;
  dailyAverageUsd: number;
  todayCostUsd: number;
  budgetUsd: number | null;
  budgetExceeded: boolean;
  breakdown: SpendBreakdownRow[];
  topAskConversations: Array<{ conversationId: string; costUsd: number; messages: number }>;
  workerActivity: {
    discoveryRuns: number;
    scoringEvents: number;
    digestEvents: number;
    webSearchEvents: number;
  };
  roiThrottle: {
    active: boolean;
    discoveryQueryCount: number;
    scoringBatchLimit: number;
    reason: string | null;
  };
};

const MINI_INPUT = 0.15 / 1_000_000;
const MINI_OUTPUT = 0.6 / 1_000_000;
const WEB_SEARCH_ESTIMATE_USD = 0.012;

let budgetAlertSentDay: string | null = null;

export function estimateMiniCost(promptTokens: number, completionTokens: number): number {
  return promptTokens * MINI_INPUT + completionTokens * MINI_OUTPUT;
}

export function estimateWebSearchCost(): number {
  return WEB_SEARCH_ESTIMATE_USD;
}

export async function recordLlmUsage(input: RecordLlmUsageInput): Promise<void> {
  if (input.estimatedCost <= 0 && !input.promptTokens && !input.completionTokens) return;
  try {
    await db.insert(llmUsageEvents).values({
      source: input.source,
      model: input.model ?? null,
      promptTokens: input.promptTokens ?? null,
      completionTokens: input.completionTokens ?? null,
      estimatedCost: String(input.estimatedCost),
      metadata: input.metadata ?? {},
    });
  } catch (err) {
    console.warn('[llm-spend] failed to record usage:', err instanceof Error ? err.message : err);
  }
}

async function sumTrackedSince(since: Date): Promise<SpendBreakdownRow[]> {
  const sinceIso = since.toISOString();
  const rows = await db.execute(sql`
    SELECT source, runs, cost_usd FROM (
      SELECT 'ask_benson'::text AS source, COUNT(*)::int AS runs,
        COALESCE(SUM(estimated_cost::numeric), 0) AS cost_usd
      FROM benson_chat_messages
      WHERE role = 'assistant' AND created_at >= ${sinceIso}::timestamptz
      UNION ALL
      SELECT 'strategist', COUNT(*)::int, COALESCE(SUM(estimated_cost::numeric), 0)
      FROM strategist_briefings WHERE created_at >= ${sinceIso}::timestamptz
      UNION ALL
      SELECT 'pulse', COUNT(*)::int, COALESCE(SUM(estimated_cost::numeric), 0)
      FROM benson_progress_briefs WHERE created_at >= ${sinceIso}::timestamptz
      UNION ALL
      SELECT 'learning', COUNT(*)::int, COALESCE(SUM(estimated_cost::numeric), 0)
      FROM benson_learnings WHERE created_at >= ${sinceIso}::timestamptz
      UNION ALL
      SELECT 'discovery', COUNT(*)::int, COALESCE(SUM(estimated_cost::numeric), 0)
      FROM benson_discoveries WHERE created_at >= ${sinceIso}::timestamptz
    ) t
    ORDER BY cost_usd DESC
  `);
  return (rows as unknown as Array<{ source: string; runs: number; cost_usd: string | number }>).map(
    (r) => ({
      source: r.source,
      runs: Number(r.runs),
      costUsd: Math.round(Number(r.cost_usd) * 10000) / 10000,
    }),
  );
}

async function sumEventsSince(since: Date): Promise<SpendBreakdownRow[]> {
  try {
    const rows = await db
      .select({
        source: llmUsageEvents.source,
        runs: sql<number>`count(*)::int`,
        costUsd: sql<number>`coalesce(sum(${llmUsageEvents.estimatedCost}::numeric), 0)`,
      })
      .from(llmUsageEvents)
      .where(gte(llmUsageEvents.createdAt, since))
      .groupBy(llmUsageEvents.source)
      .orderBy(desc(sql`coalesce(sum(${llmUsageEvents.estimatedCost}::numeric), 0)`));
    return rows.map((r) => ({
      source: r.source,
      runs: Number(r.runs),
      costUsd: Math.round(Number(r.costUsd) * 10000) / 10000,
    }));
  } catch {
    return [];
  }
}

function mergeBreakdown(tracked: SpendBreakdownRow[], events: SpendBreakdownRow[]): SpendBreakdownRow[] {
  const map = new Map<string, SpendBreakdownRow>();
  for (const row of [...tracked, ...events]) {
    const prev = map.get(row.source);
    if (prev) {
      map.set(row.source, {
        source: row.source,
        runs: prev.runs + row.runs,
        costUsd: Math.round((prev.costUsd + row.costUsd) * 10000) / 10000,
      });
    } else {
      map.set(row.source, { ...row });
    }
  }
  return [...map.values()].sort((a, b) => b.costUsd - a.costUsd);
}

export async function getTodaySpendUsd(): Promise<number> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const [tracked, events] = await Promise.all([sumTrackedSince(start), sumEventsSince(start)]);
  const total =
    tracked.reduce((s, r) => s + r.costUsd, 0) + events.reduce((s, r) => s + r.costUsd, 0);
  return Math.round(total * 10000) / 10000;
}

export function getDailyBudgetUsd(): number | null {
  const budget = env.BENSON_LLM_DAILY_BUDGET_USD;
  return budget > 0 ? budget : null;
}

export async function isDailyBudgetExceeded(): Promise<boolean> {
  const budget = getDailyBudgetUsd();
  if (budget == null) return false;
  const today = await getTodaySpendUsd();
  return today >= budget;
}

export type BackgroundLlmFeature =
  | 'discovery'
  | 'scoring'
  | 'digest'
  | 'learning'
  | 'outreach'
  | 'web_search'
  | 'source_health';

export async function shouldSkipBackgroundLlm(feature: BackgroundLlmFeature): Promise<{
  skip: boolean;
  reason: string | null;
}> {
  if (await isDailyBudgetExceeded()) {
    return { skip: true, reason: 'daily_budget_exceeded' };
  }

  switch (feature) {
    case 'discovery':
      if (!env.BENSON_DISCOVERY_ENABLED) return { skip: true, reason: 'discovery_disabled' };
      break;
    case 'scoring':
      if (!env.BENSON_SCORING_ENABLED) return { skip: true, reason: 'scoring_disabled' };
      break;
    case 'digest':
      if (!env.GMAIL_DIGEST_LLM_ENABLED) return { skip: true, reason: 'digest_llm_disabled' };
      break;
    case 'web_search':
      if (!env.BENSON_WEB_SEARCH_ENABLED) return { skip: true, reason: 'web_search_disabled' };
      break;
    case 'source_health':
      if (!env.BENSON_SOURCE_HEALTH_WEB_SEARCH_ENABLED) {
        return { skip: true, reason: 'source_health_web_search_disabled' };
      }
      break;
    default:
      break;
  }

  return { skip: false, reason: null };
}

export async function getRoiThrottleState(): Promise<{
  active: boolean;
  discoveryQueryCount: number;
  scoringBatchLimit: number;
  reason: string | null;
}> {
  const baseQueries = env.BENSON_DISCOVERY_QUERY_COUNT;
  const baseLimit = env.BENSON_SCORING_BATCH_LIMIT;

  try {
    const outcomes = await getOutcomeCardSummary();
    const lowExecution =
      outcomes.totalRecommendations >= 10 &&
      (outcomes.plannedToFilmedRate == null || outcomes.plannedToFilmedRate < 25) &&
      (outcomes.acceptanceRate == null || outcomes.acceptanceRate < 20);

    if (lowExecution) {
      return {
        active: true,
        discoveryQueryCount: Math.max(1, baseQueries - 1),
        scoringBatchLimit: Math.max(5, Math.floor(baseLimit * 0.6)),
        reason: 'low_execution_rate_14d',
      };
    }
  } catch {
    /* outcome tables optional */
  }

  return {
    active: false,
    discoveryQueryCount: baseQueries,
    scoringBatchLimit: baseLimit,
    reason: null,
  };
}

export async function getEffectiveDiscoveryQueryCount(): Promise<number> {
  const state = await getRoiThrottleState();
  return state.discoveryQueryCount;
}

export async function getEffectiveScoringLimit(): Promise<number> {
  const state = await getRoiThrottleState();
  return state.scoringBatchLimit;
}

export async function getConciergeWebSearchCountToday(): Promise<number> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  try {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(llmUsageEvents)
      .where(
        and(
          eq(llmUsageEvents.source, 'web_search'),
          gte(llmUsageEvents.createdAt, start),
          sql`${llmUsageEvents.metadata}->>'context' = 'concierge'`,
        ),
      );
    return Number(row?.count ?? 0);
  } catch {
    return 0;
  }
}

export async function canRunConciergeWebSearch(): Promise<boolean> {
  const count = await getConciergeWebSearchCountToday();
  return count < env.BENSON_CONCIERGE_WEB_SEARCH_DAILY;
}

export async function buildSpendSummary(periodDays = 7): Promise<SpendSummary> {
  const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);
  const [tracked, events, todayCostUsd, roiThrottle] = await Promise.all([
    sumTrackedSince(since),
    sumEventsSince(since),
    getTodaySpendUsd(),
    getRoiThrottleState(),
  ]);

  const trackedTotal = tracked.reduce((s, r) => s + r.costUsd, 0);
  const eventsTotal = events.reduce((s, r) => s + r.costUsd, 0);
  const totalCostUsd = Math.round((trackedTotal + eventsTotal) * 10000) / 10000;
  const budgetUsd = getDailyBudgetUsd();

  const topAsk = await db.execute(sql`
    SELECT conversation_id, COUNT(*)::int AS messages,
      COALESCE(SUM(estimated_cost::numeric), 0) AS cost_usd
    FROM benson_chat_messages
    WHERE role = 'assistant' AND created_at >= ${since.toISOString()}::timestamptz
    GROUP BY conversation_id
    ORDER BY cost_usd DESC
    LIMIT 8
  `);

  const workerActivity = {
    discoveryRuns: events.find((e) => e.source === 'discovery')?.runs ?? tracked.find((t) => t.source === 'discovery')?.runs ?? 0,
    scoringEvents: events.find((e) => e.source === 'opportunity_scoring')?.runs ?? 0,
    digestEvents: events.find((e) => e.source === 'gmail_digest')?.runs ?? 0,
    webSearchEvents: events.find((e) => e.source === 'web_search')?.runs ?? 0,
  };

  return {
    periodDays,
    trackedCostUsd: Math.round(trackedTotal * 10000) / 10000,
    eventsCostUsd: Math.round(eventsTotal * 10000) / 10000,
    totalCostUsd,
    dailyAverageUsd: Math.round((totalCostUsd / periodDays) * 10000) / 10000,
    todayCostUsd,
    budgetUsd,
    budgetExceeded: budgetUsd != null ? todayCostUsd >= budgetUsd : false,
    breakdown: mergeBreakdown(tracked, events),
    topAskConversations: (topAsk as unknown as Array<{ conversation_id: string; messages: number; cost_usd: string }>).map(
      (r) => ({
        conversationId: r.conversation_id,
        messages: Number(r.messages),
        costUsd: Math.round(Number(r.cost_usd) * 10000) / 10000,
      }),
    ),
    workerActivity,
    roiThrottle,
  };
}

export async function maybeAlertBudgetExceeded(): Promise<void> {
  const budget = getDailyBudgetUsd();
  if (budget == null) return;
  const today = await getTodaySpendUsd();
  if (today < budget) return;

  const dayKey = new Date().toISOString().slice(0, 10);
  if (budgetAlertSentDay === dayKey) return;
  budgetAlertSentDay = dayKey;

  await sendTelegramMessage(
    `⚠️ Benson AI spend alert: today's tracked usage is $${today.toFixed(2)} (budget $${budget.toFixed(2)}). Background discovery, digest LLM, and learning are throttled until tomorrow.`,
  );
}

export async function auditOpenAiSpend(periodDays = 7): Promise<SpendSummary> {
  return buildSpendSummary(periodDays);
}

export async function buildSpendOutcomeMetrics(periodDays = 7): Promise<{
  periodDays: number;
  totalSpendUsd: number;
  dailyAverageUsd: number;
  costPerPostedVideo: number | null;
  costPerSponsorReply: number | null;
}> {
  const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);
  const [postedRow] = await db.execute(sql`
    SELECT count(*) filter (where creator_video_id is not null)::int AS posted
    FROM content_outcome_links
    WHERE created_at >= ${since.toISOString()}::timestamptz
  `);
  const [sponsorRow] = await db.execute(sql`
    SELECT count(*) filter (
      where sponsor_contact_id is not null or pipeline_opportunity_id is not null
    )::int AS sponsor
    FROM content_outcome_links
    WHERE created_at >= ${since.toISOString()}::timestamptz
  `);

  const posted = Number((postedRow as unknown as { posted: number }).posted ?? 0);
  const sponsor = Number((sponsorRow as unknown as { sponsor: number }).sponsor ?? 0);
  const spend = await buildSpendSummary(periodDays);

  return {
    periodDays,
    totalSpendUsd: spend.totalCostUsd,
    dailyAverageUsd: spend.dailyAverageUsd,
    costPerPostedVideo:
      posted > 0 ? Math.round((spend.totalCostUsd / posted) * 100) / 100 : null,
    costPerSponsorReply:
      sponsor > 0 ? Math.round((spend.totalCostUsd / sponsor) * 100) / 100 : null,
  };
}
