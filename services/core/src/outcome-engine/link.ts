import { and, desc, eq, gte, inArray, isNotNull, sql } from 'drizzle-orm';
import { db } from '../db.js';
import {
  bensonRecommendationEvents,
  contentItems,
  contentOutcomeLinks,
  contentPerformanceSnapshots,
  creatorDraftAssets,
  creatorVideos,
  plannerItems,
  shootSessions,
  shareIntakeSubmissions,
} from '../schema.js';
import type { OutcomeClassification, PerformanceSnapshotKind } from './types.js';

export type CreateOutcomeLinkInput = {
  contentItemId?: string | null;
  recommendationEventId?: string | null;
  shootSessionId?: string | null;
  intakeSubmissionId?: string | null;
  draftAssetId?: string | null;
  creatorVideoId?: string | null;
  sponsorContactId?: string | null;
  linkConfidence?: number;
  linkSource?: 'auto' | 'manual' | 'backfill';
  metadata?: Record<string, unknown>;
};

export async function createOutcomeLink(input: CreateOutcomeLinkInput) {
  const [row] = await db
    .insert(contentOutcomeLinks)
    .values({
      contentItemId: input.contentItemId ?? null,
      recommendationEventId: input.recommendationEventId ?? null,
      shootSessionId: input.shootSessionId ?? null,
      intakeSubmissionId: input.intakeSubmissionId ?? null,
      draftAssetId: input.draftAssetId ?? null,
      creatorVideoId: input.creatorVideoId ?? null,
      sponsorContactId: input.sponsorContactId ?? null,
      linkConfidence: String(input.linkConfidence ?? 1),
      linkSource: input.linkSource ?? 'auto',
      metadata: input.metadata ?? {},
    })
    .returning();
  if (!row) throw new Error('Failed to create outcome link');
  return row;
}

export async function attachShootToOutcome(shootSessionId: string, outcomeLinkId: string) {
  await db
    .update(shootSessions)
    .set({ outcomeLinkId, updatedAt: new Date() })
    .where(eq(shootSessions.id, shootSessionId));
}

function classifyOutcome(score: number | null, hasPost: boolean, hasShoot: boolean): OutcomeClassification {
  if (score == null) {
    if (!hasShoot && !hasPost) return 'insufficient_data';
    if (hasShoot && !hasPost) return 'failed_execution';
    return 'insufficient_data';
  }
  if (score >= 0.8) return 'high_value';
  if (score >= 0.6) return 'good';
  if (score >= 0.4) return 'neutral';
  if (score >= 0.2) return 'weak';
  return 'failed_execution';
}

function computeEngagementRate(metrics: {
  views: number;
  likes: number;
  comments: number;
  shares: number;
}): number {
  if (metrics.views <= 0) return 0;
  return (metrics.likes + metrics.comments + metrics.shares) / metrics.views;
}

function computeOutcomeScore(input: {
  views: number;
  engagementRate: number;
  hasSponsorValue: boolean;
  revenue: number;
  executed: boolean;
}): number {
  if (!input.executed) return 0.1;
  const viewScore = Math.min(input.views / 50_000, 1) * 0.45;
  const engagementScore = Math.min(input.engagementRate * 20, 1) * 0.25;
  const sponsorScore = input.hasSponsorValue ? 0.2 : 0;
  const revenueScore = Math.min(input.revenue / 1000, 1) * 0.1;
  return Math.min(viewScore + engagementScore + sponsorScore + revenueScore, 1);
}

export async function recordPerformanceSnapshot(
  outcomeLinkId: string,
  kind: PerformanceSnapshotKind,
  metrics: {
    creatorVideoId?: string | null;
    views?: number;
    likes?: number;
    comments?: number;
    shares?: number;
    saves?: number | null;
    followersGained?: number | null;
  },
) {
  const views = metrics.views ?? 0;
  const likes = metrics.likes ?? 0;
  const comments = metrics.comments ?? 0;
  const shares = metrics.shares ?? 0;
  const engagementRate = computeEngagementRate({ views, likes, comments, shares });

  const [snap] = await db
    .insert(contentPerformanceSnapshots)
    .values({
      outcomeLinkId,
      creatorVideoId: metrics.creatorVideoId ?? null,
      snapshotKind: kind,
      views,
      likes,
      comments,
      shares,
      saves: metrics.saves ?? null,
      followersGained: metrics.followersGained ?? null,
      engagementRate: String(engagementRate),
    })
    .returning();

  await recomputeOutcomeScore(outcomeLinkId);
  return snap;
}

