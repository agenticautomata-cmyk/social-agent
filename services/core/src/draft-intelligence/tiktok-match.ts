import { and, desc, eq, gte, isNull } from 'drizzle-orm';
import { db } from '../db.js';
import { creatorDraftAssets, creatorVideos } from '../schema.js';
import { recordDraftDecision } from './decisions.js';
import { appendDraftMemory } from './memory.js';

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s#]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 3);
}

function captionSimilarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (!ta.length || !tb.length) return 0;
  const setB = new Set(tb);
  return ta.filter((t) => setB.has(t)).length / Math.max(ta.length, tb.length);
}

export async function matchPublishedVideosToDrafts(creatorId: string): Promise<number> {
  const drafts = await db.query.creatorDraftAssets.findMany({
    where: and(
      eq(creatorDraftAssets.creatorId, creatorId),
      isNull(creatorDraftAssets.linkedTiktokVideoId),
    ),
    orderBy: [desc(creatorDraftAssets.updatedAt)],
    limit: 30,
  });

  if (drafts.length === 0) return 0;

  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const videos = await db
    .select()
    .from(creatorVideos)
    .where(and(eq(creatorVideos.accountId, creatorId), gte(creatorVideos.publishedAt, since)))
    .orderBy(desc(creatorVideos.publishedAt))
    .limit(40);

  let matched = 0;

  for (const draft of drafts) {
    const draftCaption = [draft.suggestedCaption, draft.transcriptText, draft.overallSummary]
      .filter(Boolean)
      .join(' ');
    if (!draftCaption.trim()) continue;

    let best: { videoId: string; score: number } | null = null;
    for (const video of videos) {
      const score = captionSimilarity(draftCaption, video.caption ?? video.title ?? '');
      if (!best || score > best.score) {
        best = { videoId: video.id, score };
      }
    }

    if (!best || best.score < 0.28) continue;

    await db
      .update(creatorDraftAssets)
      .set({
        linkedTiktokVideoId: best.videoId,
        status: 'completed',
        postedAt: new Date(),
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(creatorDraftAssets.id, draft.id));

    await recordDraftDecision({
      draftAssetId: draft.id,
      creatorId: draft.creatorId,
      decisionType: 'mark_posted',
      decisionSummary: 'Matched published TikTok to this draft after sync.',
      decidedBy: 'system',
      newStatus: 'completed',
      metadata: { matchScore: best.score, creatorVideoId: best.videoId },
    });

    await appendDraftMemory({
      action: 'completed',
      draftAssetId: draft.id,
      summary: `Draft "${draft.draftTitle ?? 'untitled'}" appears to have been posted — linked after TikTok sync.`,
      via: 'system',
    });

    matched += 1;
  }

  return matched;
}
