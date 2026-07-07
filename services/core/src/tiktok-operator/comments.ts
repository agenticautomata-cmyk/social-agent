import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../db.js';
import { tiktokCommentInsights, tiktokPostPackages } from '../schema.js';
import { generateOperatorJson } from './ai-helper.js';
import { hasHighCommentVelocity, loadAccountBaselines } from './metrics.js';
import { getPostPackage, preparePostPackage } from './packages.js';
import { resolveOperatorCreatorId } from './resolve-creator.js';
import type { CommentInsightRow } from './types.js';

function mapInsight(row: typeof tiktokCommentInsights.$inferSelect): CommentInsightRow {
  return {
    id: row.id,
    creatorId: row.creatorId,
    platform: row.platform,
    sourceVideoId: row.sourceVideoId,
    creatorVideoId: row.creatorVideoId,
    commentText: row.commentText,
    clusterSummary: row.clusterSummary,
    insightType: row.insightType,
    frequency: row.frequency,
    recommendation: row.recommendation,
    postPackageId: row.postPackageId,
    status: row.status,
    metadata: row.metadata as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    handledAt: row.handledAt?.toISOString() ?? null,
  };
}

const COMMENT_PATTERNS: Array<{
  type: CommentInsightRow['insightType'];
  keywords: string[];
  summary: string;
  recommendation: string;
}> = [
  {
    type: 'sizing_price_where_to_buy',
    keywords: ['size', 'price', 'how much', 'where', 'buy', 'link'],
    summary: 'Sizing, price, or where-to-buy questions',
    recommendation: 'Reply with a quick FAQ video or pinned comment with details.',
  },
  {
    type: 'location_request',
    keywords: ['address', 'location', 'where is', 'what store', 'which'],
    summary: 'Location and store requests',
    recommendation: 'Film a map-style reply or list locations in a follow-up.',
  },
  {
    type: 'sequel_suggestion',
    keywords: ['part 2', 'sequel', 'more', 'again', 'another'],
    summary: 'Audience wants a sequel',
    recommendation: 'Make a part-two while interest is high.',
  },
  {
    type: 'reply_video_worthy',
    keywords: ['?', 'how', 'why', 'can you', 'show'],
    summary: 'Questions that deserve an on-camera reply',
    recommendation: 'Short reply video with direct answer as the hook.',
  },
];

function inferInsightsFromVideo(video: {
  id: string;
  videoId: string;
  title: string | null;
  caption: string | null;
  comments: number;
  contentCategory: string | null;
}): Array<Omit<typeof tiktokCommentInsights.$inferInsert, 'creatorId'>> {
  const text = `${video.title ?? ''} ${video.caption ?? ''}`.toLowerCase();
  const results: Array<Omit<typeof tiktokCommentInsights.$inferInsert, 'creatorId'>> = [];

  for (const pattern of COMMENT_PATTERNS) {
    if (pattern.keywords.some((k) => text.includes(k)) || video.comments >= 20) {
      results.push({
        platform: 'tiktok',
        sourceVideoId: video.videoId,
        creatorVideoId: video.id,
        clusterSummary: pattern.summary,
        insightType: pattern.type,
        frequency: Math.max(1, Math.round(video.comments / 5)),
        recommendation: pattern.recommendation,
        commentText: null,
        status: 'new',
        metadata: { inferred: true, commentDataAvailable: false },
      });
      break;
    }
  }

  if (results.length === 0 && video.comments >= 15) {
    results.push({
      platform: 'tiktok',
      sourceVideoId: video.videoId,
      creatorVideoId: video.id,
      clusterSummary: 'High comment volume — review TikTok comments for reply opportunities',
      insightType: 'reply_video_worthy',
      frequency: video.comments,
      recommendation: 'Scan comments for repeated questions and film a reply video.',
      status: 'new',
      metadata: { inferred: true, commentDataAvailable: false },
    });
  }

  return results;
}

export async function listCommentInsights(creatorId?: string): Promise<CommentInsightRow[]> {
  const cid = await resolveOperatorCreatorId(creatorId);
  const rows = await db
    .select()
    .from(tiktokCommentInsights)
    .where(
      and(
        eq(tiktokCommentInsights.creatorId, cid),
        inArray(tiktokCommentInsights.status, ['new', 'actioned']),
      ),
    )
    .orderBy(desc(tiktokCommentInsights.createdAt))
    .limit(30);
  return rows.map(mapInsight);
}

