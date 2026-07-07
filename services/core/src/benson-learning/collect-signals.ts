import { desc, gte, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { db } from '../db.js';
import {
  bensonChatFeedback,
  bensonChatMessages,
  contentItems,
  creatorPreferences,
  plannerItems,
  testerFeedback,
} from '../schema.js';
import { loadVideosWithLatestMetrics } from '../creator-analytics/dashboard.js';
import { filterVideosForDisplay, resolveTikTokAnalyticsContext } from '../creator-analytics/tiktok-context.js';
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
  topPerformingPosts: Array<{
    title: string;
    views: number;
    category: string | null;
    location: string | null;
    publishedAt: string;
  }>;
  savedCategories: string[];
};

export function hashLearningSignals(signals: LearningSignalSnapshot): string {
  return createHash('sha256').update(JSON.stringify(signals)).digest('hex').slice(0, 24);
}

export async function collectLearningSignals(): Promise<LearningSignalSnapshot> {
  const since = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000);

  const [prefRow, feedbackRows, chatFeedbackRows, plannerRows] = await Promise.all([
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
        publishedAt: v.publishedAt,
      }));
  } catch {
    /* optional */
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
    topPerformingPosts,
    savedCategories: [
      ...new Set(plannerRows.map((row) => row.category).filter(Boolean) as string[]),
    ],
  };
}

export function signalsAreEmpty(signals: LearningSignalSnapshot): boolean {
  return (
    signals.preferenceEvents.length === 0 &&
    signals.feedbackEvents.length === 0 &&
    signals.chatFeedbackEvents.length === 0 &&
    signals.plannerActions.length === 0 &&
    signals.topPerformingPosts.length === 0
  );
}
