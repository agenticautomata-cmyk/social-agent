import { listOutreachAwaitingApproval } from '../sponsor-outreach/outreach.js';
import { listOutreachEmails } from '../sponsor-outreach/outreach.js';
import { resolveTikTokAnalyticsContext } from '../creator-analytics/tiktok-context.js';
import { env } from '../env.js';
import { FOLLOWERS_5000_TARGET } from '../push-notifications/constants.js';
import { loadIngestedInventoryItems } from '../inventory/load-ingested.js';
import { computeTopSponsorCandidates } from '../sponsor-intelligence/top-candidates.js';
import { shouldPromoteSponsorCandidate } from '../sponsor-intelligence/priority.js';

export type OutreachTimingContext = {
  outreachMode: 'live' | 'simulate';
  pendingApprovals: number;
  queueDrafts: number;
  followerCount: number | null;
  followersToGo: number | null;
  nearFiveK: boolean;
  topSponsorProspect: string | null;
  pitchWhileHot: string | null;
};

export async function buildOutreachTimingContext(): Promise<OutreachTimingContext> {
  const [approvals, queue, tiktokCtx, topSponsors, sendConfig] = await Promise.all([
    listOutreachAwaitingApproval(),
    listOutreachEmails('queue'),
    resolveTikTokAnalyticsContext(env.DEMO_MODE),
    loadIngestedInventoryItems().then((items) => computeTopSponsorCandidates(items, { limit: 1 })),
    import('../sponsor-outreach/send.js').then((m) => m.getOutreachSendConfig()),
  ]);

  const followerCount = tiktokCtx.followersAvailable ? tiktokCtx.followersCount : null;
  const followersToGo =
    followerCount != null && followerCount < FOLLOWERS_5000_TARGET
      ? FOLLOWERS_5000_TARGET - followerCount
      : null;
  const nearFiveK =
    followerCount != null && followerCount >= 4500 && followerCount < FOLLOWERS_5000_TARGET;
  const top = topSponsors.items[0];
  const topSponsorProspect =
    top && shouldPromoteSponsorCandidate(top) ? top.businessName : null;

  let pitchWhileHot: string | null = null;
  if (nearFiveK && topSponsorProspect) {
    pitchWhileHot = `You're ${followersToGo} followers from 5K — strong time to pitch ${topSponsorProspect} while momentum is visible.`;
  } else if (topSponsorProspect && (followerCount ?? 0) >= 3000) {
    pitchWhileHot = `Creator momentum is solid — prioritize outreach to ${topSponsorProspect}.`;
  } else if (approvals.length > 0) {
    pitchWhileHot = `${approvals.length} Benson draft${approvals.length === 1 ? '' : 's'} waiting in Email → Approvals.`;
  }

  return {
    outreachMode: sendConfig.mode,
    pendingApprovals: approvals.length,
    queueDrafts: queue.length,
    followerCount,
    followersToGo,
    nearFiveK,
    topSponsorProspect,
    pitchWhileHot,
  };
}
