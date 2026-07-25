import { and, count, desc, eq, gte, isNotNull, sql } from 'drizzle-orm';
import { db } from '../db.js';
import {
  bensonRecommendationEvents,
  contentItems,
  contentOutcomeLinks,
  contentPerformanceSnapshots,
  shootSessions,
} from '../schema.js';
import type { OutcomeAnalyticsSummary } from './types.js';

function pct(num: number, den: number): number | null {
  if (den <= 0) return null;
  return Math.round((num / den) * 1000) / 10;
}

export async function buildOutcomeAnalyticsSummary(
  lookbackDays = 90,
): Promise<OutcomeAnalyticsSummary> {
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  const [recStats] = await db
    .select({
      total: count(),
      accepted: sql<number>`count(*) filter (where ${bensonRecommendationEvents.userResponse} in ('accepted','planned','covered'))`,
      completed: sql<number>`count(*) filter (where ${bensonRecommendationEvents.outcomeLinkId} is not null)`,
    })
    .from(bensonRecommendationEvents)
    .where(gte(bensonRecommendationEvents.createdAt, since));

  const [plannedStats] = await db
    .select({
      planned: count(),
      filmed: sql<number>`count(*) filter (where ${bensonRecommendationEvents.shootSessionId} is not null)`,
    })
    .from(bensonRecommendationEvents)
    .where(
      and(
        gte(bensonRecommendationEvents.createdAt, since),
        eq(bensonRecommendationEvents.userResponse, 'planned'),
      ),
    );

  const [filmedStats] = await db
    .select({
      filmed: count(),
      posted: sql<number>`count(*) filter (where ${contentOutcomeLinks.creatorVideoId} is not null)`,
    })
    .from(contentOutcomeLinks)
    .innerJoin(shootSessions, eq(contentOutcomeLinks.shootSessionId, shootSessions.id))
    .where(gte(shootSessions.startedAt, since));

  const [sponsorStats] = await db
    .select({
      posted: sql<number>`count(*) filter (where ${contentOutcomeLinks.creatorVideoId} is not null)`,
      sponsor: sql<number>`count(*) filter (where ${contentOutcomeLinks.sponsorContactId} is not null or ${contentOutcomeLinks.pipelineOpportunityId} is not null)`,
    })
    .from(contentOutcomeLinks)
    .where(gte(contentOutcomeLinks.createdAt, since));

  const [revenueStats] = await db
    .select({
      total: count(),
      withRevenue: sql<number>`count(*) filter (where coalesce(${contentOutcomeLinks.revenueRecognized}, 0) > 0)`,
    })
    .from(contentOutcomeLinks)
    .where(gte(contentOutcomeLinks.createdAt, since));

  const ignoredCategories = await db
    .select({
      category: bensonRecommendationEvents.category,
      count: count(),
    })
    .from(bensonRecommendationEvents)
    .where(
      and(
        gte(bensonRecommendationEvents.createdAt, since),
        eq(bensonRecommendationEvents.userResponse, 'skipped'),
        isNotNull(bensonRecommendationEvents.category),
      ),
    )
    .groupBy(bensonRecommendationEvents.category)
    .orderBy(desc(count()))
    .limit(8);

  const topViewCategories = await db
    .select({
      category: bensonRecommendationEvents.category,
      avgViews: sql<number>`coalesce(avg(${contentPerformanceSnapshots.views}), 0)`,
      count: count(),
    })
    .from(contentOutcomeLinks)
    .innerJoin(
      bensonRecommendationEvents,
      eq(contentOutcomeLinks.recommendationEventId, bensonRecommendationEvents.id),
    )
    .leftJoin(
      contentPerformanceSnapshots,
      and(
        eq(contentPerformanceSnapshots.outcomeLinkId, contentOutcomeLinks.id),
        eq(contentPerformanceSnapshots.snapshotKind, 'latest'),
      ),
    )
    .where(and(gte(contentOutcomeLinks.createdAt, since), isNotNull(bensonRecommendationEvents.category)))
    .groupBy(bensonRecommendationEvents.category)
    .orderBy(desc(sql`coalesce(avg(${contentPerformanceSnapshots.views}), 0)`))
    .limit(8);

  const topFollowerCategories = await db
    .select({
      category: bensonRecommendationEvents.category,
      avgFollowers: sql<number>`coalesce(avg(${contentPerformanceSnapshots.followersGained}), 0)`,
      count: count(),
    })
    .from(contentOutcomeLinks)
    .innerJoin(
      bensonRecommendationEvents,
      eq(contentOutcomeLinks.recommendationEventId, bensonRecommendationEvents.id),
    )
    .leftJoin(
      contentPerformanceSnapshots,
      and(
        eq(contentPerformanceSnapshots.outcomeLinkId, contentOutcomeLinks.id),
        eq(contentPerformanceSnapshots.snapshotKind, 'latest'),
      ),
    )
    .where(and(gte(contentOutcomeLinks.createdAt, since), isNotNull(bensonRecommendationEvents.category)))
    .groupBy(bensonRecommendationEvents.category)
    .orderBy(desc(sql`coalesce(avg(${contentPerformanceSnapshots.followersGained}), 0)`))
    .limit(8);

  const locationOutcomes = await db
    .select({
      location: shootSessions.locationLabel,
      avgScore: sql<number>`coalesce(avg(${contentOutcomeLinks.outcomeScore}::numeric), 0)`,
      visits: count(),
    })
    .from(shootSessions)
    .leftJoin(contentOutcomeLinks, eq(shootSessions.outcomeLinkId, contentOutcomeLinks.id))
    .where(and(gte(shootSessions.startedAt, since), isNotNull(shootSessions.locationLabel)))
    .groupBy(shootSessions.locationLabel)
    .orderBy(desc(sql`coalesce(avg(${contentOutcomeLinks.outcomeScore}::numeric), 0)`))
    .limit(8);

  const recentOutcomes = await db
    .select({
      id: contentOutcomeLinks.id,
      title: contentItems.topic,
      classification: contentOutcomeLinks.outcomeClassification,
      score: contentOutcomeLinks.outcomeScore,
      linkConfidence: contentOutcomeLinks.linkConfidence,
      views: contentPerformanceSnapshots.views,
    })
    .from(contentOutcomeLinks)
    .leftJoin(contentItems, eq(contentOutcomeLinks.contentItemId, contentItems.id))
    .leftJoin(
      contentPerformanceSnapshots,
      and(
        eq(contentPerformanceSnapshots.outcomeLinkId, contentOutcomeLinks.id),
        eq(contentPerformanceSnapshots.snapshotKind, 'latest'),
      ),
    )
    .orderBy(desc(contentOutcomeLinks.updatedAt))
    .limit(12);

  const totalRecs = Number(recStats?.total ?? 0);
  const accepted = Number(recStats?.accepted ?? 0);
  const completed = Number(recStats?.completed ?? 0);
  const planned = Number(plannedStats?.planned ?? 0);
  const filmedFromPlan = Number(plannedStats?.filmed ?? 0);
  const filmed = Number(filmedStats?.filmed ?? 0);
  const postedFromFilmed = Number(filmedStats?.posted ?? 0);
  const posted = Number(sponsorStats?.posted ?? 0);
  const sponsorLinked = Number(sponsorStats?.sponsor ?? 0);
  const totalLinks = Number(revenueStats?.total ?? 0);
  const withRevenue = Number(revenueStats?.withRevenue ?? 0);

  return {
    acceptanceRate: pct(accepted, totalRecs),
    plannedToFilmedRate: pct(filmedFromPlan, planned),
    filmedToPostedRate: pct(postedFromFilmed, filmed),
    postedToSponsorRate: pct(sponsorLinked, posted),
    recommendationToRevenueRate: pct(withRevenue, totalLinks),
    totalRecommendations: totalRecs,
    completedRecommendations: completed,
    ignoredCategories: ignoredCategories.map((r) => ({
      category: r.category ?? 'unknown',
      count: Number(r.count),
    })),
    topViewCategories: topViewCategories.map((r) => ({
      category: r.category ?? 'unknown',
      avgViews: Math.round(Number(r.avgViews)),
      count: Number(r.count),
    })),
    topFollowerCategories: topFollowerCategories.map((r) => ({
      category: r.category ?? 'unknown',
      avgFollowers: Math.round(Number(r.avgFollowers)),
      count: Number(r.count),
    })),
    locationOutcomes: locationOutcomes.map((r) => ({
      location: r.location ?? 'unknown',
      avgScore: Math.round(Number(r.avgScore) * 100) / 100,
      visits: Number(r.visits),
    })),
    sponsorCategoryOutcomes: [],
    recentOutcomes: recentOutcomes.map((r) => ({
      id: r.id,
      title: r.title ?? 'Untitled',
      classification: r.classification as OutcomeAnalyticsSummary['recentOutcomes'][0]['classification'],
      score: r.score ? Number(r.score) : null,
      linkConfidence: r.linkConfidence ? Number(r.linkConfidence) : 1,
      views: r.views ?? null,
    })),
  };
}

export async function getOutcomeCardSummary() {
  const summary = await buildOutcomeAnalyticsSummary(30);
  return {
    acceptanceRate: summary.acceptanceRate,
    plannedToFilmedRate: summary.plannedToFilmedRate,
    filmedToPostedRate: summary.filmedToPostedRate,
    totalRecommendations: summary.totalRecommendations,
    completedRecommendations: summary.completedRecommendations,
  };
}
