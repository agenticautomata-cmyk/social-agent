// Near-milestone follower watch — syncs TikTok more often in the final stretch to 10K.

import { env } from '@social-agent/core';
import { runCreatorAnalyticsSync } from '@social-agent/core/creator-analytics-sync';
import { resolveTikTokAnalyticsContext } from '@social-agent/core/creator-analytics';
import {
  checkFollowers10000Milestone,
  getMilestone,
  FOLLOWERS_10000_TARGET,
  NEAR_MILESTONE_FOLLOWERS,
} from '@social-agent/core/push-notifications';
import { createCronWorker } from '../runtime.js';

export const milestoneWatchWorker = createCronWorker({
  name: 'milestone-watch',
  intervalMs: env.BENSON_MILESTONE_WATCH_INTERVAL_MS,
  initialDelayMs: 45_000,
  run: async () => {
    const [tiktokCtx, milestoneRow] = await Promise.all([
      resolveTikTokAnalyticsContext(env.DEMO_MODE),
      getMilestone('followers_10000'),
    ]);

    const count = tiktokCtx.followersAvailable ? tiktokCtx.followersCount : null;
    const pushDone = !!milestoneRow?.pushSentAt;
    const telegramDone = !!(
      milestoneRow?.metadata &&
      typeof milestoneRow.metadata === 'object' &&
      (milestoneRow.metadata as { telegramSentAt?: string }).telegramSentAt
    );
    const fullySent = pushDone && telegramDone;

    const nearGoal =
      count != null && count >= NEAR_MILESTONE_FOLLOWERS && count < FOLLOWERS_10000_TARGET;
    const crossedButUnsent = count != null && count >= FOLLOWERS_10000_TARGET && !fullySent;

    if (!nearGoal && !crossedButUnsent) {
      return;
    }

    try {
      await runCreatorAnalyticsSync({ providers: ['tiktok'], trigger: 'scheduled' });
    } catch (err) {
      console.warn(
        '[milestone-watch] sync skipped:',
        err instanceof Error ? err.message : err,
      );
    }

    const freshCtx = await resolveTikTokAnalyticsContext(env.DEMO_MODE);
    const result = await checkFollowers10000Milestone(freshCtx.followersCount);
    if (result.triggered) {
      console.log(
        `[milestone-watch] 10K milestone — push=${result.pushSent ? 'yes' : 'no'} telegram=${result.telegramSent ? 'yes' : 'no'} (${result.reason})`,
      );
    } else if (crossedButUnsent || nearGoal) {
      console.log(
        `[milestone-watch] followers=${freshCtx.followersCount ?? 'n/a'} (${result.reason})`,
      );
    }
  },
});
