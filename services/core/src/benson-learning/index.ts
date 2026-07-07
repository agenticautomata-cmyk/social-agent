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

export type BensonLearningSnapshot = {
  summary: string;
  insights: BensonInsight[];
  createdAt: string;
  signalCounts: {
    preferences: number;
    feedback: number;
    chatFeedback: number;
    planner: number;
    topPosts: number;
  };
};

export type LearningRunResult = {
  ran: boolean;
  reason: string;
  learningId?: string;
};

function signalCounts(signals: LearningSignalSnapshot) {
  return {
    preferences: signals.preferenceEvents.length,
    feedback: signals.feedbackEvents.length,
    chatFeedback: signals.chatFeedbackEvents.length,
    planner: signals.plannerActions.length,
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

  const snapshot = (row.signalSnapshot ?? {}) as Partial<LearningSignalSnapshot>;
  return {
    summary: row.summary,
    insights: (row.insights ?? []) as BensonInsight[],
    createdAt: row.createdAt.toISOString(),
    signalCounts: signalCounts({
      collectedAt: snapshot.collectedAt ?? row.createdAt.toISOString(),
      preferenceEvents: snapshot.preferenceEvents ?? [],
      feedbackEvents: snapshot.feedbackEvents ?? [],
      chatFeedbackEvents: snapshot.chatFeedbackEvents ?? [],
      plannerActions: snapshot.plannerActions ?? [],
      topPerformingPosts: snapshot.topPerformingPosts ?? [],
      savedCategories: snapshot.savedCategories ?? [],
    }),
  };
}

export async function runBensonLearningCycle(): Promise<LearningRunResult> {
  const signals = await collectLearningSignals();

  if (signalsAreEmpty(signals)) {
    return { ran: false, reason: 'no_signals' };
  }

  const sourceHash = hashLearningSignals(signals);
  const [existing] = await db
    .select({ id: bensonLearnings.id })
    .from(bensonLearnings)
    .where(eq(bensonLearnings.sourceHash, sourceHash))
    .limit(1);

  if (existing) {
    return { ran: false, reason: 'unchanged_signals', learningId: existing.id };
  }

  const previous = await getLatestLearnings();
  const synthesized = await synthesizeLearnings(signals, previous?.summary ?? null);

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

  return { ran: true, reason: 'synthesized', learningId: row?.id };
}

export { collectLearningSignals, synthesizeLearnings };
export type { BensonInsight, LearningSignalSnapshot };
