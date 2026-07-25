import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../db.js';
import { tiktokOperatorBriefings, creatorDraftAssets } from '../schema.js';
import { generateOperatorJson } from './ai-helper.js';
import { listRecommendations } from './recommendations.js';
import { listReadyPackages } from './packages.js';
import { resolveOperatorCreatorId } from './resolve-creator.js';
import { humanDraftTitle } from '../draft-intelligence/display-title.js';
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
  const [recs, ready, draftRows] = await Promise.all([
    listRecommendations(cid, { limit: 12 }),
    listReadyPackages(cid),
    db
      .select({
        id: creatorDraftAssets.id,
        draftTitle: creatorDraftAssets.draftTitle,
        suggestedCaption: creatorDraftAssets.suggestedCaption,
        overallSummary: creatorDraftAssets.overallSummary,
        hookAssessment: creatorDraftAssets.hookAssessment,
        status: creatorDraftAssets.status,
        readinessScore: creatorDraftAssets.readinessScore,
      })
      .from(creatorDraftAssets)
      .where(
        inArray(creatorDraftAssets.status, [
          'analyzed',
          'needs_review',
          'ready_to_post',
          'revise',
          'scheduled',
        ]),
      )
      .orderBy(desc(creatorDraftAssets.updatedAt))
      .limit(8),
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
  }

  const draftDisplayName = (d: (typeof draftRows)[number]) =>
    humanDraftTitle({
      draftTitle: d.draftTitle,
      suggestedCaption: d.suggestedCaption,
      overallSummary: d.overallSummary,
      hookAssessment: d.hookAssessment,
    }) ?? 'Unposted draft';

  const readyDraft = draftRows.find((d) => d.status === 'ready_to_post');
  if (readyDraft) {
    deterministicActions.unshift({
      rank: 1,
      label: 'Unposted draft ready',
      reason: `${draftDisplayName(readyDraft)} — Benson watched it and thinks you can post.`,
      href: `/drafts/${readyDraft.id}`,
    });
  } else if (draftRows.find((d) => d.status === 'revise')) {
    const revise = draftRows.find((d) => d.status === 'revise')!;
    deterministicActions.unshift({
      rank: 2,
      label: 'Draft needs a better hook',
      reason: `${draftDisplayName(revise)} needs edits before posting`,
      href: `/drafts/${revise.id}`,
    });
  }

  if (draftRows.length > 0) {
    deterministicActions.push({
      rank: deterministicActions.length + 1,
      label: `${draftRows.length} private draft${draftRows.length === 1 ? '' : 's'} analyzed`,
      reason: 'Benson has watched unposted drafts — review before you post in TikTok.',
      href: '/drafts',
    });
  }

  if (deterministicActions.length > 0) {
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
