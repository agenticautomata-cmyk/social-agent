import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { db } from '../db.js';
import {
  bensonChatFeedback,
  bensonChatMessages,
  bensonRecommendationEvents,
  contentItems,
  contentOutcomeLinks,
  contentPerformanceSnapshots,
  creatorFeedbackEvents,
  creatorPreferences,
  plannerItems,
  testerFeedback,
} from '../schema.js';
import { loadVideosWithLatestMetrics } from '../creator-analytics/dashboard.js';
import { filterVideosForDisplay, resolveTikTokAnalyticsContext } from '../creator-analytics/tiktok-context.js';
import { loadPassedOpportunities } from '../creator-preferences/passed-opportunities.js';
import { loadActiveSuppressions } from '../creator-agent/entity-suppression.js';
import { getTopScoredOpportunities } from '../opportunity-scoring/index.js';
import { filterLearningSignals } from './suppression.js';
import { buildPerformanceSignals } from './analytics-enrich.js';
import {
  actionWindowLabel,
  isTimelyForLearning,
  lifecycleForLearningFields,
} from './freshness.js';
import { env } from '../env.js';
import type { PreferenceLogEntry } from '../creator-preferences/index.js';
import type { LearningSignalSnapshot } from './types.js';

export type { LearningSignalSnapshot } from './types.js';

const ANALYTICS_WINDOW_DAYS = 45;

const POSITIVE_TASTE_ACTIONS = new Set([
  'interested',
  'more_like_this',
  'save_for_later',
  'plan_visit',
]);

export function hashLearningSignals(signals: LearningSignalSnapshot): string {
  const { collectedAt: _collectedAt, ...stable } = signals;
  return createHash('sha256').update(JSON.stringify(stable)).digest('hex').slice(0, 24);
}

