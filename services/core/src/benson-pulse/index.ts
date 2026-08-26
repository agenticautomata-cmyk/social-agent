// Benson pulse — polls TikTok on an interval, detects meaningful metric changes,
// and pre-computes an in-voice progress brief via OpenAI so chat/greetings can
// reference fresh numbers ("that post from last night is already at 4.2k").

import { createHash } from 'node:crypto';
import OpenAI from 'openai';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db.js';
import { bensonProgressBriefs } from '../schema.js';
import { env } from '../env.js';
import { runCreatorAnalyticsSync } from '../creator-analytics-sync/index.js';
import { loadVideosWithLatestMetrics } from '../creator-analytics/dashboard.js';
import {
  filterVideosForDisplay,
  resolveTikTokAnalyticsContext,
} from '../creator-analytics/tiktok-context.js';
import { BENSON_PERSONALITY_CORE } from '../benson-personality/index.js';
import { withOpenAiRetry } from '../openai-retry.js';
import { formatIsoDateTime, getCreatorTimezone } from '../datetime.js';

const BRIEF_MODEL = env.BENSON_ASK_MODEL;
const INPUT_COST_PER_M = 0.15;
const OUTPUT_COST_PER_M = 0.6;

const BriefSchema = z.object({
  headline: z.string(),
  progressSummary: z.string(),
  whatChanged: z.array(z.string()).default([]),
  suggestedNextStep: z.string().nullable().optional(),
});

export type ProgressBrief = z.infer<typeof BriefSchema> & {
  createdAt: string;
  dataThrough: string | null;
};

type VideoSnapshot = {
  videoId: string;
  title: string;
  views: number;
  likes: number;
  comments: number;
  publishedAt: string;
};

type PulseSnapshot = {
  totalVideos: number;
  totalViews: number;
  followers: number | null;
  recentVideos: VideoSnapshot[];
  capturedAt: string;
};

export type PulseDelta = {
  firstRun: boolean;
  newVideos: VideoSnapshot[];
  viewChanges: Array<{
    videoId: string;
    title: string;
    previousViews: number;
    currentViews: number;
    change: number;
    changePct: number;
  }>;
  totalViewsChange: number;
  followersChange: number | null;
};

export type PulseRunResult = {
  ok: boolean;
  synced: boolean;
  syncError: string | null;
  changed: boolean;
  briefGenerated: boolean;
  reason: string;
  briefId?: string;
};

function snapshotHash(snapshot: PulseSnapshot): string {
  const stable = {
    totalVideos: snapshot.totalVideos,
    totalViews: snapshot.totalViews,
    followers: snapshot.followers,
    videos: snapshot.recentVideos.map((v) => `${v.videoId}:${v.views}:${v.likes}:${v.comments}`),
  };
  return createHash('sha256').update(JSON.stringify(stable)).digest('hex').slice(0, 16);
}

async function buildSnapshot(): Promise<{
  snapshot: PulseSnapshot;
  accountId: string;
} | null> {
  const [tiktokCtx, videoLoad] = await Promise.all([
    resolveTikTokAnalyticsContext(env.DEMO_MODE),
    loadVideosWithLatestMetrics('tiktok'),
  ]);
  if (!videoLoad.account) return null;

  const videos = filterVideosForDisplay(videoLoad.videos, tiktokCtx);
  const recent = [...videos]
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, 15)
    .map((v) => ({
      videoId: v.videoId,
      title: v.title ?? v.caption ?? 'Untitled',
      views: v.views,
      likes: v.likes,
      comments: v.comments,
      publishedAt: v.publishedAt,
    }));

  return {
    accountId: videoLoad.account.id,
    snapshot: {
      totalVideos: videos.length,
      totalViews: videos.reduce((sum, v) => sum + v.views, 0),
      followers: tiktokCtx.followersCount,
      recentVideos: recent,
      capturedAt: new Date().toISOString(),
    },
  };
}

function computeDelta(previous: PulseSnapshot | null, current: PulseSnapshot): PulseDelta {
  if (!previous) {
    return {
      firstRun: true,
      newVideos: current.recentVideos.slice(0, 3),
      viewChanges: [],
      totalViewsChange: 0,
      followersChange: null,
    };
  }

  const prevById = new Map(previous.recentVideos.map((v) => [v.videoId, v]));
  const newVideos = current.recentVideos.filter((v) => !prevById.has(v.videoId));
  const viewChanges = current.recentVideos
    .filter((v) => prevById.has(v.videoId))
    .map((v) => {
      const prev = prevById.get(v.videoId)!;
      const change = v.views - prev.views;
      return {
        videoId: v.videoId,
        title: v.title,
        previousViews: prev.views,
        currentViews: v.views,
        change,
        changePct: prev.views > 0 ? Math.round((change / prev.views) * 1000) / 10 : 0,
      };
    })
    .filter((c) => c.change !== 0)
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

  return {
    firstRun: false,
    newVideos,
    viewChanges,
    totalViewsChange: current.totalViews - previous.totalViews,
    followersChange:
      previous.followers != null && current.followers != null
        ? current.followers - previous.followers
        : null,
  };
}

