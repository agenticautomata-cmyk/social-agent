import { loadIngestedInventoryItems } from '../inventory/load-ingested.js';
import {
  computeCommandCenter,
  itemToCommandCenterCard,
  type CommandCenterCard,
} from '../inventory/command-center.js';
import { filterInventoryItems } from '../inventory/normalize.js';
import { loadExcludedPlannerContentIds } from '../content-planner/items.js';
import { loadSkippedContentIdsForItems } from '../creator-skip/index.js';
import { listSourceRegistry } from '../source-ingestion/registry.js';
import {
  countNewItemsSince,
  getLastLiveRefreshSummary,
} from '../source-ingestion/last-refresh.js';
import { computeTopSponsorCandidates } from '../sponsor-intelligence/top-candidates.js';
import { isNewOpeningEligible } from '../sponsor-intelligence/scoring.js';
import type { SponsorRecommendation } from '../sponsor-intelligence/recommendations.js';
import { OPEN_PIPELINE_STATUSES } from '../sponsor-pipeline/constants.js';
import { listSponsorOpportunities } from '../sponsor-pipeline/opportunities.js';
import { listSponsorContacts } from '../sponsor-outreach/contacts.js';
import { listOutreachEmails } from '../sponsor-outreach/outreach.js';
import { countConnectedAnalyticsConnectors } from '../analytics-connectors/index.js';
import type { InventoryItem } from '../inventory/normalize.js';
import { upcomingInventorySortTuple } from '../content-order.js';

export type HomeOpportunityCard = CommandCenterCard;

export type HomeSourceHealth = {
  totalSources: number;
  healthySources: number;
  unhealthySources: number;
  disabledSources: number;
};

export type HomeRefreshSummary = {
  lastRefreshAt: string | null;
  itemsDiscovered: number;
  healthySources: number;
  failedSources: number;
  newItemsSinceRefresh: number;
};

export type HomeDailyBriefing = {
  topEvents: HomeOpportunityCard[];
  topSponsorOpportunities: SponsorRecommendation[];
  topBusinessOpenings: HomeOpportunityCard[];
  highestPriority: HomeOpportunityCard[];
  askBensonToday: HomeOpportunityCard[];
};

export type HomeOperationalMetrics = {
  totalSources: number;
  healthySources: number;
  contentItems: number;
  sponsorCandidates: number;
  activePipelineDeals: number;
  sponsorLeads: number;
  activeDeals: number;
  pendingOutreach: number;
  connectedAccounts: number;
};

export type OperationalHomeData = {
  metrics: HomeOperationalMetrics;
  sourceHealth: HomeSourceHealth;
  refresh: HomeRefreshSummary;
  topOpportunities: HomeOpportunityCard[];
  topSponsorCandidates: SponsorRecommendation[];
  dailyBriefing: HomeDailyBriefing;
};

