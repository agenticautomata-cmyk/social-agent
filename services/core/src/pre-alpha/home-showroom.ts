/**
 * Home creator showroom — sales page from live Benson business state.
 * Home ≠ Today task list. Assemble outcomes / leverage only.
 */

import type { ActionCenterItem, ActionCenterResponse } from '../action-center/types.js';
import type { InventoryItem } from '../inventory/normalize.js';
import { itemToCommandCenterCard, type CommandCenterCard } from '../inventory/command-center.js';
import { isReplyActionable } from '../gmail-inbox/inbound-actionability.js';
import type { SponsorRecommendation } from '../sponsor-intelligence/recommendations.js';
import { shouldPromoteSponsorCandidate } from '../sponsor-intelligence/priority.js';
import type { StudioPulse } from './studio-pulse.js';
import type { HomeDailyBriefing, HomeOpportunityCard, HomeRefreshSummary, HomeOperationalMetrics } from './operational-home.js';
import {
  classifyContentLanes,
  evaluateHomeShowroomGate,
  isOrdinaryPublicEvent,
  hasKellieCreatorFit,
} from './home-showroom-lanes.js';
import { evaluateHomeCategoryGuard, safeHomeReason } from './home-category-guard.js';
import { resolveHomePitchStatusLabel } from './home-pitch-ready.js';
import {
  canonicalHomeEntityKey,
  claimHomePlacement,
  filterByPlacementAuthority,
} from './home-placement.js';
import { buildWorthALook, type WorthALookCard } from './home-worth-a-look.js';
import {
  buildCoherentHomeAnalytics,
  type CoherentHomeAnalytics,
} from './home-analytics-coherence.js';
import { isAccountWideTotalViewsLine, type LatestVideoGrowth } from './home-video-growth.js';

export type HomeShowroomStat = { label: string; value: number };

export type HomeShowroomAction = {
  label: string;
  href: string;
  kind: 'primary' | 'secondary' | 'dismiss' | 'later' | 'details';
};

export type HomeShowroomCard = {
  id: string;
  title: string;
  reason: string;
  statusLabel?: string | null;
  href: string | null;
  contentItemId?: string | null;
  actions: HomeShowroomAction[];
};

export type HomeBusinessSummaryPoint = {
  id: string;
  text: string;
};

export type HomeCreatorAnalytics = {
  followers: {
    count: number;
    target: number;
    progressPct: number | null;
    remaining: number | null;
    milestoneReached: boolean;
    nearMilestone: boolean;
    /** Only when trustworthy historical delta exists. */
    trendLabel: string | null;
  } | null;
  activeDeals: number | null;
  sponsorPipelineActive: number | null;
  pendingOutreach: number | null;
  /** Real known revenue only — never invented. */
  revenueUsd: number | null;
  tiles: Array<{
    id: string;
    label: string;
    value: string;
    sub?: string | null;
    href?: string | null;
  }>;
};

export type HomeSinceLastSync = {
  headline: string;
  points: Array<{ id: string; text: string }>;
  quiet: boolean;
  previousCheckpointAt: string | null;
};

export type HomeShowroom = {
  hero: {
    headline: string;
    subline: string;
    stats: HomeShowroomStat[];
  };
  /** Durable delta since last operator Home sync/check-in. */
  sinceLastSync: HomeSinceLastSync;
  /** @deprecated Prefer sinceLastSync — kept as points alias for older clients. */
  businessSummary: HomeBusinessSummaryPoint[];
  /** Compact “Today’s Brief” — latest posting batch + one follower line. */
  todaysBrief: {
    headline: string | null;
    changes: string[];
    overflowChanges?: string[];
    followerLine?: string | null;
    asOf: string | null;
    anomaly: string | null;
  };
  bestMove: HomeShowroomCard | null;
  moneyOnTheTable: HomeShowroomCard[];
  /** Non-urgent valuable discoveries — omit when empty. */
  worthALook: WorthALookCard[];
  whatBensonHandled: Array<{ id: string; text: string }>;
  /** Rich creator analytics / growth block. */
  creatorAnalytics: HomeCreatorAnalytics;
  /** Compact tiles — same sources as creatorAnalytics (compat). */
  creatorMomentum: Array<{ id: string; label: string; value: string; href?: string | null }>;
  needsYou: HomeShowroomCard[];
  /** Authoritative follower count for this response (must match analytics). */
  analyticsSnapshot: CoherentHomeAnalytics;
};

