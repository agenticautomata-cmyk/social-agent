import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { analyticsConnectors, bensonMilestones } from '../schema.js';
import {
  FOLLOWERS_10000_MILESTONE,
  FOLLOWERS_10000_TARGET,
  FOLLOWERS_5000_MILESTONE,
  VIEWS_1000000_MILESTONE,
  VIEWS_1000000_TARGET,
  type PushNotificationPayload,
} from './constants.js';
import {
  FOLLOWERS_10000_HEADLINE,
  FOLLOWERS_10000_MESSAGE,
  FOLLOWERS_10000_GIFS,
} from './milestone-content.js';
import { notifyFollowers10000Telegram, notifyViews1000000Telegram } from './milestone-notify.js';
import { sendBensonPush } from './send.js';

export type MilestoneCelebration = {
  id: string;
  followerCount: number;
  headline: string;
  message: string;
  gifs: string[];
  pushSent: boolean;
  telegramSent: boolean;
  alreadyCelebrated: boolean;
};

type MilestoneMetadata = {
  telegramSentAt?: string;
  viewCount?: number;
};

function readMetadata(row: { metadata?: unknown } | null | undefined): MilestoneMetadata {
  if (!row?.metadata || typeof row.metadata !== 'object') return {};
  return row.metadata as MilestoneMetadata;
}

export async function getMilestone(id: string) {
  return db.query.bensonMilestones.findFirst({
    where: eq(bensonMilestones.id, id),
  });
}

function buildCelebration(row: {
  followerCount: number | null;
  pushSentAt: Date | null;
  metadata?: unknown;
}): MilestoneCelebration {
  const metadata = readMetadata(row);
  return {
    id: FOLLOWERS_10000_MILESTONE,
    followerCount: row.followerCount ?? FOLLOWERS_10000_TARGET,
    headline: FOLLOWERS_10000_HEADLINE,
    message: FOLLOWERS_10000_MESSAGE,
    gifs: [FOLLOWERS_10000_GIFS.hero, FOLLOWERS_10000_GIFS.fireworks, FOLLOWERS_10000_GIFS.party],
    pushSent: !!row.pushSentAt,
    telegramSent: !!metadata.telegramSentAt,
    alreadyCelebrated: false,
  };
}

/** Retire the old 5K celebration so it never surfaces again. */
export async function retireFollowers5000Milestone(): Promise<void> {
  const now = new Date();
  const existing = await getMilestone(FOLLOWERS_5000_MILESTONE);
  if (existing) {
    await db
      .update(bensonMilestones)
      .set({
        celebratedAt: existing.celebratedAt ?? now,
        pushSentAt: existing.pushSentAt ?? now,
      })
      .where(eq(bensonMilestones.id, FOLLOWERS_5000_MILESTONE));
    return;
  }
  await db.insert(bensonMilestones).values({
    id: FOLLOWERS_5000_MILESTONE,
    followerCount: 5001,
    reachedAt: now,
    pushSentAt: now,
    celebratedAt: now,
    metadata: { retired: true, retiredAt: now.toISOString() },
  });
}

export async function getPendingCelebration(): Promise<MilestoneCelebration | null> {
  const row = await getMilestone(FOLLOWERS_10000_MILESTONE);
  if (!row?.pushSentAt) return null;
  if (row.celebratedAt && row.celebratedAt >= row.pushSentAt) return null;

  return {
    ...buildCelebration(row),
    alreadyCelebrated: false,
  };
}

export async function markMilestoneCelebrated(id: string): Promise<void> {
  const existing = await getMilestone(id);
  if (!existing) return;
  if (existing.celebratedAt) return;

  await db
    .update(bensonMilestones)
    .set({ celebratedAt: new Date() })
    .where(eq(bensonMilestones.id, id));
}

function celebrationPayload(followerCount: number): PushNotificationPayload {
  return {
    topic: 'milestones',
    title: '🎆 10,000 followers — money milestone, Kellie!',
    body: 'You crossed the line where KC brand deals get real. Benson has pitches ready.',
    url: '/home?celebrate=followers-10000',
    celebration: 'fireworks',
    milestone: FOLLOWERS_10000_MILESTONE,
    followerCount,
  };
}