export async function collectLearningSignals(): Promise<LearningSignalSnapshot> {
  const now = new Date();
  const since = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000);
  const analyticsSince = new Date(Date.now() - ANALYTICS_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [prefRow, feedbackRows, chatFeedbackRows, plannerRows, skippedRows, passedRows, tasteVoteRows] =
    await Promise.all([
      db.select().from(creatorPreferences).limit(1),
      db
        .select({
          createdAt: testerFeedback.createdAt,
          sentiment: testerFeedback.sentiment,
          reasonCode: testerFeedback.reasonCode,
          comment: testerFeedback.comment,
          route: testerFeedback.route,
        })
        .from(testerFeedback)
        .where(gte(testerFeedback.createdAt, since))
        .orderBy(desc(testerFeedback.createdAt))
        .limit(40),
      db
        .select({
          createdAt: bensonChatFeedback.updatedAt,
          sentiment: bensonChatFeedback.sentiment,
          reasonCode: bensonChatFeedback.reasonCode,
          comment: bensonChatFeedback.comment,
          answerPreview: bensonChatMessages.message,
        })
        .from(bensonChatFeedback)
        .innerJoin(bensonChatMessages, sql`${bensonChatFeedback.messageId} = ${bensonChatMessages.id}`)
        .where(gte(bensonChatFeedback.updatedAt, since))
        .orderBy(desc(bensonChatFeedback.updatedAt))
        .limit(40),
      db
        .select({
          title: contentItems.topic,
          category: sql<string | null>`${contentItems.metadata}->>'opportunityCategory'`,
          status: plannerItems.status,
          listName: plannerItems.listName,
          plannedDate: plannerItems.plannedDate,
          eventStartsAt: contentItems.eventStartsAt,
          discoveredAt: contentItems.discoveredAt,
          updatedAt: plannerItems.updatedAt,
        })
        .from(plannerItems)
        .innerJoin(contentItems, sql`${plannerItems.contentItemId} = ${contentItems.id}`)
        .where(gte(plannerItems.updatedAt, since))
        .orderBy(desc(plannerItems.updatedAt))
        .limit(30),
      db
        .select({
          title: contentItems.topic,
          category: sql<string | null>`${contentItems.metadata}->>'opportunityCategory'`,
          updatedAt: plannerItems.updatedAt,
        })
        .from(plannerItems)
        .innerJoin(contentItems, sql`${plannerItems.contentItemId} = ${contentItems.id}`)
        .where(and(eq(plannerItems.status, 'skipped'), gte(plannerItems.updatedAt, since)))
        .orderBy(desc(plannerItems.updatedAt))
        .limit(20),
      loadPassedOpportunities(),
      db
        .select({
          action: creatorFeedbackEvents.action,
          createdAt: creatorFeedbackEvents.createdAt,
          sourceScreen: sql<string | null>`${creatorFeedbackEvents.metadata}->>'sourceScreen'`,
          category: sql<string | null>`${contentItems.metadata}->>'opportunityCategory'`,
          title: contentItems.topic,
        })
        .from(creatorFeedbackEvents)
        .leftJoin(contentItems, eq(creatorFeedbackEvents.recordId, contentItems.id))
        .where(
          and(
            eq(creatorFeedbackEvents.recordType, 'content_item'),
            gte(creatorFeedbackEvents.createdAt, since),
          ),
        )
        .orderBy(desc(creatorFeedbackEvents.createdAt))
        .limit(60),
    ]);

  const preferenceEvents = ((prefRow[0]?.preferenceLog ?? []) as PreferenceLogEntry[])
    .filter((entry) => new Date(entry.at).getTime() >= since.getTime())
    .slice(0, 30);

  const skipCategoryCounts = new Map<string, number>();
  for (const row of skippedRows) {
    const cat = row.category ?? 'unknown';
    skipCategoryCounts.set(cat, (skipCategoryCounts.get(cat) ?? 0) + 1);
  }

  let topPerformingPosts: LearningSignalSnapshot['topPerformingPosts'] = [];
  let performanceSignals: LearningSignalSnapshot['performanceSignals'] = [];
  try {
    const tiktokCtx = await resolveTikTokAnalyticsContext(env.DEMO_MODE);
    const videoLoad = await loadVideosWithLatestMetrics('tiktok');
    const displayVideos = filterVideosForDisplay(videoLoad.videos, tiktokCtx);
    const recentVideos = displayVideos.filter(
      (v) => new Date(v.publishedAt).getTime() >= analyticsSince.getTime(),
    );
    performanceSignals = buildPerformanceSignals(recentVideos, now);
    topPerformingPosts = [...recentVideos]
      .sort((a, b) => b.views - a.views)
      .slice(0, 6)
      .map((v) => {
        const baseline =
          recentVideos.length > 0
            ? recentVideos.map((row) => row.views).sort((a, b) => a - b)[
                Math.floor(recentVideos.length / 2)
              ]!
            : v.views;
        const vsBaseline: 'above' | 'at' | 'below' =
          v.views >= baseline * 1.15 ? 'above' : v.views <= baseline * 0.85 ? 'below' : 'at';
        return {
          title: (v.title ?? v.caption ?? 'Untitled').slice(0, 120),
          views: v.views,
          category: v.contentCategory,
          location: v.locationTag,
          publishedAt:
            typeof v.publishedAt === 'string'
              ? v.publishedAt
              : v.publishedAt != null && typeof (v.publishedAt as Date).toISOString === 'function'
                ? (v.publishedAt as Date).toISOString()
                : String(v.publishedAt ?? ''),
          performanceIndex: v.performanceIndex ?? 1,
          engagementRate: v.engagementRate ?? 0,
          vsBaseline,
        };
      });
  } catch {
    /* optional */
  }

  let timelyOpportunities: LearningSignalSnapshot['timelyOpportunities'] = [];
  try {
    const topOpps = await getTopScoredOpportunities({ limit: 12 });
    timelyOpportunities = topOpps
      .filter((opp) =>
        isTimelyForLearning({
          title: opp.title,
          eventStartsAt: opp.eventDate,
          category: opp.category,
          now,
        }),
      )
      .map((opp) => ({
        id: opp.id,
        title: opp.title,
        category: opp.category,
        eventDate: opp.eventDate,
        lifecycleStatus: lifecycleForLearningFields({
          title: opp.title,
          eventStartsAt: opp.eventDate,
          category: opp.category,
        }),
        composite: opp.composite,
        actionWindow: actionWindowLabel(opp.eventDate, now),
      }));
  } catch {
    /* optional */
  }

  let outcomeExecution: LearningSignalSnapshot['outcomeExecution'] = [];
  try {
    const rows = await db
      .select({
        classification: contentOutcomeLinks.outcomeClassification,
        userResponse: bensonRecommendationEvents.userResponse,
        category: bensonRecommendationEvents.category,
        creatorVideoId: contentOutcomeLinks.creatorVideoId,
        draftAssetId: contentOutcomeLinks.draftAssetId,
        shootSessionId: contentOutcomeLinks.shootSessionId,
        linkConfidence: contentOutcomeLinks.linkConfidence,
        views: contentPerformanceSnapshots.views,
      })
      .from(contentOutcomeLinks)
      .leftJoin(
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
      .orderBy(desc(contentOutcomeLinks.updatedAt))
      .limit(40);

    outcomeExecution = rows.map((row) => ({
      classification: row.classification,
      userResponse: row.userResponse,
      category: row.category,
      executed: Boolean(row.shootSessionId || row.draftAssetId),
      posted: Boolean(row.creatorVideoId),
      views: row.views ?? null,
      linkConfidence: row.linkConfidence ? Number(row.linkConfidence) : 1,
    }));
  } catch {
    /* migration may not be applied yet */
  }

  return filterLearningSignals(
    {
      collectedAt: now.toISOString(),
      analyticsWindow: `last ${ANALYTICS_WINDOW_DAYS} days`,
      preferenceEvents,
      feedbackEvents: feedbackRows.map((row) => ({
        at: row.createdAt.toISOString(),
        sentiment: row.sentiment,
        reasonCode: row.reasonCode,
        comment: row.comment?.slice(0, 200) ?? null,
        route: row.route,
      })),
      chatFeedbackEvents: chatFeedbackRows.map((row) => ({
        at: row.createdAt.toISOString(),
        sentiment: row.sentiment,
        reasonCode: row.reasonCode,
        comment: row.comment?.slice(0, 200) ?? null,
        answerPreview: row.answerPreview.slice(0, 160),
      })),
      plannerActions: plannerRows
        .filter((row) =>
          isTimelyForLearning({
            title: row.title,
            eventStartsAt: row.eventStartsAt,
            discoveredAt: row.discoveredAt,
            category: row.category,
            now,
          }),
        )
        .map((row) => ({
          title: row.title.slice(0, 120),
          category: row.category,
          status: row.status,
          listName: row.listName,
          plannedDate: row.plannedDate ?? null,
          eventDate: row.eventStartsAt?.toISOString() ?? null,
          lifecycleStatus: lifecycleForLearningFields({
            title: row.title,
            eventStartsAt: row.eventStartsAt,
            discoveredAt: row.discoveredAt,
            category: row.category,
          }),
          updatedAt: row.updatedAt.toISOString(),
        })),
      skippedOpportunities: skippedRows.map((row) => ({
        title: row.title.slice(0, 120),
        category: row.category,
        updatedAt: row.updatedAt.toISOString(),
        sampleSize: skipCategoryCounts.get(row.category ?? 'unknown') ?? 1,
      })),
      passedOpportunities: passedRows.slice(0, 20),
      topPerformingPosts,
      performanceSignals,
      timelyOpportunities,
      savedCategories: [
        ...new Set(plannerRows.map((row) => row.category).filter(Boolean) as string[]),
      ],
      outcomeExecution,
      tasteVotes: tasteVoteRows.map((row) => ({
        action: row.action,
        category: row.category,
        at: row.createdAt.toISOString(),
        sourceScreen: row.sourceScreen,
        titleHint: POSITIVE_TASTE_ACTIONS.has(row.action) ? row.title?.slice(0, 80) ?? null : null,
      })),
    },
    await loadActiveSuppressions(),
  );
}

export function signalsAreEmpty(signals: LearningSignalSnapshot): boolean {
  return (
    signals.preferenceEvents.length === 0 &&
    signals.feedbackEvents.length === 0 &&
    signals.chatFeedbackEvents.length === 0 &&
    signals.plannerActions.length === 0 &&
    signals.skippedOpportunities.length === 0 &&
    signals.passedOpportunities.length === 0 &&
    signals.tasteVotes.length === 0 &&
    signals.topPerformingPosts.length === 0 &&
    signals.performanceSignals.length === 0 &&
    signals.outcomeExecution.length === 0
  );
}
