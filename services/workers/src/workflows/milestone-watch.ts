// Silent milestone watch — follower stretch + 1M views (views never advertised in Studio).

import { env } from '@social-agent/core';
import { runCreatorAnalyticsSync } from '@social-agent/core/creator-analytics-sync';
import { resolveTikTokAnalyticsContext } from '@social-agent/core/creator-analytics';
import {
  checkFollowers10000Milestone,
  checkViews1000000Milestone,
  getMilestone,
  resolveTikTokTotalViews,
  FOLLOWERS_10000_TARGET,
  NEAR_MILESTONE_FOLLOWERS,
  NEAR_MILESTONE_VIEWS,
  VIEWS_1000000_TARGET,
} from '@social-agent/core/push-notifications';
import { createCronWorker } from '../runtime.js';

function telegramDone(metadata: unknown): boolean {
  return !!(
    metadata &&
    typeof metadata === 'object' &&
    (metadata as { telegramSentAt?: string }).telegramSentAt
  );
}

export const milestoneWatchWorker = createCronWorker({
  name: 'milestone-watch',
  intervalMs: env.BENSON_MILESTONE_WATCH_INTERVAL_MS,
  initialDelayMs: 45_000,
  run: async () => {
    const [tiktokCtx, followersRow, viewsRow, totalViews] = await Promise.all([
      resolveTikTokAnalyticsContext(env.DEMO_MODE),
      getMilestone('followers_10000'),
      getMilestone('views_1000000'),
      resolveTikTokTotalViews(),
    ]);

    const count = tiktokCtx.followersAvailable ? tiktokCtx.followersCount : null;
    const followersFullySent =
      !!followersRow?.pushSentAt && telegramDone(followersRow?.metadata);
    const viewsFullySent = !!viewsRow?.pushSentAt && telegramDone(viewsRow?.metadata);

    const nearFollowers =
      count != null && count >= NEAR_MILESTONE_FOLLOWERS && count < FOLLOWERS_10000_TARGET;
    const crossedFollowersUnsent =
      count != null && count >= FOLLOWERS_10000_TARGET && !followersFullySent;

    const nearViews =
      totalViews != null && totalViews >= NEAR_MILESTONE_VIEWS && totalViews < VIEWS_1000000_TARGET;
    const crossedViewsUnsent =
      totalViews != null && totalViews >= VIEWS_1000000_TARGET && !viewsFullySent;

    if (!nearFollowers && !crossedFollowersUnsent && !nearViews && !crossedViewsUnsent) {
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
    const freshViews = await resolveTikTokTotalViews();

    if (nearFollowers || crossedFollowersUnsent) {
      const result = await checkFollowers10000Milestone(freshCtx.followersCount);
      if (result.triggered) {
        console.log(
          `[milestone-watch] 10K milestone — push=${result.pushSent ? 'yes' : 'no'} telegram=${result.telegramSent ? 'yes' : 'no'} (${result.reason})`,
        );
      } else {
        console.log(
          `[milestone-watch] followers=${freshCtx.followersCount ?? 'n/a'} (${result.reason})`,
        );
      }
    }

    if (nearViews || crossedViewsUnsent) {
      const result = await checkViews1000000Milestone(freshViews);
      if (result.triggered) {
        console.log(
          `[milestone-watch] 1M views — push=${result.pushSent ? 'yes' : 'no'} telegram=${result.telegramSent ? 'yes' : 'no'} (${result.reason})`,
        );
      } else if (crossedViewsUnsent) {
        console.log(
          `[milestone-watch] views=${freshViews ?? 'n/a'} (${result.reason})`,
        );
      }
      // nearViews (below threshold): stay quiet — no Studio advertising.
    }
  },
});