async function markTelegramSent(
  milestoneId: string,
  count: number,
  existingMetadata: unknown,
): Promise<void> {
  const metadata: MilestoneMetadata = {
    ...readMetadata({ metadata: existingMetadata }),
    telegramSentAt: new Date().toISOString(),
  };
  await db
    .update(bensonMilestones)
    .set({ followerCount: count, metadata })
    .where(eq(bensonMilestones.id, milestoneId));
}

export async function celebrateFollowers10000(options?: {
  followerCount?: number;
  force?: boolean;
}): Promise<{
  sent: boolean;
  pushSent: boolean;
  telegramSent: boolean;
  reason: string;
  celebration: MilestoneCelebration;
}> {
  const count = options?.followerCount ?? FOLLOWERS_10000_TARGET;
  const existing = await getMilestone(FOLLOWERS_10000_MILESTONE);
  const metadata = readMetadata(existing);

  const celebration: MilestoneCelebration = existing
    ? { ...buildCelebration(existing), alreadyCelebrated: !!existing.celebratedAt }
    : {
        id: FOLLOWERS_10000_MILESTONE,
        followerCount: count,
        headline: FOLLOWERS_10000_HEADLINE,
        message: FOLLOWERS_10000_MESSAGE,
        gifs: [FOLLOWERS_10000_GIFS.hero, FOLLOWERS_10000_GIFS.fireworks, FOLLOWERS_10000_GIFS.party],
        pushSent: false,
        telegramSent: false,
        alreadyCelebrated: false,
      };

  const pushAlreadySent = !!existing?.pushSentAt;
  const telegramAlreadySent = !!metadata.telegramSentAt;

  if (!options?.force && pushAlreadySent && telegramAlreadySent) {
    return {
      sent: false,
      pushSent: false,
      telegramSent: false,
      reason: 'already_sent',
      celebration,
    };
  }

  if (!options?.force && count < FOLLOWERS_10000_TARGET) {
    return {
      sent: false,
      pushSent: false,
      telegramSent: false,
      reason: 'below_threshold',
      celebration,
    };
  }

  const now = new Date();
  if (!existing) {
    await db.insert(bensonMilestones).values({
      id: FOLLOWERS_10000_MILESTONE,
      followerCount: count,
      reachedAt: now,
    });
  } else {
    await db
      .update(bensonMilestones)
      .set({ followerCount: count, reachedAt: existing.reachedAt ?? now })
      .where(eq(bensonMilestones.id, FOLLOWERS_10000_MILESTONE));
  }

  let pushSent = pushAlreadySent;
  if (!pushAlreadySent || options?.force) {
    const result = await sendBensonPush(celebrationPayload(count), { force: true });
    if (result.sent > 0) {
      await db
        .update(bensonMilestones)
        .set({ pushSentAt: now, followerCount: count })
        .where(eq(bensonMilestones.id, FOLLOWERS_10000_MILESTONE));
      pushSent = true;
      celebration.pushSent = true;
    }
  }

  let telegramSent = telegramAlreadySent;
  if (!telegramAlreadySent || options?.force) {
    if (options?.force && telegramAlreadySent) {
      const cleaned = { ...readMetadata(existing) };
      delete cleaned.telegramSentAt;
      await db
        .update(bensonMilestones)
        .set({ metadata: cleaned })
        .where(eq(bensonMilestones.id, FOLLOWERS_10000_MILESTONE));
    }
    const telegram = await notifyFollowers10000Telegram(count);
    if (telegram.sent) {
      const fresh = await getMilestone(FOLLOWERS_10000_MILESTONE);
      await markTelegramSent(FOLLOWERS_10000_MILESTONE, count, fresh?.metadata);
      telegramSent = true;
      celebration.telegramSent = true;
      console.log(`[milestones] 10K telegram sent (${telegram.reason ?? 'ok'})`);
    } else {
      console.warn('[milestones] 10K telegram failed:', telegram.reason ?? 'unknown');
    }
  }

  const sent = pushSent || telegramSent;
  let reason = 'sent';
  if (!sent) {
    reason = options?.force ? 'milestone_recorded' : 'send_failed';
  } else if (pushSent && telegramSent) {
    reason = 'push_and_telegram';
  } else if (telegramSent) {
    reason = 'telegram_only';
  } else {
    reason = 'push_only';
  }

  return { sent, pushSent, telegramSent, reason, celebration };
}

