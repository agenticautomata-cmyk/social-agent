import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db.js';
import { tiktokOperatorBriefings } from '../schema.js';
import { generateOperatorJson } from './ai-helper.js';
import { listRecommendations } from './recommendations.js';
import { listReadyPackages } from './packages.js';
import { resolveOperatorCreatorId } from './resolve-creator.js';
import type { OperatorBriefing, OperatorBriefingAction, OperatorPerformanceSignals } from './types.js';

export async function getLatestBriefing(creatorId?: string): Promise<OperatorBriefing | null> {
  const cid = await resolveOperatorCreatorId(creatorId);
  const [row] = await db
    .select()
    .from(tiktokOperatorBriefings)
    .where(eq(tiktokOperatorBriefings.creatorId, cid))
    .orderBy(desc(tiktokOperatorBriefings.briefingDate), desc(tiktokOperatorBriefings.createdAt))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    period: row.period,
    briefingDate: row.briefingDate,
    summary: row.summary,
    actions: row.actions as OperatorBriefing['actions'],
    createdAt: row.createdAt.toISOString(),
  };
}

export async function generateOperatorBriefing(
  signals: OperatorPerformanceSignals | null,
  creatorId?: string,
): Promise<OperatorBriefing> {
  const cid = await resolveOperatorCreatorId(creatorId);
  const [recs, ready] = await Promise.all([
    listRecommendations(cid, { limit: 12 }),
    listReadyPackages(cid),
  ]);

  const deterministicActions: OperatorBriefingAction[] = recs.slice(0, 5).map((r, i) => ({
    rank: i + 1,
    label: r.title,
    reason: r.explanation,
    recommendationId: r.id,
    href: `/analytics/tiktok/operator?rec=${r.id}`,
  }));

  if (ready[0]) {
    deterministicActions.unshift({
      rank: 1,
      label: 'Ready for TikTok',
      reason: `Prepared package: ${ready[0].contentTheme ?? ready[0].formatLabel ?? 'post ready to hand off'}`,
      postPackageId: ready[0].id,
      href: `/analytics/tiktok/operator?pkg=${ready[0].id}`,
    });
    deterministicActions.forEach((a, idx) => {
      a.rank = idx + 1;
    });
  }

  const ai = await generateOperatorJson<{ summary?: string; actions?: OperatorBriefing['actions'] }>(
    'Write a daily TikTok operator briefing for a creator. Return JSON: summary (2-3 sentences), actions (array of 3-7 items with rank, label, reason). Use plain language like "Do this next".',
    {
      signals,
      topRecommendations: recs.slice(0, 8).map((r) => ({
        title: r.title,
        explanation: r.explanation,
        type: r.recommendationType,
      })),
      readyPackages: ready.length,
    },
    {
      summary: signals
        ? `${signals.outperformingCount} videos beating average · ${signals.needsFollowUpCount} need follow-up · ${ready.length} packages ready for TikTok.`
        : 'Connect TikTok analytics and Benson will turn performance into daily moves.',
      actions: deterministicActions.slice(0, 7),
    },
  );

  const actions = (ai.actions?.length ? ai.actions : deterministicActions).slice(0, 7);
  const today = new Date().toISOString().slice(0, 10);

  const [row] = await db
    .insert(tiktokOperatorBriefings)
    .values({
      creatorId: cid,
      period: 'daily',
      briefingDate: today,
      summary: ai.summary ?? '',
      actions,
      metadata: { generatedAt: new Date().toISOString() },
    })
    .returning();

  return {
    id: row!.id,
    period: row!.period,
    briefingDate: row!.briefingDate,
    summary: row!.summary,
    actions: row!.actions as OperatorBriefing['actions'],
    createdAt: row!.createdAt.toISOString(),
  };
}

export async function getOrGenerateBriefing(
  signals: OperatorPerformanceSignals | null,
  creatorId?: string,
): Promise<OperatorBriefing> {
  const cid = await resolveOperatorCreatorId(creatorId);
  const today = new Date().toISOString().slice(0, 10);
  const [existing] = await db
    .select()
    .from(tiktokOperatorBriefings)
    .where(
      and(
        eq(tiktokOperatorBriefings.creatorId, cid),
        eq(tiktokOperatorBriefings.briefingDate, today),
        eq(tiktokOperatorBriefings.period, 'daily'),
      ),
    )
    .orderBy(desc(tiktokOperatorBriefings.createdAt))
    .limit(1);

  if (existing) {
    return {
      id: existing.id,
      period: existing.period,
      briefingDate: existing.briefingDate,
      summary: existing.summary,
      actions: existing.actions as OperatorBriefing['actions'],
      createdAt: existing.createdAt.toISOString(),
    };
  }

  return generateOperatorBriefing(signals, cid);
}
