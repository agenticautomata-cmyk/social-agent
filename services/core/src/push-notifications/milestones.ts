import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { bensonMilestones } from '../schema.js';
import {
  FOLLOWERS_5000_MILESTONE,
  FOLLOWERS_5000_TARGET,
  type PushNotificationPayload,
} from './constants.js';
import {
  FOLLOWERS_5000_HEADLINE,
  FOLLOWERS_5000_MESSAGE,
  FOLLOWERS_5000_GIFS,
} from './milestone-content.js';
import { notifyFollowers5000Telegram } from './milestone-notify.js';
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
    id: FOLLOWERS_5000_MILESTONE,
    followerCount: row.followerCount ?? FOLLOWERS_5000_TARGET,
    headline: FOLLOWERS_5000_HEADLINE,
    message: FOLLOWERS_5000_MESSAGE,
    gifs: [FOLLOWERS_5000_GIFS.hero, FOLLOWERS_5000_GIFS.fireworks, FOLLOWERS_5000_GIFS.party],
    pushSent: !!row.pushSentAt,
    telegramSent: !!metadata.telegramSentAt,
    alreadyCelebrated: false,
  };
}

export async function getPendingCelebration(): Promise<MilestoneCelebration | null> {
  const row = await getMilestone(FOLLOWERS_5000_MILESTONE);
  if (!row?.pushSentAt) return null;

  // Show fireworks until the user dismisses *this* push (ignore stale test acks).
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
    title: '🎆 5,000 followers, Kellie!',
    body: 'Benson knew you\'d get here. KC is watching — and they\'re staying.',
    url: '/home?celebrate=followers-5000',
    celebration: 'fireworks',
    milestone: FOLLOWERS_5000_MILESTONE,
    followerCount,
  };
}

async function markTelegramSent(count: number, existingMetadata: unknown): Promise<void> {
  const metadata: MilestoneMetadata = {
    ...readMetadata({ metadata: existingMetadata }),
    telegramSentAt: new Date().toISOString(),
  };
  await db
    .update(bensonMilestones)
    .set({ followerCount: count, metadata })
    .where(eq(bensonMilestones.id, FOLLOWERS_5000_MILESTONE));
}

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
  const count = options?.followerCount ?? FOLLOWERS_5000_TARGET;
  const existing = await getMilestone(FOLLOWERS_5000_MILESTONE);
  const metadata = readMetadata(existing);

  const celebration: MilestoneCelebration = existing
    ? { ...buildCelebration(existing), alreadyCelebrated: !!existing.celebratedAt }
    : {
        id: FOLLOWERS_5000_MILESTONE,
        followerCount: count,
        headline: FOLLOWERS_5000_HEADLINE,
        message: FOLLOWERS_5000_MESSAGE,
        gifs: [FOLLOWERS_5000_GIFS.hero, FOLLOWERS_5000_GIFS.fireworks, FOLLOWERS_5000_GIFS.party],
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

  if (!options?.force && count < FOLLOWERS_5000_TARGET) {
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
      id: FOLLOWERS_5000_MILESTONE,
      followerCount: count,
      reachedAt: now,
    });
  } else {
    await db
      .update(bensonMilestones)
      .set({ followerCount: count, reachedAt: existing.reachedAt ?? now })
      .where(eq(bensonMilestones.id, FOLLOWERS_5000_MILESTONE));
  }

  let pushSent = pushAlreadySent;
  if (!pushAlreadySent || options?.force) {
    const result = await sendBensonPush(celebrationPayload(count), { force: true });
    if (result.sent > 0) {
      await db
        .update(bensonMilestones)
        .set({ pushSentAt: now, followerCount: count })
        .where(eq(bensonMilestones.id, FOLLOWERS_5000_MILESTONE));
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
        .where(eq(bensonMilestones.id, FOLLOWERS_5000_MILESTONE));
    }
    const telegram = await notifyFollowers5000Telegram(count);
    if (telegram.sent) {
      const fresh = await getMilestone(FOLLOWERS_5000_MILESTONE);
      await markTelegramSent(count, fresh?.metadata);
      telegramSent = true;
      celebration.telegramSent = true;
      console.log(`[milestones] 5K telegram sent (${telegram.reason ?? 'ok'})`);
    } else {
      console.warn('[milestones] 5K telegram failed:', telegram.reason ?? 'unknown');
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
  const existing = await getMilestone(FOLLOWERS_5000_MILESTONE);
  if (!existing) return { sent: false, reason: 'no_milestone' };
  if (existing.pushSentAt) return { sent: false, reason: 'already_sent' };

  const count = existing.followerCount ?? FOLLOWERS_5000_TARGET;
  const result = await sendBensonPush(celebrationPayload(count), { force: true });

  if (result.sent > 0) {
    const now = new Date();
    await db
      .update(bensonMilestones)
      .set({ pushSentAt: now, followerCount: count })
      .where(eq(bensonMilestones.id, FOLLOWERS_5000_MILESTONE));
    return { sent: true, reason: 'sent' };
  }

  return { sent: false, reason: result.reason ?? 'send_failed' };
}

export async function checkFollowers5000Milestone(
  followerCount: number | null | undefined,
): Promise<{ triggered: boolean; reason: string; pushSent?: boolean; telegramSent?: boolean }> {
  if (followerCount == null || followerCount < FOLLOWERS_5000_TARGET) {
    return { triggered: false, reason: 'below_threshold' };
  }

  const existing = await getMilestone(FOLLOWERS_5000_MILESTONE);
  const metadata = readMetadata(existing);
  if (existing?.pushSentAt && metadata.telegramSentAt) {
    return { triggered: false, reason: 'already_sent' };
  }

  const { sent, reason, pushSent, telegramSent } = await celebrateFollowers5000({ followerCount });
  return { triggered: sent, reason, pushSent, telegramSent };
}