export async function sendPendingMilestonePush(): Promise<{ sent: boolean; reason: string }> {
  const existing = await getMilestone(FOLLOWERS_10000_MILESTONE);
  if (!existing) return { sent: false, reason: 'no_milestone' };
  if (existing.pushSentAt) return { sent: false, reason: 'already_sent' };

  const count = existing.followerCount ?? FOLLOWERS_10000_TARGET;
  const result = await sendBensonPush(celebrationPayload(count), { force: true });

  if (result.sent > 0) {
    const now = new Date();
    await db
      .update(bensonMilestones)
      .set({ pushSentAt: now, followerCount: count })
      .where(eq(bensonMilestones.id, FOLLOWERS_10000_MILESTONE));
    return { sent: true, reason: 'sent' };
  }

  return { sent: false, reason: result.reason ?? 'send_failed' };
}

export async function checkFollowers10000Milestone(
  followerCount: number | null | undefined,
): Promise<{ triggered: boolean; reason: string; pushSent?: boolean; telegramSent?: boolean }> {
  if (followerCount == null || followerCount < FOLLOWERS_10000_TARGET) {
    return { triggered: false, reason: 'below_threshold' };
  }

  const existing = await getMilestone(FOLLOWERS_10000_MILESTONE);
  const metadata = readMetadata(existing);
  if (existing?.pushSentAt && metadata.telegramSentAt) {
    return { triggered: false, reason: 'already_sent' };
  }

  const { sent, reason, pushSent, telegramSent } = await celebrateFollowers10000({ followerCount });
  return { triggered: sent, reason, pushSent, telegramSent };
}

/** @deprecated 5K milestone retired — no-op for legacy call sites. */
export async function checkFollowers5000Milestone(
  _followerCount: number | null | undefined,
): Promise<{ triggered: boolean; reason: string }> {
  return { triggered: false, reason: 'retired_5k' };
}

/** @deprecated Use celebrateFollowers10000 */
export async function celebrateFollowers5000(options?: {
  followerCount?: number;
  force?: boolean;
}): Promise<{
  sent: boolean;
  pushSent: boolean;
  telegramSent: boolean;
  reason: string;
  celebration: MilestoneCelebration;
}> {
  await retireFollowers5000Milestone();
  return {
    sent: false,
    pushSent: false,
    telegramSent: false,
    reason: 'retired_5k',
    celebration: {
      id: FOLLOWERS_5000_MILESTONE,
      followerCount: options?.followerCount ?? 5000,
      headline: '5K milestone retired',
      message: 'Benson now tracks the 10K money milestone.',
      gifs: [],
      pushSent: false,
      telegramSent: false,
      alreadyCelebrated: true,
    },
  };
}

/** Sum of latest TikTok video views from the analytics connector. */
export async function resolveTikTokTotalViews(): Promise<number | null> {
  const connector = await db.query.analyticsConnectors.findFirst({
    where: eq(analyticsConnectors.provider, 'tiktok'),
  });
  if (connector?.totalViews == null) return null;
  const n = Number(connector.totalViews);
  return Number.isFinite(n) ? n : null;
}

function viewsCelebrationPayload(viewCount: number): PushNotificationPayload {
  // No celebration overlay / fireworks deep-link — push + Telegram only.
  return {
    topic: 'milestones',
    title: '🚀 1,000,000 TikTok views!',
    body: `You just crossed ${viewCount.toLocaleString()} total views. A million eyes — brands notice that.`,
    url: '/analytics',
    milestone: VIEWS_1000000_MILESTONE,
    viewCount,
  };
}

/**
 * Fire the 1M views celebration via push + Telegram only.
 * Marks celebrated_at immediately so no Studio overlay or teaser appears.
 */