function humanizeStatus(raw: string | null | undefined): string {
  if (!raw) return 'Worth acting on';
  const map: Record<string, string> = {
    ready_to_contact: 'Ready when you are',
    pitch_ready: 'Pitch ready',
    application_pending: 'Application pending',
    brand_replied: 'Brand replied',
    waiting_followup: 'Waiting on follow-up',
    reply_required: 'Reply needed',
    affiliate_verified: 'Affiliate path verified',
  };
  const key = raw.toLowerCase().trim().replace(/\s+/g, '_');
  if (map[key]) return map[key];
  if (/ready_to_contact/i.test(raw)) return 'Ready when you are';
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Strip internal enums / technical provenance from operator-facing copy. */
function humanizeCopy(raw: string | null | undefined, fallback: string): string {
  if (!raw?.trim()) return fallback;
  let text = raw.trim();
  text = text.replace(/\bready_to_contact\b/gi, 'Ready when you are');
  text = text.replace(/\bcreator_candidate\b/gi, 'creator opportunity');
  text = text.replace(/\bplanning lead\b/gi, 'worth a look');
  text = text.replace(/\breview for kellie fit\b/gi, 'Worth acting on');
  if (/^ready when you are$/i.test(text) || text.length < 8) {
    return fallback;
  }
  return text.slice(0, 180);
}

function isBulkHousekeeping(item: ActionCenterItem): boolean {
  const t = `${item.title} ${item.subtitle ?? ''}`;
  if (/\b\d{2,}\b/.test(t) && /pitch|approval|approve/i.test(t)) return true;
  if (/need approval|waiting approval|pitches need/i.test(t) && /\d+/.test(t)) return true;
  if (/unread email|open inbox|informational/i.test(t)) return true;
  return false;
}

function isWeakHousekeepingMove(card: HomeOpportunityCard | CommandCenterCard): boolean {
  const hay = `${card.title} ${card.whyItMatters}`;
  if (/\bverify date\b/i.test(hay)) return true;
  if (/\breview for kellie fit\b/i.test(hay)) return true;
  if (/\bplanning lead\b/i.test(hay)) return true;
  if (/\bopen opportunity\b/i.test(hay) && /incomplete|missing/i.test(hay)) return true;
  if (/fire[- ]?rescue|laura moriarty|owen pirch|djmaxx|sounds by/i.test(hay)) return true;
  return false;
}

function cardActions(input: {
  contentItemId: string | null;
  href: string | null;
  primaryLabel: string;
}): HomeShowroomAction[] {
  const actions: HomeShowroomAction[] = [];
  if (input.href) {
    actions.push({ label: input.primaryLabel, href: input.href, kind: 'primary' });
  }
  // Dismiss/Later are executed client-side via existing creator-skip authority
  // (DiscoverySkipButton) when contentItemId is present — not as GET links.
  if (input.contentItemId) {
    actions.push({ label: 'Later', href: '', kind: 'later' });
    actions.push({ label: 'Dismiss', href: '', kind: 'dismiss' });
    actions.push({
      label: 'Details',
      href: `/discoveries/${input.contentItemId}`,
      kind: 'details',
    });
  } else if (input.href) {
    actions.push({ label: 'Details', href: input.href, kind: 'details' });
  }
  return actions;
}

function sponsorPassesHomeCategory(sponsor: SponsorRecommendation, item: InventoryItem | undefined): boolean {
  const title = sponsor.businessName || sponsor.title || item?.title || '';
  const guard = evaluateHomeCategoryGuard({
    title,
    category: item?.category ?? null,
    reason: sponsor.whyBensonRecommends || item?.whyItMatters || null,
    businessName: sponsor.businessName,
  });
  if (!guard.ok) return false;
  const cat = (item?.category ?? '').toLowerCase();
  // Article / professional-service misroutes are not monetization paths.
  if (cat === 'local_story' || cat === 'professional_services' || cat === 'needs_category_review') {
    return false;
  }
  if (/\b(law\b|legal services?|destigmatiz|difficult conversations)\b/i.test(title)) {
    return false;
  }
  return true;
}

function statusLabelForSponsor(sponsor: SponsorRecommendation, item: InventoryItem | undefined): string {
  const resolved = resolveHomePitchStatusLabel({
    businessName: sponsor.businessName || 'Sponsor',
    title: sponsor.title || item?.title,
    category: item?.category,
    reason: sponsor.whyBensonRecommends || item?.whyItMatters,
    contentItemId: sponsor.contentItemId,
    creatorValueEligible: item
      ? item.creatorValueStatus !== 'rejected' && item.creatorValueStatus !== 'archived'
      : true,
    // Promotion alone is not pitch-ready — require outreach evidence upstream.
    hasConcreteAngle: Boolean(
      sponsor.recommendedPitchAngle && sponsor.recommendedPitchAngle !== 'NO VALID ANGLE',
    ),
    hasTimingReason: true,
    contactVerificationStatus: sponsor.sponsorContactId ? 'found_unverified' : 'missing',
    hasPersonalizedDraft: false,
    hasDeliverableValueProp: false,
    sendMechanismAvailable: Boolean(sponsor.sponsorContactId),
  });
  return resolved.label;
}

function pickBestMove(input: {
  inventory: InventoryItem[];
  dailyBriefing: HomeDailyBriefing;
  topOpportunities: HomeOpportunityCard[];
  topSponsors: SponsorRecommendation[];
  claimed: Set<string>;
}): HomeShowroomCard | null {
  // Prefer a genuine sponsor path with valid link.
  for (const sponsor of input.topSponsors.slice(0, 8)) {
    if (!shouldPromoteSponsorCandidate(sponsor)) continue;
    if (!sponsor.contentItemId) continue;
    const item = input.inventory.find((i) => i.id === sponsor.contentItemId);
    // Skipped/dismissed inventory is already filtered out of load — require live item.
    if (!item || !evaluateHomeShowroomGate(item).eligible) continue;
    if (!sponsorPassesHomeCategory(sponsor, item)) continue;
    const key = canonicalHomeEntityKey({
      contentItemId: sponsor.contentItemId,
      businessName: sponsor.businessName,
      title: sponsor.title,
    });
    if (!claimHomePlacement(input.claimed, key)) continue;
    const href = `/sponsor-intelligence/businesses/${sponsor.contentItemId}`;
    return {
      id: `sponsor-${sponsor.contentItemId}`,
      title: sponsor.businessName || 'Sponsor opportunity',
      reason: safeHomeReason(
        {
          title: sponsor.businessName || sponsor.title,
          category: item.category,
          reason: sponsor.whyBensonRecommends,
          businessName: sponsor.businessName,
        },
        'Strong sponsor path worth acting on now.',
      ),
      statusLabel: statusLabelForSponsor(sponsor, item),
      href,
      contentItemId: sponsor.contentItemId,
      actions: cardActions({
        contentItemId: sponsor.contentItemId,
        href,
        primaryLabel: 'Review pitch path',
      }),
    };
  }

  const candidates = [
    ...input.dailyBriefing.highestPriority,
    ...input.topOpportunities,
    ...input.dailyBriefing.topBusinessOpenings,
  ];
  const seen = new Set<string>();
  for (const card of candidates) {
    if (seen.has(card.id)) continue;
    seen.add(card.id);
    if (isWeakHousekeepingMove(card)) continue;
    const item = input.inventory.find((i) => i.id === card.id);
    if (!item) continue;
    if (!evaluateHomeShowroomGate(item).eligible) continue;
    if (isOrdinaryPublicEvent(item) && !hasKellieCreatorFit(item)) continue;
    const lanes = classifyContentLanes(item);
    if (!lanes.includes('home_best_move') && !lanes.includes('film_this') && !lanes.includes('home_money')) {
      continue;
    }
    const guard = evaluateHomeCategoryGuard({
      title: item.title,
      category: item.category,
      reason: card.whyItMatters,
      businessName: item.businessName,
    });
    if (!guard.ok) continue;
    const key = canonicalHomeEntityKey({
      contentItemId: item.id,
      businessName: item.businessName,
      title: item.title,
    });
    if (!claimHomePlacement(input.claimed, key)) continue;
    const href = `/discoveries/${card.id}`;
    return {
      id: card.id,
      title: card.title,
      reason: safeHomeReason(
        {
          title: item.title,
          category: item.category,
          reason: card.whyItMatters,
          businessName: item.businessName,
        },
        'Worth acting on now.',
      ),
      statusLabel: 'Worth acting on',
      href,
      contentItemId: card.id,
      actions: cardActions({
        contentItemId: card.id,
        href,
        primaryLabel: item.flags.sponsorFriendly ? 'Review sponsor path' : 'Use this',
      }),
    };
  }
  return null;
}

function buildMoneyOnTheTable(input: {
  topSponsors: SponsorRecommendation[];
  studioPulse: StudioPulse;
  inventory: InventoryItem[];
  pipelineOpenDeals: number;
  claimed: Set<string>;
}): HomeShowroomCard[] {
  const out: HomeShowroomCard[] = [];
  for (const sponsor of input.topSponsors.slice(0, 8)) {
    if (!shouldPromoteSponsorCandidate(sponsor)) continue;
    if (!sponsor.contentItemId) continue;
    const item = input.inventory.find((i) => i.id === sponsor.contentItemId);
    if (!item || !evaluateHomeShowroomGate(item).eligible) continue;
    if (!sponsorPassesHomeCategory(sponsor, item)) continue;
    const key = canonicalHomeEntityKey({
      contentItemId: sponsor.contentItemId,
      businessName: sponsor.businessName,
      title: sponsor.title,
    });
    if (!claimHomePlacement(input.claimed, key)) continue;
    const href = `/sponsor-intelligence/businesses/${sponsor.contentItemId}`;
    out.push({
      id: `money-${sponsor.contentItemId}`,
      title: sponsor.businessName || 'Sponsor path',
      reason: safeHomeReason(
        {
          title: sponsor.businessName || sponsor.title,
          category: item.category,
          reason: sponsor.whyBensonRecommends,
          businessName: sponsor.businessName,
        },
        'Active monetization path.',
      ),
      statusLabel: statusLabelForSponsor(sponsor, item),
      href,
      contentItemId: sponsor.contentItemId,
      actions: cardActions({
        contentItemId: sponsor.contentItemId,
        href,
        primaryLabel: 'Review',
      }),
    });
    if (out.length >= 3) break;
  }

  // Only surface a pitch-ready aggregate when studio pulse has real pitch-ready drafts.
  if (input.studioPulse.pitchReadyCount > 0 && input.studioPulse.topSponsorPitchHref) {
    const pitchKey = canonicalHomeEntityKey({
      title: input.studioPulse.topSponsorPitchLabel ?? 'pitch_ready',
      id: 'money-pitch-ready',
    });
    if (claimHomePlacement(input.claimed, pitchKey)) {
      out.push({
        id: 'money-pitch-ready',
        title: input.studioPulse.topSponsorPitchLabel ?? 'Pitch draft ready',
        reason: 'Benson advanced a sponsor pitch path with draft evidence.',
        statusLabel: 'Pitch draft ready',
        href: input.studioPulse.topSponsorPitchHref,
        contentItemId: null,
        actions: [
          {
            label: 'Review pitch',
            href: input.studioPulse.topSponsorPitchHref,
            kind: 'primary',
          },
        ],
      });
    }
  }

  if (input.pipelineOpenDeals > 0 && out.length < 3) {
    out.push({
      id: 'money-pipeline',
      title: `${input.pipelineOpenDeals} open deal${input.pipelineOpenDeals === 1 ? '' : 's'}`,
      reason: 'Active partnership pipeline Benson is tracking.',
      statusLabel: 'In pipeline',
      href: '/pipeline',
      contentItemId: null,
      actions: [{ label: 'Open pipeline', href: '/pipeline', kind: 'primary' }],
    });
  }

  return out.slice(0, 3);
}

function buildWhatBensonHandled(input: {
  refresh: HomeRefreshSummary;
  metrics: HomeOperationalMetrics;
  inventory: InventoryItem[];
  studioPulse: StudioPulse;
}): Array<{ id: string; text: string }> {
  const items: Array<{ id: string; text: string }> = [];
  const screened = input.refresh.itemsDiscovered || input.refresh.newItemsSinceRefresh;
  if (screened > 0) {
    items.push({
      id: 'handled-screened',
      text: `Screened ${screened} opportunit${screened === 1 ? 'y' : 'ies'} from live sources`,
    });
  }

  const expired = input.inventory.filter((i) => i.lifecycleStatus === 'expired').length;
  if (expired > 0) {
    items.push({
      id: 'handled-expired',
      text: `Expired ${Math.min(expired, 99)} stale event${expired === 1 ? '' : 's'} automatically`,
    });
  }

  const weak = input.inventory.filter(
    (i) =>
      i.creatorValueStatus === 'hidden_raw_signal' ||
      i.creatorValueStatus === 'rejected' ||
      (i.audienceScore < 3 && !i.flags.sponsorFriendly),
  ).length;
  if (weak > 0) {
    items.push({
      id: 'handled-filtered',
      text: `Filtered ${Math.min(weak, 99)} low-value signal${weak === 1 ? '' : 's'} out of your way`,
    });
  }

  if (input.metrics.sponsorCandidates > 0) {
    items.push({
      id: 'handled-sponsors',
      text: `Tracking ${input.metrics.sponsorCandidates} sponsor candidate${input.metrics.sponsorCandidates === 1 ? '' : 's'}`,
    });
  }

  if (input.studioPulse.researchingProspects > 0) {
    items.push({
      id: 'handled-research',
      text: `Advanced research on ${input.studioPulse.researchingProspects} prospect${input.studioPulse.researchingProspects === 1 ? '' : 's'}`,
    });
  }

  if (items.length === 0) {
    items.push({
      id: 'handled-watch',
      text: 'Benson kept watch on sources — nothing urgent needed your attention',
    });
  }

  return items.slice(0, 6);
}

function buildCreatorAnalytics(input: {
  studioPulse: StudioPulse;
  metrics: HomeOperationalMetrics;
  pipelineOpenDeals: number;
  revenueUsd: number | null;
  followerTrendLabel: string | null;
}): HomeCreatorAnalytics {
  const pulse = input.studioPulse;
  const followers =
    pulse.followerCount != null
      ? {
          count: pulse.followerCount,
          target: pulse.followerTarget || 10_000,
          progressPct: pulse.followerProgressPct,
          remaining: pulse.followersToGo,
          milestoneReached: pulse.milestoneReached,
          nearMilestone: pulse.nearMilestone,
          trendLabel: input.followerTrendLabel,
        }
      : null;

  const activeDeals =
    input.pipelineOpenDeals > 0
      ? input.pipelineOpenDeals
      : input.metrics.activeDeals > 0
        ? input.metrics.activeDeals
        : input.metrics.activePipelineDeals > 0
          ? input.metrics.activePipelineDeals
          : null;

  const sponsorPipelineActive =
    input.metrics.sponsorCandidates > 0
      ? input.metrics.sponsorCandidates
      : pulse.pitchReadyCount > 0
        ? pulse.pitchReadyCount
        : null;

  // Active outreach drafts — not bulk approval chore counts.
  const pendingOutreach =
    input.metrics.pendingOutreach > 0 && input.metrics.pendingOutreach < 40
      ? input.metrics.pendingOutreach
      : pulse.pitchReadyCount > 0
        ? pulse.pitchReadyCount
        : null;

  const revenueUsd =
    input.revenueUsd != null && Number.isFinite(input.revenueUsd) && input.revenueUsd > 0
      ? input.revenueUsd
      : null;

  const tiles: HomeCreatorAnalytics['tiles'] = [];
  if (followers) {
    const pct =
      followers.progressPct != null ? `${followers.progressPct}% there` : null;
    const remaining =
      followers.remaining != null && followers.remaining > 0
        ? `${followers.remaining.toLocaleString()} to go`
        : followers.milestoneReached
          ? '10K milestone reached'
          : null;
    tiles.push({
      id: 'analytics-followers',
      label: 'Followers',
      value: `${followers.count.toLocaleString()} / ${followers.target.toLocaleString()}`,
      sub: [pct, remaining, followers.trendLabel].filter(Boolean).join(' · ') || null,
      href: '/analytics/tiktok',
    });
  }
  if (activeDeals != null) {
    tiles.push({
      id: 'analytics-deals',
      label: 'Active deals',
      value: String(activeDeals),
      sub: null,
      href: '/pipeline',
    });
  }
  if (sponsorPipelineActive != null) {
    tiles.push({
      id: 'analytics-pipeline',
      label: 'Sponsor pipeline',
      value: `${sponsorPipelineActive} active path${sponsorPipelineActive === 1 ? '' : 's'}`,
      sub: null,
      href: '/sponsor-intelligence',
    });
  }
  if (pendingOutreach != null && pendingOutreach !== sponsorPipelineActive) {
    tiles.push({
      id: 'analytics-outreach',
      label: 'Pitch paths ready',
      value: String(pendingOutreach),
      sub: null,
      href: pulse.topSponsorPitchHref ?? '/partnerships',
    });
  }
  if (revenueUsd != null) {
    tiles.push({
      id: 'analytics-revenue',
      label: 'Revenue won',
      value: `$${Math.round(revenueUsd).toLocaleString()}`,
      sub: 'This month',
      href: '/revenue',
    });
  }

  return {
    followers,
    activeDeals,
    sponsorPipelineActive,
    pendingOutreach,
    revenueUsd,
    tiles: tiles.slice(0, 5),
  };
}

function buildNeedsYou(input: {
  actions: ActionCenterResponse;
}): HomeShowroomCard[] {
  const out: HomeShowroomCard[] = [];
  const seen = new Set<string>();

  for (const item of [...input.actions.priorities.critical, ...input.actions.doNow]) {
    if (out.length >= 3) break;
    if (isBulkHousekeeping(item)) continue;
    if (!item.href) continue;
    // Unread-only / informational / ShopMy-style non-reply must not enter Needs You.
    const hay = `${item.title} ${item.subtitle ?? ''}`;
    if (/shopmy|you'?re in|no action needed|informational|newsletter/i.test(hay)) {
      continue;
    }
    if (/open inbox|unread/i.test(item.title) && !/reply|respond/i.test(item.title)) continue;
    if (/\d+\s+pitch/i.test(hay) && /approval/i.test(hay)) continue;
    if (seen.has(item.id)) continue;
    seen.add(item.id);

    const meta = item.meta ?? {};
    const actionability = typeof meta.actionability === 'string' ? meta.actionability : null;
    if (
      actionability &&
      !isReplyActionable(actionability) &&
      /email|inbox|reply|shopmy/i.test(hay)
    ) {
      continue;
    }
    // Email-shaped items without reply_required stay off Needs You.
    if (/email|inbox|reply:/i.test(hay) && actionability !== 'reply_required') {
      if (!actionability || !isReplyActionable(actionability)) continue;
    }

    const contentItemId = typeof meta.contentItemId === 'string' ? meta.contentItemId : null;
    out.push({
      id: item.id,
      title: humanizeCopy(item.title, 'Decision needed'),
      reason: humanizeCopy(item.subtitle, 'Benson needs your decision.'),
      statusLabel: 'Needs you',
      href: item.href,
      contentItemId,
      actions: cardActions({
        contentItemId,
        href: item.href,
        primaryLabel: /reply|respond/i.test(item.title) ? 'Review reply' : 'Decide',
      }),
    });
  }

  return out.slice(0, 3);
}

export function buildHomeShowroom(input: {
  inventory: InventoryItem[];
  dailyBriefing: HomeDailyBriefing;
  topOpportunities: HomeOpportunityCard[];
  topSponsorCandidates: SponsorRecommendation[];
  refresh: HomeRefreshSummary;
  metrics: HomeOperationalMetrics;
  studioPulse: StudioPulse;
  actions: ActionCenterResponse;
  pipelineOpenDeals: number;
  greeting: string;
  revenueUsd?: number | null;
  followerTrendLabel?: string | null;
  sinceLastSync: HomeSinceLastSync;
  /** Optional pulse brief lines for Today's Brief coherence. */
  pulseBrief?: {
    headline?: string | null;
    progressSummary?: string | null;
    whatChanged?: string[] | null;
    dataThrough?: string | null;
    createdAt?: string | null;
    videoGrowth?: LatestVideoGrowth | null;
  } | null;
}): HomeShowroom {
  const claimed = new Set<string>();
  const screened = input.refresh.itemsDiscovered || input.refresh.newItemsSinceRefresh || 0;
  const weakFiltered = input.inventory.filter(
    (i) => i.creatorValueStatus === 'hidden_raw_signal' || i.creatorValueStatus === 'rejected',
  ).length;
  const expired = input.inventory.filter((i) => i.lifecycleStatus === 'expired').length;
  const sponsorsAdvanced = input.topSponsorCandidates.filter((s) => shouldPromoteSponsorCandidate(s)).length;

  const heroStats: HomeShowroomStat[] = [];
  if (screened > 0) heroStats.push({ label: 'opportunities screened', value: screened });
  if (sponsorsAdvanced > 0) heroStats.push({ label: 'sponsor paths advanced', value: Math.min(sponsorsAdvanced, 12) });
  if (expired > 0) heroStats.push({ label: 'deadlines protected', value: Math.min(expired, 40) });
  if (weakFiltered > 0) heroStats.push({ label: 'low-value signals filtered', value: Math.min(weakFiltered, 99) });
  if (heroStats.length === 0) {
    heroStats.push({ label: 'sources watched', value: input.metrics.healthySources || input.refresh.healthySources || 0 });
  }

  // Placement order: Needs You → Best Move → Money → Worth a Look
  const needsYou = filterByPlacementAuthority(
    buildNeedsYou({ actions: input.actions }),
    claimed,
    (card) =>
      canonicalHomeEntityKey({
        contentItemId: card.contentItemId,
        title: card.title,
        id: card.id,
      }),
  );

  const bestMove = pickBestMove({
    inventory: input.inventory,
    dailyBriefing: input.dailyBriefing,
    topOpportunities: input.topOpportunities,
    topSponsors: input.topSponsorCandidates,
    claimed,
  });

  const moneyOnTheTable = buildMoneyOnTheTable({
    topSponsors: input.topSponsorCandidates,
    studioPulse: input.studioPulse,
    inventory: input.inventory,
    pipelineOpenDeals: input.pipelineOpenDeals,
    claimed,
  });

  const worthALook = buildWorthALook({
    inventory: input.inventory,
    claimedKeys: claimed,
    limit: 3,
  });

  const analyticsSnapshot = buildCoherentHomeAnalytics({
    asOf: input.pulseBrief?.dataThrough ?? input.pulseBrief?.createdAt ?? null,
    authoritativeFollowers: input.studioPulse.followerCount ?? null,
    progressSummary: input.pulseBrief?.progressSummary,
    whatChanged: input.pulseBrief?.whatChanged,
    headline: input.pulseBrief?.headline,
    videoGrowth: input.pulseBrief?.videoGrowth,
  });

  const creatorAnalytics = buildCreatorAnalytics({
    studioPulse: input.studioPulse,
    metrics: input.metrics,
    pipelineOpenDeals: input.pipelineOpenDeals,
    revenueUsd: input.revenueUsd ?? null,
    followerTrendLabel: input.followerTrendLabel ?? null,
  });
  // Force one follower total across the response.
  if (creatorAnalytics.followers && analyticsSnapshot.followers != null) {
    creatorAnalytics.followers.count = analyticsSnapshot.followers;
  }

  const fillerChangeRe = /^Nothing major changed since your last sync/i;
  const hasVideoGrowth = (analyticsSnapshot.videoIds?.length ?? 0) > 0;
  const hasStructuredGrowthBrief = Boolean(input.pulseBrief?.videoGrowth);
  const skipSyncFiller = hasVideoGrowth || hasStructuredGrowthBrief;
  const hasNamedVideo = Boolean(analyticsSnapshot.latestVideoId || analyticsSnapshot.headline);
  const growthFirst = analyticsSnapshot.changes.filter((text) => {
    if (fillerChangeRe.test(text)) return false;
    if (hasNamedVideo && isAccountWideTotalViewsLine(text)) return false;
    if (analyticsSnapshot.headline && text === analyticsSnapshot.headline) return false;
    return true;
  });
  const syncPoints = skipSyncFiller
    ? []
    : input.sinceLastSync.points
        .filter((p) => p.id !== 'followers-delta' && p.id !== 'followers-remain')
        .slice(0, 2)
        .map((p) => p.text)
        .filter((text) => {
          if (fillerChangeRe.test(text) && growthFirst.length > 0) return false;
          if (hasNamedVideo && isAccountWideTotalViewsLine(text)) return false;
          return true;
        });
  const briefChanges = skipSyncFiller
    ? growthFirst
    : [...growthFirst, ...syncPoints]
        .filter((text, index, all) => {
          if (!fillerChangeRe.test(text)) return all.indexOf(text) === index;
          return !all.some((other, otherIndex) => otherIndex !== index && !fillerChangeRe.test(other));
        })
        .slice(0, 3);

  return {
    hero: {
      headline: 'Benson worked while you created.',
      subline: 'Here is the leverage from your live KC business.',
      stats: heroStats.slice(0, 4),
    },
    sinceLastSync: input.sinceLastSync,
    businessSummary: input.sinceLastSync.points,
    todaysBrief: {
      headline: analyticsSnapshot.headline,
      changes: briefChanges,
      overflowChanges: analyticsSnapshot.overflowChanges,
      followerLine: analyticsSnapshot.followerLine,
      asOf: analyticsSnapshot.asOf ?? input.sinceLastSync.previousCheckpointAt,
      anomaly: analyticsSnapshot.anomaly,
    },
    bestMove,
    moneyOnTheTable,
    worthALook,
    whatBensonHandled: buildWhatBensonHandled({
      refresh: input.refresh,
      metrics: input.metrics,
      inventory: input.inventory,
      studioPulse: input.studioPulse,
    }),
    creatorAnalytics,
    creatorMomentum: creatorAnalytics.tiles.map((t) => ({
      id: t.id,
      label: t.label,
      value: t.sub ? `${t.value} · ${t.sub}` : t.value,
      href: t.href,
    })),
    needsYou,
    analyticsSnapshot,
  };
}

/** Test helper: convert inventory item to showroom candidate card. */
export function inventoryItemToShowroomProbe(item: InventoryItem): {
  lanes: ReturnType<typeof classifyContentLanes>;
  showroomEligible: boolean;
  card: CommandCenterCard;
} {
  return {
    lanes: classifyContentLanes(item),
    showroomEligible: evaluateHomeShowroomGate(item).eligible,
    card: itemToCommandCenterCard(item),
  };
}
