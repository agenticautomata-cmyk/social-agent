import { computeActionCenter } from '../action-center/hub.js';
import { computePipelineDashboard } from '../sponsor-pipeline/opportunities.js';
import { getOutreachSendConfig } from '../sponsor-outreach/send.js';
import { loadIngestedInventoryItems } from '../inventory/load-ingested.js';
import { filterInventoryItems } from '../inventory/normalize.js';
import { computePreAlphaStatus } from './status.js';
import {
  computeOperationalHomeData,
  type HomeDailyBriefing,
  type HomeOperationalMetrics,
  type HomeOpportunityCard,
  type HomeRefreshSummary,
  type HomeSourceHealth,
} from './operational-home.js';
import { computeStudioPulse, type StudioPulse } from './studio-pulse.js';
import {
  shouldPromoteSponsorCandidate,
  resolveSponsorBriefingLink,
} from '../sponsor-intelligence/priority.js';
import { localHourInTimezone } from '../datetime.js';
import { computeSponsorIntelligence } from '../sponsor-intelligence/recommendations.js';
import { rankedSponsorRecommendationsFromIntel } from '../sponsor-intelligence/top-candidates.js';
import { buildSpendSummary, type SpendSummary } from '../llm-spend/index.js';
import type { SponsorRecommendation } from '../sponsor-intelligence/recommendations.js';
import {
  getHomeComputationMetrics,
  logHomeComputationDiagnostic,
  readProcessRssKb,
  recordHomeInventoryLoad,
  recordHomeSponsorIntelCompute,
  resetHomeComputationMetricsForTests,
  beginHomeComputationMetrics,
} from './home-computation-metrics.js';
import { buildHomeShowroom, type HomeShowroom } from './home-showroom.js';
import { homeWatchlistBriefLines } from '../curator-watchlist/watchlist-intelligence.js';
import {
  buildCurrentHomeSyncSnapshot,
  computeSinceLastSyncDeltas,
  detectShopMyAcceptedSince,
  loadHomeOperatorSyncCheckpoint,
  saveHomeOperatorSyncCheckpoint,
} from './home-since-last-sync.js';

export type HomeQuickLink = {
  href: string;
  label: string;
  description: string;
};

export type HomePriority = {
  rank: number;
  label: string;
  href: string | null;
};

export type PreAlphaHomeResponse = {
  demoMode: boolean;
  generatedAt: string;
  greeting: string;
  subline: string;
  priorities: HomePriority[];
  quickLinks: HomeQuickLink[];
  stats: {
    openActions: number;
    overdueActions: number;
    pipelineValue: number;
    openDeals: number;
    outreachMode: string;
  };
  systemOk: boolean;
  metrics: HomeOperationalMetrics;
  sourceHealth: HomeSourceHealth;
  refresh: HomeRefreshSummary;
  topOpportunities: HomeOpportunityCard[];
  topSponsorCandidates: SponsorRecommendation[];
  dailyBriefing: HomeDailyBriefing;
  studioPulse: StudioPulse;
  /** Creator showroom — Home sales page (outcomes / leverage). */
  showroom: HomeShowroom;
  aiSpend: Pick<
    SpendSummary,
    'todayCostUsd' | 'dailyAverageUsd' | 'budgetUsd' | 'budgetExceeded' | 'breakdown'
  > | null;
};

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}_timeout_${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

async function softTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
  fallback: T,
): Promise<T> {
  try {
    return await withTimeout(promise, ms, label);
  } catch (err) {
    console.warn(`[pre-alpha/home] ${label} degraded:`, err instanceof Error ? err.message : err);
    return fallback;
  }
}

const EMPTY_STUDIO_PULSE: StudioPulse = {
  pendingEmailApprovals: 0,
  pitchReadyCount: 0,
  researchingProspects: 0,
  unreadInboxReplies: 0,
  followerCount: null,
  followerTarget: 10_000,
  followerProgressPct: null,
  followersToGo: null,
  milestoneReached: false,
  nearMilestone: false,
  topPendingApprovalHref: null,
  topSponsorPitchHref: null,
  topSponsorPitchLabel: null,
  outreachMode: 'simulate',
};

