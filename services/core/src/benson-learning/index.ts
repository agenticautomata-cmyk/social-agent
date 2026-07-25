import { desc, eq } from 'drizzle-orm';
import { db } from '../db.js';
import { bensonLearnings } from '../schema.js';
import {
  collectLearningSignals,
  hashLearningSignals,
  signalsAreEmpty,
  type LearningSignalSnapshot,
} from './collect-signals.js';
import { synthesizeLearnings, type BensonInsight } from './synthesize.js';
import { maybeAlertBudgetExceeded, shouldSkipBackgroundLlm } from '../llm-spend/index.js';

export type BensonLearningSnapshot = {
  summary: string;
  insights: BensonInsight[];
  createdAt: string;
  isStale: boolean;
  signalCounts: {
    preferences: number;
    feedback: number;
    chatFeedback: number;
    planner: number;
    skipped: number;
    passed: number;
    topPosts: number;
  };
};

export type LearningRunResult = {
  ran: boolean;
  reason: string;
  learningId?: string;
};

/** Re-synthesize even when signals unchanged — keeps "what Benson learned" rotating. */
export const LEARNING_FORCE_REFRESH_MS = 24 * 60 * 60 * 1000;
export const LEARNING_DISPLAY_STALE_MS = 24 * 60 * 60 * 1000;

function signalCounts(signals: LearningSignalSnapshot) {
  return {
    preferences: signals.preferenceEvents.length,
    feedback: signals.feedbackEvents.length,
    chatFeedback: signals.chatFeedbackEvents.length,
    planner: signals.plannerActions.length,
    skipped: signals.skippedOpportunities.length,
    passed: signals.passedOpportunities.length,
    topPosts: signals.topPerformingPosts.length,
  };
}

export async function getLatestLearnings(): Promise<BensonLearningSnapshot | null> {
  const [row] = await db
    .select()
    .from(bensonLearnings)
    .orderBy(desc(bensonLearnings.createdAt))
    .limit(1);

  if (!row) return null;

  const createdAt = row.createdAt.toISOString();
  const ageMs = Date.now() - row.createdAt.getTime();
  const snapshot = (row.signalSnapshot ?? {}) as Partial<LearningSignalSnapshot>;
  return {
    summary: row.summary,
    insights: (row.insights ?? []) as BensonInsight[],
    createdAt,
    isStale: ageMs > LEARNING_DISPLAY_STALE_MS,
    signalCounts: signalCounts({
      collectedAt: snapshot.collectedAt ?? createdAt,
      preferenceEvents: snapshot.preferenceEvents ?? [],
      feedbackEvents: snapshot.feedbackEvents ?? [],
      chatFeedbackEvents: snapshot.chatFeedbackEvents ?? [],
      plannerActions: snapshot.plannerActions ?? [],
      skippedOpportunities: snapshot.skippedOpportunities ?? [],
      passedOpportunities: snapshot.passedOpportunities ?? [],
      topPerformingPosts: snapshot.topPerformingPosts ?? [],
      savedCategories: snapshot.savedCategories ?? [],
      outcomeExecution: snapshot.outcomeExecution ?? [],
    }),
  };
}

export async function runBensonLearningCycle(): Promise<LearningRunResult> {
  const gate = await shouldSkipBackgroundLlm('learning');
  if (gate.skip) {
    return { ran: false, reason: gate.reason ?? 'learning_skipped' };
  }

  const signals = await collectLearningSignals();

  if (signalsAreEmpty(signals)) {
    return { ran: false, reason: 'no_signals' };
  }

  const sourceHashBase = hashLearningSignals(signals);
  const previous = await getLatestLearnings();
  const previousAgeMs = previous
    ? Date.now() - new Date(previous.createdAt).getTime()
    : Number.POSITIVE_INFINITY;

  const displayStale = previousAgeMs >= LEARNING_DISPLAY_STALE_MS;
  const forceRefresh = previousAgeMs >= LEARNING_FORCE_REFRESH_MS || displayStale;
  const refreshBucket = forceRefresh
    ? Math.floor(Date.now() / LEARNING_FORCE_REFRESH_MS)
    : 0;
  const sourceHash = refreshBucket > 0 ? `${sourceHashBase}:${refreshBucket}` : sourceHashBase;

  const [existing] = await db
    .select({ id: bensonLearnings.id })
    .from(bensonLearnings)
    .where(eq(bensonLearnings.sourceHash, sourceHash))
    .limit(1);

  if (existing && !forceRefresh) {
    return { ran: false, reason: 'unchanged_signals', learningId: existing.id };
  }

  const synthesized = await synthesizeLearnings(signals, previous?.summary ?? null);

  if (existing && forceRefresh) {
    const [row] = await db
      .update(bensonLearnings)
      .set({
        summary: synthesized.summary,
        insights: synthesized.insights,
        signalSnapshot: signals,
        tokenUsage: synthesized.tokenUsage,
        estimatedCost: String(synthesized.estimatedCost),
        createdAt: new Date(),
      })
      .where(eq(bensonLearnings.id, existing.id))
      .returning({ id: bensonLearnings.id });

    console.log(
      `[benson-learning] refreshed ${synthesized.insights.length} insights (${sourceHash})`,
    );

    return { ran: true, reason: 'refreshed_stale', learningId: row?.id };
  }

  const [row] = await db
    .insert(bensonLearnings)
    .values({
      sourceHash,
      summary: synthesized.summary,
      insights: synthesized.insights,
      signalSnapshot: signals,
      tokenUsage: synthesized.tokenUsage,
      estimatedCost: String(synthesized.estimatedCost),
    })
    .returning({ id: bensonLearnings.id });

  console.log(
    `[benson-learning] synthesized ${synthesized.insights.length} insights (${sourceHash})`,
  );

  await maybeAlertBudgetExceeded();

  return { ran: true, reason: 'synthesized', learningId: row?.id };
}

export { collectLearningSignals, synthesizeLearnings };
export type { BensonInsight, LearningSignalSnapshot };