export async function recomputeOutcomeScore(outcomeLinkId: string) {
  const [link] = await db
    .select()
    .from(contentOutcomeLinks)
    .where(eq(contentOutcomeLinks.id, outcomeLinkId))
    .limit(1);
  if (!link) return null;

  const snaps = await db
    .select()
    .from(contentPerformanceSnapshots)
    .where(eq(contentPerformanceSnapshots.outcomeLinkId, outcomeLinkId))
    .orderBy(desc(contentPerformanceSnapshots.capturedAt));

  const latest =
    snaps.find((s) => s.snapshotKind === 'latest') ??
    snaps.find((s) => s.snapshotKind === '7d') ??
    snaps.find((s) => s.snapshotKind === '24h') ??
    snaps[0];

  const revenue = link.revenueRecognized ? Number(link.revenueRecognized) : 0;
  const hasSponsorValue = Boolean(link.sponsorContactId || link.pipelineOpportunityId || revenue > 0);
  const views = latest?.views ?? 0;
  const engagementRate = latest?.engagementRate ? Number(latest.engagementRate) : 0;
  const executed = Boolean(link.creatorVideoId || link.draftAssetId);
  const score = computeOutcomeScore({ views, engagementRate, hasSponsorValue, revenue, executed });
  const classification = classifyOutcome(score, Boolean(link.creatorVideoId), Boolean(link.shootSessionId));

  const [updated] = await db
    .update(contentOutcomeLinks)
    .set({
      outcomeScore: String(score),
      outcomeClassification: classification,
      updatedAt: new Date(),
    })
    .where(eq(contentOutcomeLinks.id, outcomeLinkId))
    .returning();
  return updated;
}

export async function findOrCreateOutcomeLinkForContent(contentItemId: string, confidence = 0.9) {
  const [existing] = await db
    .select()
    .from(contentOutcomeLinks)
    .where(eq(contentOutcomeLinks.contentItemId, contentItemId))
    .orderBy(desc(contentOutcomeLinks.createdAt))
    .limit(1);
  if (existing) return existing;
  return createOutcomeLink({ contentItemId, linkConfidence: confidence, linkSource: 'auto' });
}

