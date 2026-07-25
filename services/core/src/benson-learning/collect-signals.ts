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
  creatorPreferences,
  plannerItems,
  testerFeedback,
} from '../schema.js';
import { loadVideosWithLatestMetrics } from '../creator-analytics/dashboard.js';
import { filterVideosForDisplay, resolveTikTokAnalyticsContext } from '../creator-analytics/tiktok-context.js';
import { loadPassedOpportunities } from '../creator-preferences/passed-opportunities.js';
import { env } from '../env.js';
import type { PreferenceLogEntry } from '../creator-preferences/index.js';

export type LearningSignalSnapshot = {
  collectedAt: string;
  preferenceEvents: PreferenceLogEntry[];
  feedbackEvents: Array<{
    at: string;
    sentiment: string | null;
    reasonCode: string | null;
    comment: string | null;
    route: string;
  }>;
  chatFeedbackEvents: Array<{
    at: string;
    sentiment: string;
    reasonCode: string | null;
    comment: string | null;
    answerPreview: string;
  }>;
  plannerActions: Array<{
    title: string;
    category: string | null;
    status: string;
    listName: string;
    plannedDate: string | null;
    updatedAt: string;
  }>;
  skippedOpportunities: Array<{
    title: string;
    category: string | null;
    updatedAt: string;
  }>;
  passedOpportunities: Array<{
    phrase: string;
    reason: string;
    at: string;
  }>;
  topPerformingPosts: Array<{
    title: string;
    views: number;
    category: string | null;
    location: string | null;
    publishedAt: string;
  }>;
  savedCategories: string[];
  outcomeExecution: Array<{
    classification: string | null;
    userResponse: string | null;
    category: string | null;
    executed: boolean;
    posted: boolean;
    views: number | null;
    linkConfidence: number;
  }>;
};

export function hashLearningSignals(signals: LearningSignalSnapshot): string {
  return createHash('sha256').update(JSON.stringify(signals)).digest('hex').slice(0, 24);
}

export async function collectLearningSignals(): Promise<LearningSignalSnapshot> {
  const since = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000);

  const [prefRow, feedbackRows, chatFeedbackRows, plannerRows, skippedRows, passedRows] =
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
  ]);

  const preferenceEvents = ((prefRow[0]?.preferenceLog ?? []) as PreferenceLogEntry[])
    .filter((entry) => new Date(entry.at).getTime() >= since.getTime())
    .slice(0, 30);

  let topPerformingPosts: LearningSignalSnapshot['topPerformingPosts'] = [];
  try {
    const tiktokCtx = await resolveTikTokAnalyticsContext(env.DEMO_MODE);
    const videoLoad = await loadVideosWithLatestMetrics('tiktok');
    const displayVideos = filterVideosForDisplay(videoLoad.videos, tiktokCtx);
    topPerformingPosts = [...displayVideos]
      .sort((a, b) => b.views - a.views)
      .slice(0, 6)
      .map((v) => ({
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

  return {
    collectedAt: new Date().toISOString(),
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
    plannerActions: plannerRows.map((row) => ({
      title: row.title.slice(0, 120),
      category: row.category,
      status: row.status,
      listName: row.listName,
      plannedDate: row.plannedDate ?? null,
      updatedAt: row.updatedAt.toISOString(),
    })),
    skippedOpportunities: skippedRows.map((row) => ({
      title: row.title.slice(0, 120),
      category: row.category,
      updatedAt: row.updatedAt.toISOString(),
    })),
    passedOpportunities: passedRows.slice(0, 20),
    topPerformingPosts,
    savedCategories: [
      ...new Set(plannerRows.map((row) => row.category).filter(Boolean) as string[]),
    ],
    outcomeExecution,
  };
}

export function signalsAreEmpty(signals: LearningSignalSnapshot): boolean {
  return (
    signals.preferenceEvents.length === 0 &&
    signals.feedbackEvents.length === 0 &&
    signals.chatFeedbackEvents.length === 0 &&
    signals.plannerActions.length === 0 &&
    signals.skippedOpportunities.length === 0 &&
    signals.passedOpportunities.length === 0 &&
    signals.topPerformingPosts.length === 0 &&
    signals.outcomeExecution.length === 0
  );
}