function parseDate(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isWithinDays(iso: string | null, now: Date, days: number): boolean {
  const d = parseDate(iso);
  if (!d) return false;
  const ms = d.getTime() - now.getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  return ms >= -dayMs && ms <= days * dayMs;
}

function rankTopEvents(items: InventoryItem[], now: Date, limit: number): HomeOpportunityCard[] {
  const scored = items
    .filter((item) => item.eventDate && isWithinDays(item.eventDate, now, 21))
    .map((item) => {
      let score = item.audienceScore * 2;
      if (isWithinDays(item.eventDate, now, 7)) score += 10;
      if (item.flags.sports || item.flags.freeEvent) score += 5;
      return { item, score };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const [aTier, aTime] = upcomingInventorySortTuple(a.item.eventDate, now);
      const [bTier, bTime] = upcomingInventorySortTuple(b.item.eventDate, now);
      if (aTier !== bTier) return aTier - bTier;
      return aTime - bTime;
    })
    .slice(0, limit);
  return scored.map(({ item }) => itemToCommandCenterCard(item));
}

function rankOpenings(items: InventoryItem[], limit: number): HomeOpportunityCard[] {
  return items
    .filter((item) => isNewOpeningEligible(item))
    .sort((a, b) => (b.discoveredAt ?? '').localeCompare(a.discoveredAt ?? ''))
    .slice(0, limit)
    .map((item) => itemToCommandCenterCard(item));
}

function mergePriorityCards(briefing: ReturnType<typeof computeCommandCenter>, limit: number): HomeOpportunityCard[] {
  const seen = new Set<string>();
  const merged: HomeOpportunityCard[] = [];
  for (const section of [
    briefing.sections.discoveredToday.items,
    briefing.sections.postToday.items,
    briefing.sections.highestConfidence.items,
    briefing.sections.trending.items,
  ]) {
    for (const card of section) {
      if (seen.has(card.id)) continue;
      seen.add(card.id);
      merged.push(card);
      if (merged.length >= limit) return merged;
    }
  }
  return merged;
}

function rankAskBensonToday(items: InventoryItem[], now: Date, limit: number): HomeOpportunityCard[] {
  const cutoff = now.getTime() - 48 * 60 * 60 * 1000;
  return items
    .filter((item) => item.ingest?.startsWith('ask_benson'))
    .filter((item) => {
      const created = new Date(item.createdAt).getTime();
      return !Number.isNaN(created) && created >= cutoff;
    })
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
    .slice(0, limit)
    .map((item) => itemToCommandCenterCard(item));
}

export async function computeOperationalHomeData(options?: {
  excludeCategories?: string[];
}): Promise<OperationalHomeData> {
  let items = await loadIngestedInventoryItems();
  if (options?.excludeCategories?.length) {
    items = filterInventoryItems(items, { excludeCategories: options.excludeCategories });
  }
  const now = new Date();
  const excludedPlannerIds = await loadExcludedPlannerContentIds().catch(() => new Set<string>());
  const skippedIds = await loadSkippedContentIdsForItems(items).catch(() => new Set<string>());
  const excludedIds = new Set([...excludedPlannerIds, ...skippedIds]);
  const briefing = computeCommandCenter(items, { now, limit: 5, excludeIds: excludedIds });
  const [registry, refreshBatch, topSponsors, pipelineOpen, sponsorContacts, outreachQueue, connectedAccounts] =
    await Promise.all([
      listSourceRegistry(),
      getLastLiveRefreshSummary(),
      computeTopSponsorCandidates(items, { limit: 5 }),
      listSponsorOpportunities({ openOnly: true }),
      listSponsorContacts(),
      listOutreachEmails('queue'),
      countConnectedAnalyticsConnectors(),
    ]);

  const healthyRegistry = registry.filter((s) => s.freshnessStatus === 'fresh').length;
  const unhealthyRegistry = registry.filter(
    (s) => s.freshnessStatus === 'error' || s.freshnessStatus === 'stale',
  ).length;
  const disabledRegistry = registry.filter((s) => s.freshnessStatus === 'disabled').length;

  const newSince = await countNewItemsSince(refreshBatch.lastRefreshAt);

  const topOpportunities = mergePriorityCards(briefing, 6);
  const askBensonToday = rankAskBensonToday(items, now, 6);
  const activeDeals = pipelineOpen.filter((o) => OPEN_PIPELINE_STATUSES.includes(o.status)).length;

  return {
    metrics: {
      totalSources: registry.length,
      healthySources: healthyRegistry,
      contentItems: items.length,
      sponsorCandidates: topSponsors.totalEligible,
      activePipelineDeals: activeDeals,
      sponsorLeads: sponsorContacts.length,
      activeDeals,
      pendingOutreach: outreachQueue.length,
      connectedAccounts,
    },
    sourceHealth: {
      totalSources: registry.length,
      healthySources: healthyRegistry,
      unhealthySources: unhealthyRegistry,
      disabledSources: disabledRegistry,
    },
    refresh: {
      lastRefreshAt: refreshBatch.lastRefreshAt,
      itemsDiscovered: refreshBatch.itemsDiscovered,
      healthySources: refreshBatch.healthySources,
      failedSources: refreshBatch.failedSources,
      newItemsSinceRefresh: newSince,
    },
    topOpportunities,
    topSponsorCandidates: topSponsors.items,
    dailyBriefing: {
      topEvents: rankTopEvents(items, now, 5),
      topSponsorOpportunities: topSponsors.items,
      topBusinessOpenings: rankOpenings(items, 5),
      highestPriority: mergePriorityCards(briefing, 5),
      askBensonToday,
    },
  };
}
