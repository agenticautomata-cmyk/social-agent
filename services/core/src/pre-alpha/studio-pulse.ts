import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { env } from '../env.js';
import { outreachEmails } from '../schema.js';
import { listOutreachAwaitingApproval } from '../sponsor-outreach/outreach.js';
import { listOutreachInboundMessages } from '../gmail-inbox/sync-replies.js';
import { isReplyActionable } from '../gmail-inbox/inbound-actionability.js';
import { resolveTikTokAnalyticsContext } from '../creator-analytics/tiktok-context.js';
import {
  FOLLOWERS_10000_TARGET,
  NEAR_MILESTONE_FOLLOWERS,
} from '../push-notifications/constants.js';
import { getMilestone } from '../push-notifications/milestones.js';
import { loadIngestedInventoryItems } from '../inventory/load-ingested.js';
import { computeTopSponsorCandidates } from '../sponsor-intelligence/top-candidates.js';
import type { InventoryItem } from '../inventory/normalize.js';
import type {
  SponsorIntelligenceResponse,
  SponsorRecommendation,
} from '../sponsor-intelligence/recommendations.js';
import {
  emailApprovalsHref,
  resolveSponsorBriefingLink,
  shouldPromoteSponsorCandidate,
} from '../sponsor-intelligence/priority.js';

export type StudioPulse = {
  pendingEmailApprovals: number;
  pitchReadyCount: number;
  researchingProspects: number;
  unreadInboxReplies: number;
  followerCount: number | null;
  followerTarget: number;
  followerProgressPct: number | null;
  followersToGo: number | null;
  milestoneReached: boolean;
  nearMilestone: boolean;
  topPendingApprovalHref: string | null;
  topSponsorPitchHref: string | null;
  topSponsorPitchLabel: string | null;
  outreachMode: 'live' | 'simulate';
};

export async function computeStudioPulse(options?: {
  inventory?: InventoryItem[];
  sharedSponsorRanked?: SponsorRecommendation[];
  sharedSponsorIntel?: SponsorIntelligenceResponse;
}): Promise<StudioPulse> {
  const sponsorCandidatesPromise = options?.sharedSponsorRanked
    ? Promise.resolve({
        demoMode: options.sharedSponsorIntel?.demoMode ?? env.DEMO_MODE,
        generatedAt: options.sharedSponsorIntel?.generatedAt ?? new Date().toISOString(),
        limit: 3,
        totalEligible: options.sharedSponsorIntel?.counts.totalEligible ?? options.sharedSponsorRanked.length,
        items: options.sharedSponsorRanked.slice(0, 3),
      })
    : Promise.resolve()
        .then(async () => {
          const items = options?.inventory ?? (await loadIngestedInventoryItems());
          return computeTopSponsorCandidates(items, { limit: 3 });
        })
        .catch(() => ({
          demoMode: env.DEMO_MODE,
          generatedAt: new Date().toISOString(),
          limit: 3,
          totalEligible: 0,
          items: [],
        }));

  const [
    awaitingApproval,
    inbound,
    tiktokCtx,
    milestoneRow,
    topSponsors,
    outreach,
    pitchReadyRows,
    researchingRows,
  ] = await Promise.all([
    listOutreachAwaitingApproval().catch((err) => {
      console.warn('[studio-pulse] awaitingApproval degraded:', err instanceof Error ? err.message : err);
      return [];
    }),
    listOutreachInboundMessages(50).catch((err) => {
      console.warn('[studio-pulse] inbound degraded:', err instanceof Error ? err.message : err);
      return [];
    }),
    resolveTikTokAnalyticsContext(env.DEMO_MODE).catch(
      () =>
        ({
          connected: false,
          connectionStatus: 'unavailable',
          platformUserId: null,
          platformUsername: null,
          usernameAvailable: false,
          connectedAt: null,
          expiresAt: null,
          scopes: [],
          lastSyncAt: null,
          lastSuccessfulSyncAt: null,
          liveVideoCount: 0,
          apiDisplayVideoCount: 0,
          demoVideoCount: 0,
          hasLiveData: false,
          effectiveDemoMode: env.DEMO_MODE,
          globalDemoMode: env.DEMO_MODE,
          followersCount: null,
          followersAvailable: false,
          followersSource: null,
        }) satisfies Awaited<ReturnType<typeof resolveTikTokAnalyticsContext>>,
    ),
    getMilestone('followers_10000'),
    sponsorCandidatesPromise,
    import('../sponsor-outreach/send.js')
      .then((m) => m.getOutreachSendConfig())
      .catch(() => ({
        mode: 'simulate' as const,
        liveEnabled: false,
        liveReady: false,
        provider: null,
        missingForLive: ['GMAIL_CONNECTION'],
        fromEmail: null,
        replyTo: null,
        gmailConnected: false,
      })),
    db
      .select({ id: outreachEmails.id })
      .from(outreachEmails)
      .where(eq(outreachEmails.pitchReadinessStatus, 'pitch_ready')),
    db
      .select({ id: outreachEmails.id })
      .from(outreachEmails)
      .where(eq(outreachEmails.pitchReadinessStatus, 'researching')),
  ]);

  const followerCount = tiktokCtx.followersAvailable ? tiktokCtx.followersCount : null;
  const milestoneReached =
    !!milestoneRow?.pushSentAt ||
    !!milestoneRow?.celebratedAt ||
    (followerCount != null && followerCount >= FOLLOWERS_10000_TARGET);
  const followersToGo =
    followerCount != null && followerCount < FOLLOWERS_10000_TARGET
      ? FOLLOWERS_10000_TARGET - followerCount
      : null;
  const followerProgressPct =
    followerCount != null && !milestoneReached
      ? Math.min(100, Math.round((followerCount / FOLLOWERS_10000_TARGET) * 100))
      : followerCount != null && milestoneReached
        ? 100
        : null;
  const nearMilestone =
    !milestoneReached &&
    followerCount != null &&
    followerCount >= NEAR_MILESTONE_FOLLOWERS &&
    followerCount < FOLLOWERS_10000_TARGET;

  const promoted = topSponsors.items.find((rec) => shouldPromoteSponsorCandidate(rec));
  const pitchLink = promoted ? await resolveSponsorBriefingLink(promoted) : null;
  const topPending = awaitingApproval[0] ?? null;

  return {
    pendingEmailApprovals: awaitingApproval.length,
    pitchReadyCount: pitchReadyRows.length,
    researchingProspects: researchingRows.length,
    unreadInboxReplies: inbound.filter((m) => isReplyActionable(m.actionability)).length,
    followerCount,
    followerTarget: FOLLOWERS_10000_TARGET,
    followerProgressPct,
    followersToGo,
    milestoneReached,
    nearMilestone,
    topPendingApprovalHref: topPending ? emailApprovalsHref(topPending.id) : null,
    topSponsorPitchHref: pitchLink?.href ?? null,
    topSponsorPitchLabel: pitchLink?.label ?? null,
    outreachMode: outreach.mode,
  };
}
