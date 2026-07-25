import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import {
  contentItems,
  creatorDraftAssets,
  plannerItems,
  shareIntakeSubmissions,
  tiktokPostPackages,
} from '../schema.js';
import { upsertPlannerItem } from '../content-planner/items.js';
import { promoteIntakeToContentItem } from '../intake/promote.js';
import { recordDraftDecision } from './decisions.js';
import { appendDraftMemory } from './memory.js';
import { buildPostingRecommendation } from './recommendations.js';

const POSTING_ADVICE_STATUSES = [
  'analyzed',
  'needs_review',
  'ready_to_post',
  'hold',
  'revise',
  'scheduled',
] as const;

export async function refreshDraftPostingAdvice(draftId: string): Promise<{
  ok: boolean;
  suggestedPostWindow: string | null;
  postingRecommendation: Record<string, unknown> | null;
} | null> {
  const draft = await db.query.creatorDraftAssets.findFirst({
    where: eq(creatorDraftAssets.id, draftId),
  });
  if (!draft) return null;
  if (!POSTING_ADVICE_STATUSES.includes(draft.status as (typeof POSTING_ADVICE_STATUSES)[number])) {
    return null;
  }

  const postingRec = await buildPostingRecommendation(draft, draft.creatorId);
  await db
    .update(creatorDraftAssets)
    .set({
      postingRecommendationJson: postingRec,
      suggestedPostWindow: postingRec.recommended_time,
      updatedAt: new Date(),
    })
    .where(eq(creatorDraftAssets.id, draftId));

  return {
    ok: true,
    suggestedPostWindow: postingRec.recommended_time,
    postingRecommendation: postingRec as unknown as Record<string, unknown>,
  };
}

export async function createPostPackageFromDraft(draftId: string): Promise<string | null> {
  const draft = await db.query.creatorDraftAssets.findFirst({
    where: eq(creatorDraftAssets.id, draftId),
  });
  if (!draft || draft.linkedPostPackageId) return draft?.linkedPostPackageId ?? null;
  if (!['analyzed', 'ready_to_post', 'needs_review', 'revise', 'scheduled'].includes(draft.status)) {
    return null;
  }

  const rec = draft.postingRecommendationJson as Record<string, unknown> | null;
  const hashtags = Array.isArray(draft.suggestedHashtagsJson)
    ? (draft.suggestedHashtagsJson as string[])
    : ['KansasCity', 'KC', 'kclife'];

  const [pkg] = await db
    .insert(tiktokPostPackages)
    .values({
      creatorId: draft.creatorId,
      platform: 'tiktok',
      relatedContentItemId: draft.linkedOpportunityId,
      hook: draft.hookAssessment ?? draft.draftTitle,
      caption: draft.suggestedCaption ?? draft.overallSummary ?? '',
      hashtags,
      coverText: draft.possibleCoverText,
      firstComment: draft.suggestedFirstComment,
      sponsorAngle: (rec?.sponsor_angle as string) ?? null,
      contentTheme: draft.detectedContentTheme,
      formatLabel: 'unposted_draft',
      reason: (rec?.reason as string) ?? 'Created from an unposted draft Benson watched.',
      checklist: Array.isArray(rec?.required_edits)
        ? (rec.required_edits as string[])
        : ['Review caption', 'Trim hook if needed', 'Post when window opens'],
      shotList: Array.isArray(draft.frameSummariesJson)
        ? (draft.frameSummariesJson as Array<{ label?: string }>).map((f) => f.label ?? '').filter(Boolean)
        : [],
      cta: 'Follow for more KC finds',
      locationBrandNotes: Array.isArray(draft.detectedLocationsJson)
        ? (draft.detectedLocationsJson as string[]).join(', ')
        : null,
      status: 'ready',
      mediaSourceType: 'tiktok_draft',
      temporaryAssetId: draft.id as unknown as undefined,
      handoffMethod: 'manual',
      handoffStatus: 'ready',
      metadata: {
        draftAssetId: draft.id,
        postingRecommendation: rec,
        contextLimitations: draft.contextLimitations,
      },
    })
    .returning({ id: tiktokPostPackages.id });

  if (!pkg) return null;

  await db
    .update(creatorDraftAssets)
    .set({ linkedPostPackageId: pkg.id, updatedAt: new Date() })
    .where(eq(creatorDraftAssets.id, draftId));

  await recordDraftDecision({
    draftAssetId: draftId,
    creatorId: draft.creatorId,
    decisionType: 'post_now',
    decisionSummary: 'Created TikTok post package from draft.',
    decidedBy: 'benson',
    linkedPostPackageId: pkg.id,
    newStatus: 'ready_to_post',
  });

  return pkg.id;
}

