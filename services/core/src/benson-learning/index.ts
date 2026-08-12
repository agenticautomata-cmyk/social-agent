import { desc, eq, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { bensonLearnings, workerHeartbeats } from '../schema.js';
import { env } from '../env.js';
import { classifyError, sanitizeErrorForUi } from '../provider-errors.js';
import {
  collectLearningSignals,
  hashLearningSignals,
  signalsAreEmpty,
  type LearningSignalSnapshot,
} from './collect-signals.js';
import { synthesizeLearnings } from './synthesize.js';
import { maybeAlertBudgetExceeded, shouldSkipBackgroundLlm } from '../llm-spend/index.js';
import {
  learningOutputIsClean,
  loadSuppressionsForLearning,
  sanitizeLearningSnapshot,
  textContainsSuppressedEntity,
} from './suppression.js';
import { applyLessonQualityGates } from './post-process.js';
import { applyMonetizationFirstCorrections } from './monetization-first.js';
import { correctNothingNewContradiction, correctTikTokStaleClaims } from './tiktok-truth.js';
import { NOTHING_NEW_SUMMARY, type BensonInsight } from './types.js';
import { resolveTikTokAnalyticsContext } from '../creator-analytics/tiktok-context.js';

export type LearningRefreshStatus =
  | 'fresh'
  | 'verified_stale'
  | 'refresh_failed'
  | 'unavailable';

export type BensonLearningSnapshot = {
  summary: string;
  insights: BensonInsight[];
  createdAt: string;
  isStale: boolean;
  noNewLessons: boolean;
  refreshStatus: LearningRefreshStatus;
  lastVerifiedAt: string | null;
  refreshFailedAt: string | null;
  refreshMessage: string | null;
  signalCounts: {
    preferences: number;
    feedback: number;
    chatFeedback: number;
    planner: number;
    skipped: number;
    passed: number;
    tasteVotes: number;
    topPosts: number;
    performanceSignals: number;
    timelyOpportunities: number;
  };
};

export type LearningRunResult = {
  ran: boolean;
  reason: string;
  learningId?: string;
  refreshFailed?: boolean;
};

const LEARNING_WORKER_ID = 'benson-learning';

async function loadLearningWorkerHeartbeat() {
  const [row] = await db
    .select()
    .from(workerHeartbeats)
    .where(eq(workerHeartbeats.workerId, LEARNING_WORKER_ID))
    .limit(1);
  return row ?? null;
}

function deriveRefreshState(input: {
  learningCreatedAt: string | null;
  workerLastSuccessAt: Date | null;
  workerLastErrorAt: Date | null;
}): Pick<
  BensonLearningSnapshot,
  'refreshStatus' | 'lastVerifiedAt' | 'refreshFailedAt' | 'refreshMessage'
> {
  const { learningCreatedAt, workerLastSuccessAt, workerLastErrorAt } = input;

  if (!learningCreatedAt) {
    if (workerLastErrorAt && (!workerLastSuccessAt || workerLastErrorAt > workerLastSuccessAt)) {
      return {
        refreshStatus: 'unavailable',
        lastVerifiedAt: null,
        refreshFailedAt: workerLastErrorAt.toISOString(),
        refreshMessage: 'No new reliable learning available.',
      };
    }
    return {
      refreshStatus: 'unavailable',
      lastVerifiedAt: null,
      refreshFailedAt: null,
      refreshMessage: 'No new reliable learning available.',
    };
  }

  const refreshFailed =
    workerLastErrorAt != null &&
    (!workerLastSuccessAt || workerLastErrorAt.getTime() > workerLastSuccessAt.getTime()) &&
    workerLastErrorAt.getTime() > new Date(learningCreatedAt).getTime();

  if (refreshFailed) {
    return {
      refreshStatus: 'refresh_failed',
      lastVerifiedAt: learningCreatedAt,
      refreshFailedAt: workerLastErrorAt!.toISOString(),
      refreshMessage: null,
    };
  }

  const isFresh =
    workerLastSuccessAt != null &&
    workerLastSuccessAt.getTime() <= new Date(learningCreatedAt).getTime() + 60_000;

  return {
    refreshStatus: isFresh ? 'fresh' : 'verified_stale',
    lastVerifiedAt: learningCreatedAt,
    refreshFailedAt: null,
    refreshMessage: null,
  };
}

async function attachRefreshState(
  snapshot: Omit<
    BensonLearningSnapshot,
    'refreshStatus' | 'lastVerifiedAt' | 'refreshFailedAt' | 'refreshMessage'
  >,
): Promise<BensonLearningSnapshot> {
  const worker = await loadLearningWorkerHeartbeat();
  const recovered =
    worker?.lastSuccessAt != null &&
    (worker.lastErrorAt == null || worker.lastSuccessAt.getTime() > worker.lastErrorAt.getTime());
  if (recovered) {
    const { resolveWorkerIncident } = await import('../creator-agent/worker-incidents.js');
    await resolveWorkerIncident({
      workerId: LEARNING_WORKER_ID,
      lastSuccessAt: worker!.lastSuccessAt ?? undefined,
    }).catch(() => undefined);
  }
  const refresh = deriveRefreshState({
    learningCreatedAt: snapshot.createdAt,
    workerLastSuccessAt: worker?.lastSuccessAt ?? null,
    workerLastErrorAt: worker?.lastErrorAt ?? null,
  });
  return { ...snapshot, ...refresh };
}

export async function recordLearningRefreshSuccess(): Promise<void> {
  const now = new Date();
  await db
    .insert(workerHeartbeats)
    .values({
      workerId: LEARNING_WORKER_ID,
      displayName: 'Benson Learning',
      scheduleLabel: 'every 6h',
      status: 'healthy',
      lastHeartbeatAt: now,
      lastSuccessAt: now,
      consecutiveFailures: 0,
      lastErrorSummary: null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: workerHeartbeats.workerId,
      set: {
        status: 'healthy',
        lastHeartbeatAt: now,
        lastSuccessAt: now,
        consecutiveFailures: 0,
        lastErrorSummary: null,
        updatedAt: now,
      },
    });
  const { resolveWorkerIncident } = await import('../creator-agent/worker-incidents.js');
  await resolveWorkerIncident({ workerId: LEARNING_WORKER_ID, lastSuccessAt: now });
}

export async function recordLearningRefreshFailure(error: unknown): Promise<void> {
  const now = new Date();
  const classified = classifyError(error, 'openai');
  console.error(
    `[benson-learning] refresh failed (${classified.rootCause}${classified.requestId ? `, ${classified.requestId}` : ''}): ${classified.logMessage}`,
  );
  const uiSummary = sanitizeErrorForUi(error, 'learning');
  await db
    .insert(workerHeartbeats)
    .values({
      workerId: LEARNING_WORKER_ID,
      displayName: 'Benson Learning',
      scheduleLabel: 'every 6h',
      status: 'degraded',
      lastHeartbeatAt: now,
      lastErrorAt: now,
      lastErrorSummary: uiSummary,
      consecutiveFailures: 1,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: workerHeartbeats.workerId,
      set: {
        status: 'degraded',
        lastHeartbeatAt: now,
        lastErrorAt: now,
        lastErrorSummary: uiSummary,
        consecutiveFailures: sql`${workerHeartbeats.consecutiveFailures} + 1`,
        updatedAt: now,
      },
    });
  const { upsertWorkerIncident } = await import('../creator-agent/worker-incidents.js');
  await upsertWorkerIncident({
    workerId: LEARNING_WORKER_ID,
    errorSummary: uiSummary,
  });
}

export const LEARNING_DISPLAY_STALE_MS = 7 * 24 * 60 * 60 * 1000;

function signalCounts(signals: LearningSignalSnapshot) {
  return {
    preferences: signals.preferenceEvents.length,
    feedback: signals.feedbackEvents.length,
    chatFeedback: signals.chatFeedbackEvents.length,
    planner: signals.plannerActions.length,
    skipped: signals.skippedOpportunities.length,
    passed: signals.passedOpportunities.length,
    tasteVotes: signals.tasteVotes.length,
    topPosts: signals.topPerformingPosts.length,
    performanceSignals: signals.performanceSignals.length,
    timelyOpportunities: signals.timelyOpportunities.length,
  };
}

function rowToSnapshot(row: typeof bensonLearnings.$inferSelect): Omit<
  BensonLearningSnapshot,
  'refreshStatus' | 'lastVerifiedAt' | 'refreshFailedAt' | 'refreshMessage'
> {
  const createdAt = row.createdAt.toISOString();
  const ageMs = Date.now() - row.createdAt.getTime();
  const snapshot = (row.signalSnapshot ?? {}) as Partial<LearningSignalSnapshot>;
  const insights = (row.insights ?? []) as BensonInsight[];
  return {
    summary: row.summary,
    insights,
    createdAt,
    isStale: ageMs > LEARNING_DISPLAY_STALE_MS,
    noNewLessons: row.summary === NOTHING_NEW_SUMMARY || insights.length === 0,
    signalCounts: signalCounts({
      collectedAt: snapshot.collectedAt ?? createdAt,
      analyticsWindow: snapshot.analyticsWindow ?? 'unknown',
      preferenceEvents: snapshot.preferenceEvents ?? [],
      feedbackEvents: snapshot.feedbackEvents ?? [],
      chatFeedbackEvents: snapshot.chatFeedbackEvents ?? [],
      plannerActions: snapshot.plannerActions ?? [],
      skippedOpportunities: snapshot.skippedOpportunities ?? [],
      passedOpportunities: snapshot.passedOpportunities ?? [],
      topPerformingPosts: snapshot.topPerformingPosts ?? [],
      performanceSignals: snapshot.performanceSignals ?? [],
      timelyOpportunities: snapshot.timelyOpportunities ?? [],
      savedCategories: snapshot.savedCategories ?? [],
      outcomeExecution: snapshot.outcomeExecution ?? [],
      tasteVotes: snapshot.tasteVotes ?? [],
    }),
  };
}

export function isBensonLearningUiEnabled(): boolean {
  return env.BENSON_LEARNING_UI_ENABLED;
}

export async function getLatestLearnings(): Promise<BensonLearningSnapshot | null> {
  if (!isBensonLearningUiEnabled()) return null;
  return getLatestSanitizedLearnings();
}

/** Sanitized learnings for Ask Benson and internal prompts — ignores UI kill switch. */
export async function getLatestLearningsForContext(): Promise<BensonLearningSnapshot | null> {
  return getLatestSanitizedLearnings();
}

async function getLatestSanitizedLearnings(): Promise<BensonLearningSnapshot | null> {
  const suppressions = await loadSuppressionsForLearning();
  const worker = await loadLearningWorkerHeartbeat();
  const rows = await db
    .select()
    .from(bensonLearnings)
    .orderBy(desc(bensonLearnings.createdAt))
    .limit(5);

  for (const row of rows) {
    const candidate = rowToSnapshot(row);
    const sanitized = sanitizeLearningSnapshot(candidate, suppressions);
    if (!sanitized) continue;
    const monetizationCorrected = {
      ...sanitized,
      insights: applyMonetizationFirstCorrections(sanitized.insights, {
        performanceSignals: ((row.signalSnapshot ?? {}) as Partial<LearningSignalSnapshot>)
          .performanceSignals,
      }),
    };

    // Connection truth must come from the live integration, not cached narrative text —
    // strip any "TikTok is stale / reconnect" claim the LLM wrote in the past if TikTok is
    // actually connected and synced now.
    const liveTikTokCtx = await resolveTikTokAnalyticsContext(false).catch(() => null);
    const staleCorrected = liveTikTokCtx
      ? correctTikTokStaleClaims(monetizationCorrected, liveTikTokCtx).snapshot
      : monetizationCorrected;
    const truthCorrected = correctNothingNewContradiction(staleCorrected).snapshot;

    return attachRefreshState(truthCorrected);
  }

  const refresh = deriveRefreshState({
    learningCreatedAt: null,
    workerLastSuccessAt: worker?.lastSuccessAt ?? null,
    workerLastErrorAt: worker?.lastErrorAt ?? null,
  });
  if (refresh.refreshStatus === 'unavailable') {
    return {
      summary: refresh.refreshMessage ?? 'No new reliable learning available.',
      insights: [],
      createdAt: refresh.refreshFailedAt ?? new Date(0).toISOString(),
      isStale: true,
      noNewLessons: true,
      signalCounts: {
        preferences: 0,
        feedback: 0,
        chatFeedback: 0,
        planner: 0,
        skipped: 0,
        passed: 0,
        tasteVotes: 0,
        topPosts: 0,
        performanceSignals: 0,
        timelyOpportunities: 0,
      },
      ...refresh,
    };
  }

  return null;
}

async function loadPreviousInsights(): Promise<BensonInsight[]> {
  const [row] = await db
    .select({ insights: bensonLearnings.insights })
    .from(bensonLearnings)
    .orderBy(desc(bensonLearnings.createdAt))
    .limit(1);
  return (row?.insights ?? []) as BensonInsight[];
}

function stampLastShown(
  insights: BensonInsight[],
  previous: BensonInsight[],
): BensonInsight[] {
  const now = new Date().toISOString();
  return insights.map((lesson) => {
    const prev = previous.find((item) => item.id === lesson.id);
    if (prev && !lesson.materialChangeSinceLastShown) {
      return { ...lesson, lastShownAt: prev.lastShownAt ?? now };
    }
    return { ...lesson, lastShownAt: now };
  });
}

export async function runBensonLearningCycle(): Promise<LearningRunResult> {
  try {
    const gate = await shouldSkipBackgroundLlm('learning');
    if (gate.skip) {
      return { ran: false, reason: gate.reason ?? 'learning_skipped' };
    }

    const signals = await collectLearningSignals();

    if (signalsAreEmpty(signals)) {
      await recordLearningRefreshSuccess();
      return { ran: false, reason: 'no_signals' };
    }

    const sourceHash = hashLearningSignals(signals);

    const [existing] = await db
      .select({ id: bensonLearnings.id })
      .from(bensonLearnings)
      .where(eq(bensonLearnings.sourceHash, sourceHash))
      .limit(1);

    if (existing) {
      await recordLearningRefreshSuccess();
      return { ran: false, reason: 'unchanged_signals', learningId: existing.id };
    }

    const suppressions = await loadSuppressionsForLearning();
    const previousInsights = await loadPreviousInsights();

    let synthesized = await synthesizeLearnings(signals);

    const gated = applyLessonQualityGates({
      summary: synthesized.summary,
      insights: synthesized.insights,
      previousInsights,
      timelyOpportunities: signals.timelyOpportunities,
      suppressions,
      performanceSignals: signals.performanceSignals,
    });

    let finalSummary = gated.summary;
    let finalInsights = stampLastShown(gated.insights, previousInsights);

    if (finalInsights.length === 0) {
      finalSummary = NOTHING_NEW_SUMMARY;
      finalInsights = [];
    }

    if (
      !learningOutputIsClean({
        summary: finalSummary,
        insights: finalInsights,
        suppressions,
      })
    ) {
      await recordLearningRefreshSuccess();
      return { ran: false, reason: 'suppression_contamination' };
    }

    const [row] = await db
      .insert(bensonLearnings)
      .values({
        sourceHash,
        summary: finalSummary,
        insights: finalInsights,
        signalSnapshot: signals,
        tokenUsage: synthesized.tokenUsage,
        estimatedCost: String(synthesized.estimatedCost),
      })
      .returning({ id: bensonLearnings.id });

    console.log(
      `[benson-learning] synthesized ${finalInsights.length} insights (${sourceHash}); blocked=${gated.blockedReasons.length}`,
    );

    try {
      const { emitDataChange } = await import('../data-revision/index.js');
      await emitDataChange({
        eventType: 'learning_cycle',
        domains: ['recommendations', 'home_briefing'],
        completedAt: new Date().toISOString(),
        source: 'benson_learning',
        recordIds: row?.id ? [row.id] : undefined,
        success: true,
      });
    } catch (err) {
      console.warn('[benson-learning] data revision emit failed:', err instanceof Error ? err.message : err);
    }

    await maybeAlertBudgetExceeded();
    await recordLearningRefreshSuccess();

    return { ran: true, reason: finalInsights.length ? 'synthesized' : 'nothing_new', learningId: row?.id };
  } catch (err) {
    await recordLearningRefreshFailure(err);
    throw err;
  }
}

/** Remove persisted learning rows that mention suppressed entities. */
export async function purgeContaminatedLearnings(): Promise<number> {
  const result = await db.execute(sql`
    WITH deleted AS (
      DELETE FROM benson_learnings
      WHERE summary ~* 'maj[- ]?r'
         OR insights::text ~* 'maj[- ]?r'
         OR signal_snapshot::text ~* 'maj[- ]?r'
      RETURNING id
    )
    SELECT count(*)::int AS count FROM deleted
  `);
  const row = (result[0] ?? {}) as { count?: number };
  return row.count ?? 0;
}

export async function regenerateCleanLearnings(): Promise<LearningRunResult> {
  const deleted = await purgeContaminatedLearnings();
  console.log(`[benson-learning] purged ${deleted} contaminated rows`);
  await db.execute(sql`DELETE FROM benson_learnings`);
  return runBensonLearningCycle();
}

export { collectLearningSignals, synthesizeLearnings };
export type { BensonInsight, LearningSignalSnapshot };
export {
  filterLearningSignals,
  learningOutputIsClean,
  sanitizeLearningSnapshot,
  textContainsSuppressedEntity,
} from './suppression.js';