function isMeaningfulChange(delta: PulseDelta): boolean {
  if (delta.firstRun) return true;
  if (delta.newVideos.length > 0) return true;
  if (Math.abs(delta.totalViewsChange) >= 100) return true;
  if (delta.followersChange != null && Math.abs(delta.followersChange) >= 5) return true;
  return delta.viewChanges.some((c) => Math.abs(c.change) >= 100 || Math.abs(c.changePct) >= 3);
}

async function shouldGenerateReconnectBrief(
  accountId: string,
  tiktokCtx: Awaited<ReturnType<typeof resolveTikTokAnalyticsContext>>,
): Promise<boolean> {
  if (!tiktokCtx.connected || tiktokCtx.connectionStatus !== 'connected') return false;
  if (!tiktokCtx.connectedAt) return false;

  const connectedAt = new Date(tiktokCtx.connectedAt);
  if (Date.now() - connectedAt.getTime() > 7 * 24 * 60 * 60 * 1000) return false;

  const previous = await latestBriefRow(accountId);
  if (!previous) return true;
  return previous.createdAt < connectedAt;
}

async function generateBrief(input: {
  snapshot: PulseSnapshot;
  delta: PulseDelta;
  reconnectBrief?: boolean;
}): Promise<{
  brief: z.infer<typeof BriefSchema>;
  tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number; model: string };
  estimatedCost: number;
}> {
  if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required for progress briefs');

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const response = await withOpenAiRetry(
    () =>
      client.chat.completions.create({
        model: BRIEF_MODEL,
        response_format: { type: 'json_object' },
        temperature: 0.8,
        max_tokens: 500,
        messages: [
          {
            role: 'system',
            content: `${BENSON_PERSONALITY_CORE}

TASK: You just synced fresh TikTok data. Write a short progress brief about what changed since the last check, in Benson's voice. Be specific with numbers from the delta. Do not invent data.

If delta.firstRun is true, this is the BASELINE check — describe the current state of her account ("here's where things stand") and do NOT claim anything is "new" or "since the last check".

If reconnectBrief is true, TikTok was just reconnected — describe the live account baseline (video count, total views, recent titles). Do not invent metric deltas that are not in the delta object.

Today is ${formatIsoDateTime(new Date().toISOString(), getCreatorTimezone())}. Do not suggest attending events, deadlines, or follow-ups that are already in the past. KC World Cup tournament matches ended — do not pitch World Cup or visitor-economy soccer angles; focus on what is current in KC right now. If data looks old, tell Kellie to tap Check now for a fresh sync instead of acting on stale numbers.

Respond with strict JSON:
{
  "headline": string,          // one punchy Benson line about the most notable change
  "progressSummary": string,   // 2-4 sentences, cite real numbers
  "whatChanged": string[],     // 1-5 specific bullet facts with numbers
  "suggestedNextStep": string | null
}`,
          },
          {
            role: 'user',
            content: JSON.stringify({
              delta: input.delta,
              reconnectBrief: input.reconnectBrief ?? false,
              currentSnapshot: {
                totalVideos: input.snapshot.totalVideos,
                totalViews: input.snapshot.totalViews,
                followers: input.snapshot.followers,
                mostRecentVideos: input.snapshot.recentVideos.slice(0, 5),
              },
            }),
          },
        ],
      }),
    { label: 'benson-pulse' },
  );

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned empty progress brief');
  const brief = BriefSchema.parse(JSON.parse(content));
  const tokenUsage = {
    promptTokens: response.usage?.prompt_tokens ?? 0,
    completionTokens: response.usage?.completion_tokens ?? 0,
    totalTokens: response.usage?.total_tokens ?? 0,
    model: BRIEF_MODEL,
  };
  const estimatedCost =
    (tokenUsage.promptTokens / 1_000_000) * INPUT_COST_PER_M +
    (tokenUsage.completionTokens / 1_000_000) * OUTPUT_COST_PER_M;
  return { brief, tokenUsage, estimatedCost };
}

async function latestBriefRow(creatorId: string) {
  const [row] = await db
    .select()
    .from(bensonProgressBriefs)
    .where(eq(bensonProgressBriefs.creatorId, creatorId))
    .orderBy(desc(bensonProgressBriefs.createdAt))
    .limit(1);
  return row ?? null;
}

