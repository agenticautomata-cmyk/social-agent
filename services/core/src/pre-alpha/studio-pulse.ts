import { env } from '../env.js';
import { listOutreachAwaitingApproval } from '../sponsor-outreach/outreach.js';
import { listOutreachInboundMessages } from '../gmail-inbox/sync-replies.js';
import { resolveTikTokAnalyticsContext } from '../creator-analytics/tiktok-context.js';
import { FOLLOWERS_5000_TARGET } from '../push-notifications/constants.js';
import { getMilestone } from '../push-notifications/milestones.js';
import { loadIngestedInventoryItems } from '../inventory/load-ingested.js';
import { computeTopSponsorCandidates } from '../sponsor-intelligence/top-candidates.js';
import { shouldPromoteSponsorCandidate, sponsorBriefingLinkFromCandidate } from '../sponsor-intelligence/priority.js';

export type StudioPulse = {
  pendingEmailApprovals: number;
  unreadInboxReplies: number;
  followerCount: number | null;
  followerTarget: number;
  followerProgressPct: number | null;
  followersToGo: number | null;
  milestoneReached: boolean;
  nearMilestone: boolean;
  topSponsorPitchHref: string | null;
  topSponsorPitchLabel: string | null;
  outreachMode: 'live' | 'simulate';
};

export async function computeStudioPulse(): Promise<StudioPulse> {
  const [approvals, inbound, tiktokCtx, milestoneRow, topSponsors, outreach] = await Promise.all([
    listOutreachAwaitingApproval(),
    listOutreachInboundMessages(50),
    resolveTikTokAnalyticsContext(env.DEMO_MODE),
    getMilestone('followers_5000'),
    loadIngestedInventoryItems().then((items) => computeTopSponsorCandidates(items, { limit: 3 })),
    import('../sponsor-outreach/send.js').then((m) => m.getOutreachSendConfig()),
  ]);

  const followerCount = tiktokCtx.followersAvailable ? tiktokCtx.followersCount : null;
  const milestoneReached =
    !!milestoneRow?.pushSentAt ||
    !!milestoneRow?.celebratedAt ||
    (followerCount != null && followerCount >= FOLLOWERS_5000_TARGET);
  const followersToGo =
    followerCount != null && followerCount < FOLLOWERS_5000_TARGET
      ? FOLLOWERS_5000_TARGET - followerCount
      : null;
  const followerProgressPct =
    followerCount != null && !milestoneReached
      ? Math.min(100, Math.round((followerCount / FOLLOWERS_5000_TARGET) * 100))
      : followerCount != null && milestoneReached
        ? 100
        : null;
  const nearMilestone =
    !milestoneReached &&
    followerCount != null &&
    followerCount >= 4500 &&
    followerCount < FOLLOWERS_5000_TARGET;

  const promoted = topSponsors.items.find((rec) => shouldPromoteSponsorCandidate(rec));
  const pitchLink = promoted ? sponsorBriefingLinkFromCandidate(promoted) : null;

  return {
    pendingEmailApprovals: approvals.length,
    unreadInboxReplies: inbound.filter((m) => !m.isRead).length,
    followerCount,
    followerTarget: FOLLOWERS_5000_TARGET,
    followerProgressPct,
    followersToGo,
    milestoneReached,
    nearMilestone,
    topSponsorPitchHref: pitchLink?.href ?? null,
    topSponsorPitchLabel: pitchLink?.label ?? null,
    outreachMode: outreach.mode,
  };
}