export async function refreshCommentInsights(creatorId?: string): Promise<number> {
  const cid = await resolveOperatorCreatorId(creatorId);
  const baselines = await loadAccountBaselines();

  const existing = await db
    .select({ sourceVideoId: tiktokCommentInsights.sourceVideoId, insightType: tiktokCommentInsights.insightType })
    .from(tiktokCommentInsights)
    .where(
      and(
        eq(tiktokCommentInsights.creatorId, cid),
        inArray(tiktokCommentInsights.status, ['new', 'actioned']),
      ),
    );
  const keys = new Set(existing.map((e) => `${e.sourceVideoId}:${e.insightType}`));

  const inserts: Array<typeof tiktokCommentInsights.$inferInsert> = [];
  for (const video of baselines.videos) {
    if (!hasHighCommentVelocity(video, baselines)) continue;
    for (const insight of inferInsightsFromVideo(video)) {
      const key = `${video.videoId}:${insight.insightType}`;
      if (keys.has(key)) continue;
      inserts.push({ creatorId: cid, ...insight });
      keys.add(key);
    }
  }

  if (inserts.length === 0) return 0;
  await db.insert(tiktokCommentInsights).values(inserts);
  return inserts.length;
}

export async function updateCommentInsightStatus(
  id: string,
  status: CommentInsightRow['status'],
): Promise<CommentInsightRow | null> {
  const patch: Partial<typeof tiktokCommentInsights.$inferInsert> = {
    status,
    updatedAt: new Date(),
  };
  if (status === 'handled' || status === 'dismissed') patch.handledAt = new Date();

  const [row] = await db
    .update(tiktokCommentInsights)
    .set(patch)
    .where(eq(tiktokCommentInsights.id, id))
    .returning();
  return row ? mapInsight(row) : null;
}

export async function createReplyVideoPackage(insightId: string, creatorId?: string) {
  const [insight] = await db
    .select()
    .from(tiktokCommentInsights)
    .where(eq(tiktokCommentInsights.id, insightId))
    .limit(1);
  if (!insight) throw new Error('Comment insight not found');

  const baselines = await loadAccountBaselines();
  const video = baselines.videos.find((v) => v.id === insight.creatorVideoId);

  const ai = await generateOperatorJson<{
    replyHook?: string;
    caption?: string;
    hashtags?: string[];
    coverText?: string;
    openingLine?: string;
    talkingPoints?: string[];
    cta?: string;
  }>(
    'Create a TikTok reply-video package from a comment insight. Return JSON: replyHook, caption, hashtags, coverText, openingLine, talkingPoints (array), cta.',
    {
      insight: {
        summary: insight.clusterSummary,
        recommendation: insight.recommendation,
        type: insight.insightType,
      },
      sourceVideo: video
        ? { title: video.title, caption: video.caption, comments: video.comments }
        : null,
    },
    {
      replyHook: insight.clusterSummary ?? 'Answering your top question',
      caption: insight.recommendation,
      hashtags: ['KansasCity', 'KC', 'reply'],
      coverText: 'Reply',
      openingLine: 'You asked — here is the answer',
      talkingPoints: ['Acknowledge the question', 'Give the answer', 'CTA'],
      cta: 'Comment if you want part 2',
    },
  );

  const pkg = await preparePostPackage(
    {
      creatorVideoId: insight.creatorVideoId ?? undefined,
      contentTheme: video?.contentCategory ?? undefined,
      formatLabel: 'reply_video',
      reason: insight.recommendation,
      replyInsightId: insightId,
    },
    creatorId,
  );

  await db
    .update(tiktokPostPackages)
    .set({
      hook: ai.replyHook ?? ai.openingLine ?? pkg.hook,
      caption: ai.caption ?? pkg.caption,
      hashtags: ai.hashtags ?? pkg.hashtags,
      coverText: ai.coverText ?? pkg.coverText,
      shotList: ai.talkingPoints ?? pkg.shotList,
      cta: ai.cta ?? pkg.cta,
      metadata: {
        ...pkg.metadata,
        openingLine: ai.openingLine,
        replyInsightId: insightId,
      },
      updatedAt: new Date(),
    })
    .where(eq(tiktokPostPackages.id, pkg.id));

  await db
    .update(tiktokCommentInsights)
    .set({
      postPackageId: pkg.id,
      status: 'actioned',
      updatedAt: new Date(),
    })
    .where(eq(tiktokCommentInsights.id, insightId));

  const updated = await getPostPackage(pkg.id);
  if (!updated) throw new Error('Package not found after update');
  return updated;
}