export async function backfillHistoricalLinks(limit = 200): Promise<{ created: number; uncertain: number }> {
  let created = 0;
  let uncertain = 0;
  const since = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);

  const plannerRows = await db
    .select({
      contentItemId: plannerItems.contentItemId,
      plannerItemId: plannerItems.id,
      status: plannerItems.status,
      updatedAt: plannerItems.updatedAt,
    })
    .from(plannerItems)
    .where(gte(plannerItems.updatedAt, since))
    .orderBy(desc(plannerItems.updatedAt))
    .limit(limit);

  for (const row of plannerRows) {
    if (!row.contentItemId) continue;
    const [existing] = await db
      .select({ id: contentOutcomeLinks.id })
      .from(contentOutcomeLinks)
      .where(eq(contentOutcomeLinks.contentItemId, row.contentItemId))
      .limit(1);
    if (existing) continue;

    const response =
      row.status === 'planned'
        ? 'planned'
        : row.status === 'skipped'
          ? 'skipped'
          : row.status === 'covered'
            ? 'covered'
            : row.status === 'saved' || row.status === 'considering'
              ? 'accepted'
              : null;

    const [rec] = await db
      .insert(bensonRecommendationEvents)
      .values({
        source: 'planner',
        contentItemId: row.contentItemId,
        plannerItemId: row.plannerItemId,
        userResponse: response,
        respondedAt: row.updatedAt,
        metadata: { backfill: true },
      })
      .returning();

    if (!rec) continue;

    const link = await createOutcomeLink({
      contentItemId: row.contentItemId,
      recommendationEventId: rec.id,
      linkConfidence: 0.75,
      linkSource: 'backfill',
      metadata: { backfill: true, plannerStatus: row.status },
    });
    await db
      .update(bensonRecommendationEvents)
      .set({ outcomeLinkId: link.id })
      .where(eq(bensonRecommendationEvents.id, rec.id));
    created += 1;
    uncertain += 1;
  }

  const draftRows = await db
    .select({
      id: creatorDraftAssets.id,
      contentItemId: creatorDraftAssets.linkedOpportunityId,
    })
    .from(creatorDraftAssets)
    .where(isNotNull(creatorDraftAssets.linkedOpportunityId))
    .orderBy(desc(creatorDraftAssets.createdAt))
    .limit(limit);

  for (const draft of draftRows) {
    if (!draft.contentItemId) continue;
    const link = await findOrCreateOutcomeLinkForContent(draft.contentItemId, 0.85);
    if (!link.draftAssetId) {
      await db
        .update(contentOutcomeLinks)
        .set({ draftAssetId: draft.id, updatedAt: new Date() })
        .where(eq(contentOutcomeLinks.id, link.id));
      created += 1;
    }
  }

  const videoRows = await db
    .select({ id: creatorVideos.id, contentItemId: creatorVideos.opportunityId })
    .from(creatorVideos)
    .where(isNotNull(creatorVideos.opportunityId))
    .orderBy(desc(creatorVideos.publishedAt))
    .limit(limit);

  for (const video of videoRows) {
    if (!video.contentItemId) continue;
    const link = await findOrCreateOutcomeLinkForContent(video.contentItemId, 0.9);
    if (!link.creatorVideoId) {
      await db
        .update(contentOutcomeLinks)
        .set({ creatorVideoId: video.id, updatedAt: new Date() })
        .where(eq(contentOutcomeLinks.id, link.id));
      await recomputeOutcomeScore(link.id);
      created += 1;
    }
  }

  return { created, uncertain };
}

export async function listOutcomeLinks(limit = 50) {
  const rows = await db
    .select({
      link: contentOutcomeLinks,
      title: contentItems.topic,
    })
    .from(contentOutcomeLinks)
    .leftJoin(contentItems, eq(contentOutcomeLinks.contentItemId, contentItems.id))
    .orderBy(desc(contentOutcomeLinks.updatedAt))
    .limit(limit);
  return rows;
}

export async function shootsWithoutPosts(limit = 30) {
  return db
    .select({
      shoot: shootSessions,
      title: contentItems.topic,
    })
    .from(shootSessions)
    .leftJoin(contentItems, eq(shootSessions.contentItemId, contentItems.id))
    .leftJoin(contentOutcomeLinks, eq(shootSessions.outcomeLinkId, contentOutcomeLinks.id))
    .where(
      and(
        inArray(shootSessions.status, ['completed', 'partial']),
        sql`(${contentOutcomeLinks.creatorVideoId} IS NULL AND ${contentOutcomeLinks.draftAssetId} IS NULL)`,
      ),
    )
    .orderBy(desc(shootSessions.endedAt))
    .limit(limit);
}

export async function linkIntakeToOutcome(intakeId: string, contentItemId?: string | null) {
  const [intake] = await db
    .select()
    .from(shareIntakeSubmissions)
    .where(eq(shareIntakeSubmissions.id, intakeId))
    .limit(1);
  if (!intake) return null;

  const link = contentItemId
    ? await findOrCreateOutcomeLinkForContent(contentItemId, 0.95)
    : await createOutcomeLink({ intakeSubmissionId: intakeId, linkConfidence: 0.8 });

  if (!link.intakeSubmissionId) {
    await db
      .update(contentOutcomeLinks)
      .set({ intakeSubmissionId: intakeId, updatedAt: new Date() })
      .where(eq(contentOutcomeLinks.id, link.id));
  }
  return link;
}
