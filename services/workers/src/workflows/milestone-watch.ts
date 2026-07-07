// Near-milestone follower watch — syncs TikTok more often in the final stretch to 5K
// so Benson fires the celebration push within minutes, not on the 4 h pulse cycle.

import { env } from '@social-agent/core';
import { runCreatorAnalyticsSync } from '@social-agent/core/creator-analytics-sync';
import { resolveTikTokAnalyticsContext } from '@social-agent/core/creator-analytics';
import {
  checkFollowers5000Milestone,
  getMilestone,
  FOLLOWERS_5000_TARGET,
} from '@social-agent/core/push-notifications';
import { createCronWorker } from '../runtime.js';

const NEAR_MILESTONE_FOLLOWERS = 4500;

export const milestoneWatchWorker = createCronWorker({
  name: 'milestone-watch',
  intervalMs: env.BENSON_MILESTONE_WATCH_INTERVAL_MS,
  initialDelayMs: 45_000,
  run: async () => {
    const [tiktokCtx, milestoneRow] = await Promise.all([
      resolveTikTokAnalyticsContext(env.DEMO_MODE),
      getMilestone('followers_5000'),
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
      count != null && count >= NEAR_MILESTONE_FOLLOWERS && count < FOLLOWERS_5000_TARGET;
    const crossedButUnsent = count != null && count >= FOLLOWERS_5000_TARGET && !fullySent;

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
    const result = await checkFollowers5000Milestone(freshCtx.followersCount);
    if (result.triggered) {
      console.log(
        `[milestone-watch] 5K milestone — push=${result.pushSent ? 'yes' : 'no'} telegram=${result.telegramSent ? 'yes' : 'no'} (${result.reason})`,
      );
    } else if (crossedButUnsent || nearGoal) {
      console.log(
        `[milestone-watch] followers=${freshCtx.followersCount ?? 'n/a'} (${result.reason})`,
      );
    }
  },
});