let homeComputationInFlight: Promise<PreAlphaHomeResponse> | null = null;

export function resetHomeSingleflightForTests(): void {
  homeComputationInFlight = null;
  resetHomeComputationMetricsForTests();
}

/** @internal Test helper to simulate in-flight rejection cleanup. */
export function __setHomeComputationInFlightForTests(
  promise: Promise<PreAlphaHomeResponse> | null,
): void {
  homeComputationInFlight = promise;
}

/** @internal Exported for regression tests. */
export async function computePreAlphaHomeInternal(options?: {
  now?: Date;
  demoMode?: boolean;
  excludeCategories?: string[];
}): Promise<PreAlphaHomeResponse> {
  const now = options?.now ?? new Date();
  const excludeCategories = options?.excludeCategories;
  const rssBeforeKb = readProcessRssKb();
  const startedAt = Date.now();

  beginHomeComputationMetrics();
  recordHomeInventoryLoad();
  let inventory = await loadIngestedInventoryItems();
  if (excludeCategories?.length) {
    inventory = filterInventoryItems(inventory, { excludeCategories });
  }

  recordHomeSponsorIntelCompute();
  const sharedSponsorIntel = await computeSponsorIntelligence(inventory, { limit: 50 });
  const sharedSponsorRanked = rankedSponsorRecommendationsFromIntel(sharedSponsorIntel);

  const sharedSnapshot = {
    inventory,
    sharedSponsorIntel,
    sharedSponsorRanked,
  };

  const [status, actions, pipeline, operational, studioPulse, aiSpendRaw] = await Promise.all([
    softTimeout(
      computePreAlphaStatus(),
      8_000,
      'status',
      {
        ok: true,
        generatedAt: now.toISOString(),
        version: 'degraded',
        demoMode: options?.demoMode ?? false,
        database: 'ok' as const,
        outreach: { mode: 'simulate' as const, liveEnabled: false, liveReady: false },
        flags: {
          enableOpportunitiesApi: true,
          enableOpportunitiesUi: true,
          enableBensonBranding: true,
          enableKcScanner: false,
          disableVideoPipeline: true,
        },
        safety: { liveSendBlocked: true, preAlphaReady: true },
      },
    ),
    softTimeout(
      computeActionCenter({
        now,
        demoMode: options?.demoMode,
        excludeCategories,
        inventory: sharedSnapshot.inventory,
        sharedSponsorRanked: sharedSnapshot.sharedSponsorRanked,
        sharedSponsorIntel: sharedSnapshot.sharedSponsorIntel,
      }),
      20_000,
      'action_center',
      {
        demoMode: options?.demoMode ?? false,
        generatedAt: now.toISOString(),
        sections: {
          pendingFollowUps: [],
          pendingSponsorEmails: [],
          contentWaitingForApproval: [],
          upcomingPlannedContent: [],
          sponsorOpportunitiesNeedingUpdates: [],
          tiktokOperatorMoves: [],
        },
        notifications: { overdue: [], dueToday: [], dueThisWeek: [] },
        priorities: { critical: [], important: [], suggested: [] },
        doNow: [],
        counts: { total: 0, overdue: 0, dueToday: 0 },
      },
    ),
    softTimeout(computePipelineDashboard(now), 12_000, 'pipeline', {
      generatedAt: now.toISOString(),
      totalPipelineValue: 0,
      openDealCount: 0,
      wonThisMonth: { count: 0, value: 0 },
      lostThisMonth: { count: 0 },
      conversionRate: 0,
      averageDealSize: 0,
      byStatus: [],
      opportunities: [],
    }),
    softTimeout(
      computeOperationalHomeData({
        excludeCategories,
        inventory: sharedSnapshot.inventory,
        sharedSponsorIntel: sharedSnapshot.sharedSponsorIntel,
        sharedSponsorRanked: sharedSnapshot.sharedSponsorRanked,
      }),
      35_000,
      'operational',
      {
        metrics: {
          totalSources: 0,
          healthySources: 0,
          contentItems: 0,
          sponsorCandidates: 0,
          activePipelineDeals: 0,
          sponsorLeads: 0,
          activeDeals: 0,
          pendingOutreach: 0,
          connectedAccounts: 0,
        },
        sourceHealth: {
          totalSources: 0,
          healthySources: 0,
          unhealthySources: 0,
          disabledSources: 0,
        },
        refresh: {
          lastRefreshAt: null,
          itemsDiscovered: 0,
          healthySources: 0,
          failedSources: 0,
          newItemsSinceRefresh: 0,
        },
        topOpportunities: [],
        topSponsorCandidates: [],
        dailyBriefing: {
          topEvents: [],
          topSponsorOpportunities: [],
          topBusinessOpenings: [],
          highestPriority: [],
          askBensonToday: [],
        },
      },
    ),
    softTimeout(
      computeStudioPulse({
        inventory: sharedSnapshot.inventory,
        sharedSponsorRanked: sharedSnapshot.sharedSponsorRanked,
        sharedSponsorIntel: sharedSnapshot.sharedSponsorIntel,
      }),
      12_000,
      'studio_pulse',
      EMPTY_STUDIO_PULSE,
    ),
    softTimeout(buildSpendSummary(7), 8_000, 'ai_spend', null),
  ]);

  const outreach = await softTimeout(getOutreachSendConfig(), 6_000, 'outreach_config', {
    mode: 'simulate' as const,
    liveEnabled: false,
    liveReady: false,
    provider: null,
    missingForLive: [],
    fromEmail: null,
    replyTo: null,
    gmailConnected: false,
  });
  const hour = localHourInTimezone(now);
  const greeting =
    hour < 12 ? 'Good morning, Kellie' : hour < 17 ? 'Good afternoon, Kellie' : 'Good evening, Kellie';

  const quickLinks: HomeQuickLink[] = [
    { href: '/editor', label: 'Today', description: 'Daily briefing and post picks' },
    { href: '/discoveries', label: 'Discoveries', description: 'Vote more / less / not interested' },
    { href: '/email/approvals', label: 'Pitches', description: 'Benson-drafted pitches awaiting approval' },
    { href: '/calendar', label: 'Calendar', description: 'Plans and Google sync' },
    { href: '/actions', label: 'Actions', description: 'Follow-ups and one-click tasks' },
    { href: '/sponsor-intelligence', label: 'Sponsor intel', description: 'Who to contact first' },
    { href: '/sponsors', label: 'Sponsors', description: 'CRM contacts and notes' },
    { href: '/pipeline', label: 'Pipeline', description: 'Deal stages and values' },
    { href: '/revenue', label: 'Revenue', description: 'Business health and forecast' },
    { href: '/analytics', label: 'Analytics', description: 'TikTok performance' },
  ];

  const priorities: HomePriority[] = actions.doNow.slice(0, 4).map((item, i) => ({
    rank: i + 1,
    label: item.title,
    href: item.href,
  }));

  if (priorities.length === 0) {
    priorities.push({
      rank: 1,
      label: 'Open your daily briefing',
      href: '/editor',
    });
  }

  if (studioPulse.pendingEmailApprovals > 0) {
    const label = `${studioPulse.pendingEmailApprovals} pitch${studioPulse.pendingEmailApprovals === 1 ? '' : 'es'} waiting approval`;
    const pitchHref = studioPulse.topPendingApprovalHref ?? '/email/approvals';
    if (!priorities.some((p) => p.href === '/email/approvals' || p.href?.startsWith('/email/approvals?'))) {
      priorities.unshift({ rank: 1, label, href: pitchHref });
      priorities.forEach((p, i) => {
        p.rank = i + 1;
      });
      if (priorities.length > 4) priorities.length = 4;
    }
  } else if (!priorities.some((p) => p.href === '/email/approvals' || p.href?.startsWith('/email/approvals?'))) {
    priorities.push({
      rank: priorities.length + 1,
      label: 'Pitches — no drafts waiting',
      href: '/email/approvals',
    });
    if (priorities.length > 4) priorities.length = 4;
  }

  if (studioPulse.unreadInboxReplies > 0) {
    const label = `${studioPulse.unreadInboxReplies} sponsor repl${studioPulse.unreadInboxReplies === 1 ? 'y' : 'ies'} in inbox`;
    if (!priorities.some((p) => p.href === '/email/inbox')) {
      priorities.unshift({ rank: 1, label, href: '/email/inbox' });
      priorities.forEach((p, i) => {
        p.rank = i + 1;
      });
      if (priorities.length > 4) priorities.length = 4;
    }
  }

  if (studioPulse.nearMilestone && studioPulse.followersToGo != null) {
    const label = `${studioPulse.followersToGo.toLocaleString()} followers to 10K — sponsor money zone`;
    if (!priorities.some((p) => p.label.includes('10K'))) {
      priorities.unshift({ rank: 1, label, href: '/analytics/tiktok' });
      priorities.forEach((p, i) => {
        p.rank = i + 1;
      });
      if (priorities.length > 4) priorities.length = 4;
    }
  }

  const topSponsor = operational.dailyBriefing.topSponsorOpportunities[0];
  if (topSponsor && shouldPromoteSponsorCandidate(topSponsor)) {
    const link = await resolveSponsorBriefingLink(topSponsor);
    const duplicate = priorities.some((p) => p.href === link.href || p.label === link.label);
    if (!duplicate) {
      priorities.unshift({
        rank: 1,
        label: link.label,
        href: link.href,
      });
      priorities.forEach((p, i) => {
        p.rank = i + 1;
      });
      if (priorities.length > 4) priorities.length = 4;
    }
  }

  if (priorities.length < 4 && operational.topOpportunities[0]) {
    priorities.push({
      rank: priorities.length + 1,
      label: operational.topOpportunities[0].title,
      href: `/review/inventory?id=${operational.topOpportunities[0].id}`,
    });
  }

  const previousSync = await softTimeout(loadHomeOperatorSyncCheckpoint(), 4_000, 'home_sync_checkpoint', null);
  const shopMyAccepted = await softTimeout(
    detectShopMyAcceptedSince(previousSync?.capturedAt ?? null),
    4_000,
    'home_sync_shopmy',
    false,
  );
  const currentSync = buildCurrentHomeSyncSnapshot({
    now,
    studioPulse,
    pipelineOpenDeals: pipeline.openDealCount,
    sponsorCandidates: operational.metrics.sponsorCandidates,
    topSponsorCandidates: operational.topSponsorCandidates,
  });
  const sinceLastSync = computeSinceLastSyncDeltas({
    previous: previousSync,
    current: currentSync,
    inventory,
    shopMyAcceptedSince: shopMyAccepted,
  });

  const pulseBrief = await softTimeout(
    import('../benson-pulse/index.js').then((m) => m.getLatestProgressBrief()),
    4_000,
    'home_pulse_brief',
    null,
  );

  const showroom = buildHomeShowroom({
    inventory,
    dailyBriefing: operational.dailyBriefing,
    topOpportunities: operational.topOpportunities,
    topSponsorCandidates: operational.topSponsorCandidates,
    refresh: operational.refresh,
    metrics: operational.metrics,
    studioPulse,
    actions,
    pipelineOpenDeals: pipeline.openDealCount,
    greeting,
    // Real known revenue only — won this month when pipeline reports it.
    revenueUsd:
      pipeline.wonThisMonth?.value != null && pipeline.wonThisMonth.value > 0
        ? pipeline.wonThisMonth.value
        : null,
    sinceLastSync,
    pulseBrief: pulseBrief
      ? {
          headline: pulseBrief.headline,
          progressSummary: pulseBrief.progressSummary,
          whatChanged: pulseBrief.whatChanged,
          dataThrough: pulseBrief.dataThrough,
          createdAt: pulseBrief.createdAt,
          videoGrowth: pulseBrief.videoGrowth,
        }
      : null,
    watchlistBriefLines: homeWatchlistBriefLines(
      await softTimeout(
        import('../curator-watchlist/watchlist-activity.js').then((mod) =>
          mod.listWatchlistActivity(8).then((summary) => summary.briefLines),
        ),
        3_000,
        'watchlist_brief_lines',
        [],
      ),
    ),
  });

  // Advance checkpoint only after the summary was successfully computed so
  // the operator sees deltas once, then refreshes stay quiet until new changes.
  await softTimeout(saveHomeOperatorSyncCheckpoint(currentSync), 4_000, 'home_sync_checkpoint_save', undefined);

  const response: PreAlphaHomeResponse = {
    demoMode: options?.demoMode ?? status.demoMode,
    generatedAt: now.toISOString(),
    greeting,
    subline: 'Benson worked while you created — leverage from your live KC business.',
    priorities,
    quickLinks,
    stats: {
      openActions: actions.counts.total,
      overdueActions: actions.counts.overdue,
      pipelineValue: pipeline.totalPipelineValue,
      openDeals: pipeline.openDealCount,
      outreachMode: outreach.mode,
    },
    systemOk: status.ok && status.safety.preAlphaReady,
    metrics: operational.metrics,
    sourceHealth: operational.sourceHealth,
    refresh: operational.refresh,
    topOpportunities: operational.topOpportunities,
    topSponsorCandidates: operational.topSponsorCandidates,
    dailyBriefing: operational.dailyBriefing,
    studioPulse,
    showroom,
    aiSpend: aiSpendRaw
      ? {
          todayCostUsd: aiSpendRaw.todayCostUsd,
          dailyAverageUsd: aiSpendRaw.dailyAverageUsd,
          budgetUsd: aiSpendRaw.budgetUsd,
          budgetExceeded: aiSpendRaw.budgetExceeded,
          breakdown: aiSpendRaw.breakdown.slice(0, 5),
        }
      : null,
  };

  const metrics = getHomeComputationMetrics();
  logHomeComputationDiagnostic({
    event: 'home_computation_finished',
    inventoryLoadCount: metrics.inventoryLoadCount,
    sponsorIntelComputeCount: metrics.sponsorIntelComputeCount,
    elapsedMs: Date.now() - startedAt,
    rssBeforeKb,
    rssAfterKb: readProcessRssKb(),
  });

  return response;
}