export async function celebrateViews1000000(options?: {
  viewCount?: number;
  force?: boolean;
}): Promise<{
  sent: boolean;
  pushSent: boolean;
  telegramSent: boolean;
  reason: string;
  viewCount: number;
}> {
  const count = options?.viewCount ?? VIEWS_1000000_TARGET;
  const existing = await getMilestone(VIEWS_1000000_MILESTONE);
  const metadata = readMetadata(existing);

  const pushAlreadySent = !!existing?.pushSentAt;
  const telegramAlreadySent = !!metadata.telegramSentAt;

  if (!options?.force && pushAlreadySent && telegramAlreadySent) {
    return {
      sent: false,
      pushSent: false,
      telegramSent: false,
      reason: 'already_sent',
      viewCount: count,
    };
  }

  if (!options?.force && count < VIEWS_1000000_TARGET) {
    return {
      sent: false,
      pushSent: false,
      telegramSent: false,
      reason: 'below_threshold',
      viewCount: count,
    };
  }

  const now = new Date();
  const nextMeta: MilestoneMetadata = {
    ...metadata,
    viewCount: count,
  };

  if (!existing) {
    await db.insert(bensonMilestones).values({
      id: VIEWS_1000000_MILESTONE,
      followerCount: count,
      reachedAt: now,
      metadata: nextMeta,
    });
  } else {
    await db
      .update(bensonMilestones)
      .set({
        followerCount: count,
        reachedAt: existing.reachedAt ?? now,
        metadata: nextMeta,
      })
      .where(eq(bensonMilestones.id, VIEWS_1000000_MILESTONE));
  }

  let pushSent = pushAlreadySent;
  if (!pushAlreadySent || options?.force) {
    const result = await sendBensonPush(viewsCelebrationPayload(count), { force: true });
    if (result.sent > 0) {
      await db
        .update(bensonMilestones)
        .set({ pushSentAt: now, followerCount: count })
        .where(eq(bensonMilestones.id, VIEWS_1000000_MILESTONE));
      pushSent = true;
    }
  }

  let telegramSent = telegramAlreadySent;
  if (!telegramAlreadySent || options?.force) {
    if (options?.force && telegramAlreadySent) {
      const cleaned = { ...readMetadata(existing), viewCount: count };
      delete cleaned.telegramSentAt;
      await db
        .update(bensonMilestones)
        .set({ metadata: cleaned })
        .where(eq(bensonMilestones.id, VIEWS_1000000_MILESTONE));
    }
    const telegram = await notifyViews1000000Telegram(count);
    if (telegram.sent) {
      const fresh = await getMilestone(VIEWS_1000000_MILESTONE);
      await markTelegramSent(VIEWS_1000000_MILESTONE, count, {
        ...readMetadata(fresh),
        viewCount: count,
      });
      telegramSent = true;
      console.log(`[milestones] 1M views telegram sent (${telegram.reason ?? 'ok'})`);
    } else {
      console.warn('[milestones] 1M views telegram failed:', telegram.reason ?? 'unknown');
    }
  }

  // Ack immediately — this milestone never uses the Studio celebration overlay.
  if (pushSent || telegramSent) {
    await db
      .update(bensonMilestones)
      .set({ celebratedAt: now })
      .where(eq(bensonMilestones.id, VIEWS_1000000_MILESTONE));
  }

  const sent = pushSent || telegramSent;
  let reason = 'sent';
  if (!sent) {
    reason = options?.force ? 'milestone_recorded' : 'send_failed';
  } else if (pushSent && telegramSent) {
    reason = 'push_and_telegram';
  } else if (telegramSent) {
    reason = 'telegram_only';
  } else {
    reason = 'push_only';
  }

  return { sent, pushSent, telegramSent, reason, viewCount: count };
}

export async function checkViews1000000Milestone(
  viewCount: number | null | undefined,
): Promise<{ triggered: boolean; reason: string; pushSent?: boolean; telegramSent?: boolean }> {
  if (viewCount == null || viewCount < VIEWS_1000000_TARGET) {
    return { triggered: false, reason: 'below_threshold' };
  }

  const existing = await getMilestone(VIEWS_1000000_MILESTONE);
  const metadata = readMetadata(existing);
  if (existing?.pushSentAt && metadata.telegramSentAt) {
    return { triggered: false, reason: 'already_sent' };
  }

  const { sent, reason, pushSent, telegramSent } = await celebrateViews1000000({ viewCount });
  return { triggered: sent, reason, pushSent, telegramSent };
}