export async function linkDraftToOpportunity(
  draftId: string,
  opportunityId: string,
  decidedBy = 'creator',
): Promise<boolean> {
  const draft = await db.query.creatorDraftAssets.findFirst({
    where: eq(creatorDraftAssets.id, draftId),
  });
  if (!draft) return false;

  const opp = await db.query.contentItems.findFirst({
    where: eq(contentItems.id, opportunityId),
  });
  if (!opp) return false;

  await db
    .update(creatorDraftAssets)
    .set({
      linkedOpportunityId: opportunityId,
      opportunityMatchJson: {
        opportunity_id: opportunityId,
        title: opp.topic,
        confidence: 'high',
        reason: 'Linked by creator.',
        needs_confirmation: false,
      },
      updatedAt: new Date(),
    })
    .where(eq(creatorDraftAssets.id, draftId));

  await recordDraftDecision({
    draftAssetId: draftId,
    creatorId: draft.creatorId,
    decisionType: 'link_opportunity',
    decisionSummary: `Linked to opportunity: ${opp.topic}`,
    decidedBy,
    newStatus: draft.status,
  });

  await appendDraftMemory({
    action: 'link_opportunity',
    draftAssetId: draftId,
    summary: `Kellie linked an unposted draft to ${opp.topic}.`,
    via: 'creator',
  });

  return true;
}

export async function addDraftToPlanner(draftId: string, decidedBy = 'creator'): Promise<string | null> {
  const draft = await db.query.creatorDraftAssets.findFirst({
    where: eq(creatorDraftAssets.id, draftId),
  });
  if (!draft) return null;

  let contentItemId = draft.linkedOpportunityId;
  if (!contentItemId && draft.shareIntakeId) {
    const intake = await db.query.shareIntakeSubmissions.findFirst({
      where: eq(shareIntakeSubmissions.id, draft.shareIntakeId),
    });
    if (intake && intake.reviewStatus !== 'approved') {
      const promoted = await promoteIntakeToContentItem(intake, decidedBy);
      if (promoted.ok) contentItemId = promoted.contentItemId;
    } else if (intake?.promotedContentItemId) {
      contentItemId = intake.promotedContentItemId;
    }
  }

  if (!contentItemId) return null;

  await upsertPlannerItem(contentItemId, {
    action: 'plan_this_week',
    notes: draft.overallSummary ?? undefined,
    contentAngle: draft.detectedContentTheme ?? undefined,
    draftCaption: draft.suggestedCaption ?? undefined,
  });

  const [plannerRow] = await db
    .select({ id: plannerItems.id })
    .from(plannerItems)
    .where(eq(plannerItems.contentItemId, contentItemId))
    .limit(1);

  if (!plannerRow) return null;

  await db
    .update(creatorDraftAssets)
    .set({ linkedPlannerItemId: plannerRow.id, updatedAt: new Date() })
    .where(eq(creatorDraftAssets.id, draftId));

  await recordDraftDecision({
    draftAssetId: draftId,
    creatorId: draft.creatorId,
    decisionType: 'add_to_planner',
    decisionSummary: 'Added linked opportunity to planner.',
    decidedBy,
    newStatus: draft.status,
  });

  return plannerRow.id;
}

export async function applyDraftDecisionAction(
  draftId: string,
  action: 'hold' | 'revise' | 'scrap' | 'schedule' | 'mark_posted',
  input?: { reason?: string; scheduledFor?: string; decidedBy?: string },
): Promise<boolean> {
  const draft = await db.query.creatorDraftAssets.findFirst({
    where: eq(creatorDraftAssets.id, draftId),
  });
  if (!draft) return false;

  const decidedBy = input?.decidedBy ?? 'creator';
  const typeMap = {
    hold: 'hold' as const,
    revise: 'revise' as const,
    scrap: 'scrap' as const,
    schedule: 'schedule' as const,
    mark_posted: 'mark_posted' as const,
  };
  const statusMap = {
    hold: 'hold' as const,
    revise: 'revise' as const,
    scrap: 'scrapped' as const,
    schedule: 'scheduled' as const,
    mark_posted: 'posted' as const,
  };

  const summaryMap = {
    hold: 'Kellie decided to hold this draft.',
    revise: 'Benson recommends revising before posting.',
    scrap: 'Draft archived/scrapped.',
    schedule: 'Draft scheduled for posting.',
    mark_posted: 'Draft marked as posted.',
  };

  await recordDraftDecision({
    draftAssetId: draftId,
    creatorId: draft.creatorId,
    decisionType: typeMap[action],
    decisionSummary: summaryMap[action],
    reason: input?.reason,
    decidedBy,
    scheduledFor: input?.scheduledFor ? new Date(input.scheduledFor) : null,
    newStatus: statusMap[action],
  });

  if (action === 'mark_posted') {
    await db
      .update(creatorDraftAssets)
      .set({ postedAt: new Date(), updatedAt: new Date() })
      .where(eq(creatorDraftAssets.id, draftId));
  }

  return true;
}

export async function forgetDraft(draftId: string): Promise<boolean> {
  const [updated] = await db
    .update(creatorDraftAssets)
    .set({
      transcriptText: null,
      transcriptSegmentsJson: null,
      visualSummary: null,
      audioSummary: null,
      overallSummary: 'Draft intelligence removed at creator request.',
      frameSummariesJson: null,
      suggestedCaption: null,
      status: 'scrapped',
      metadata: { forgotten: true },
      updatedAt: new Date(),
    })
    .where(eq(creatorDraftAssets.id, draftId))
    .returning({ id: creatorDraftAssets.id });
  return Boolean(updated);
}