export async function computePreAlphaHome(options?: {
  now?: Date;
  demoMode?: boolean;
  excludeCategories?: string[];
}): Promise<PreAlphaHomeResponse> {
  if (homeComputationInFlight) {
    logHomeComputationDiagnostic({
      event: 'home_computation_joined',
      joinedExisting: true,
      inventoryLoadCount: getHomeComputationMetrics().inventoryLoadCount,
      sponsorIntelComputeCount: getHomeComputationMetrics().sponsorIntelComputeCount,
      rssBeforeKb: readProcessRssKb(),
      rssAfterKb: readProcessRssKb(),
    });
    return homeComputationInFlight;
  }

  logHomeComputationDiagnostic({
    event: 'home_computation_started',
    joinedExisting: false,
    inventoryLoadCount: getHomeComputationMetrics().inventoryLoadCount,
    sponsorIntelComputeCount: getHomeComputationMetrics().sponsorIntelComputeCount,
    rssBeforeKb: readProcessRssKb(),
    rssAfterKb: readProcessRssKb(),
  });

  const run = computePreAlphaHomeInternal(options);
  homeComputationInFlight = run;
  try {
    return await run;
  } finally {
    homeComputationInFlight = null;
  }
}

export { getHomeComputationMetrics, resetHomeComputationMetricsForTests };