export async function runTikTokPulse(options?: { skipSync?: boolean }): Promise<PulseRunResult> {
  let synced = false;
  let syncError: string | null = null;
  if (!options?.skipSync) {
    try {
      const syncResult = await runCreatorAnalyticsSync({
        providers: ['tiktok'],
        trigger: 'scheduled',
      });
      const tiktok = syncResult.results.find((r) => r.provider === 'tiktok');
      if (tiktok?.ok && !tiktok.skipped) {
        synced = true;
      } else {
        syncError = tiktok?.error ?? tiktok?.reason ?? 'sync_skipped_or_failed';
        console.warn('[benson-pulse] tiktok sync not ok:', syncError);
      }
    } catch (err) {
      syncError = err instanceof Error ? err.message : String(err);
      console.warn('[benson-pulse] tiktok sync skipped:', syncError);
    }
  }

  try {
    const tiktokCtx = await resolveTikTokAnalyticsContext(env.DEMO_MODE);
    const {
      checkFollowers10000Milestone,
      checkViews1000000Milestone,
      resolveTikTokTotalViews,
    } = await import('../push-notifications/milestones.js');
    const milestone = await checkFollowers10000Milestone(tiktokCtx.followersCount);
    if (milestone.triggered) {
      console.log(
        `[benson-pulse] 10K followers milestone — push=${milestone.pushSent ? 'yes' : 'no'} telegram=${milestone.telegramSent ? 'yes' : 'no'}`,
      );
    }
    const totalViews = await resolveTikTokTotalViews();
    const viewsMilestone = await checkViews1000000Milestone(totalViews);
    if (viewsMilestone.triggered) {
      console.log(
        `[benson-pulse] 1M views milestone — push=${viewsMilestone.pushSent ? 'yes' : 'no'} telegram=${viewsMilestone.telegramSent ? 'yes' : 'no'}`,
      );
    }
  } catch (err) {
    console.warn(
      '[benson-pulse] milestone check failed:',
      err instanceof Error ? err.message : err,
    );
  }

  const built = await buildSnapshot();
  if (!built) {
    return {
      ok: false,
      synced,
      syncError,
      changed: false,
      briefGenerated: false,
      reason: 'no_tiktok_account',
    };
  }

  const { snapshot, accountId } = built;
  const hash = snapshotHash(snapshot);
  const previous = await latestBriefRow(accountId);
  const tiktokCtx = await resolveTikTokAnalyticsContext(env.DEMO_MODE);
  const reconnectBrief = await shouldGenerateReconnectBrief(accountId, tiktokCtx);

  if (previous && previous.snapshotHash === hash && !reconnectBrief) {
    return { ok: true, synced, syncError, changed: false, briefGenerated: false, reason: 'no_change' };
  }

  const previousSnapshot = (previous?.snapshot ?? null) as PulseSnapshot | null;
  const delta = computeDelta(previousSnapshot, snapshot);

  if (!isMeaningfulChange(delta) && !reconnectBrief) {
    return {
      ok: true,
      synced,
      syncError,
      changed: false,
      briefGenerated: false,
      reason: 'change_below_threshold',
    };
  }

  const { brief, tokenUsage, estimatedCost } = await generateBrief({
    snapshot,
    delta,
    reconnectBrief,
  });

  const [row] = await db
    .insert(bensonProgressBriefs)
    .values({
      creatorId: accountId,
      snapshotHash: hash,
      snapshot,
      delta,
      brief,
      tokenUsage,
      estimatedCost: estimatedCost.toFixed(6),
    })
    .returning({ id: bensonProgressBriefs.id });

  console.log(`[benson-pulse] progress brief generated: ${brief.headline}`);

  try {
    const { emitDataChange } = await import('../data-revision/index.js');
    await emitDataChange({
      eventType: 'pulse_brief_generated',
      domains: ['home_briefing', 'recommendations', 'analytics'],
      completedAt: new Date().toISOString(),
      source: 'benson_pulse',
      recordIds: row?.id ? [row.id] : undefined,
      success: true,
    });
  } catch (err) {
    console.warn('[benson-pulse] data revision emit failed:', err instanceof Error ? err.message : err);
  }

  try {
    const { sendBensonPush } = await import('../push-notifications/index.js');
    await sendBensonPush({
      topic: 'tiktok_pulse',
      title: 'Benson · TikTok',
      body: brief.headline,
      url: '/analytics/tiktok',
    });
  } catch (err) {
    console.warn('[benson-pulse] push failed:', err instanceof Error ? err.message : err);
  }

  return {
    ok: true,
    synced,
    syncError,
    changed: true,
    briefGenerated: true,
    reason: reconnectBrief ? 'tiktok_reconnected' : delta.firstRun ? 'first_run' : 'meaningful_change',
    briefId: row?.id,
  };
}

export {
  shapeHomeTopPicks,
  isUsableTopPickSourceUrl,
  homeTopPickPrimaryAction,
  type HomeTopPick,
  type HomeTopPickAction,
} from './top-pick-actions.js';

export async function getLatestProgressBrief(): Promise<ProgressBrief | null> {
  const [row] = await db
    .select()
    .from(bensonProgressBriefs)
    .orderBy(desc(bensonProgressBriefs.createdAt))
    .limit(1);
  if (!row) return null;
  const parsed = BriefSchema.safeParse(row.brief);
  if (!parsed.success) return null;
  const snapshot = row.snapshot as PulseSnapshot | null;
  return {
    ...parsed.data,
    createdAt: row.createdAt.toISOString(),
    dataThrough: snapshot?.capturedAt ?? null,
  };
}
