import type { InventoryItem } from '../inventory/normalize.js';
import {
  attachTrackingToCards,
  computeCommandCenter,
  computeWeekPicks,
  itemToCommandCenterCard,
  type CommandCenterCard,
  type CommandCenterResponse,
} from '../inventory/command-center.js';
import {
  loadAllPlannerItems,
  loadByStatus,
  loadDueFollowUps,
  loadShortlistItems,
  plannerCounts,
  plannerToCardTracking,
} from '../content-planner/items.js';
import type { PlannerItemRecord } from '../content-planner/items.js';

export type EditorHomeResponse = CommandCenterResponse & {
  demoMode: boolean;
  counts: {
    saved: number;
    plannedThisWeek: number;
    covered: number;
    skipped: number;
    followUpsDue: number;
    discoveredToday: number;
  };
  weekItems: CommandCenterCard[];
  savedItems: CommandCenterCard[];
  coveredItems: CommandCenterCard[];
};

function itemsById(items: InventoryItem[]): Map<string, InventoryItem> {
  return new Map(items.map((item) => [item.id, item]));
}

function cardsFromPlannerRecords(
  records: PlannerItemRecord[],
  lookup: Map<string, InventoryItem>,
): CommandCenterCard[] {
  const cards: CommandCenterCard[] = [];
  for (const record of records) {
    const item = lookup.get(record.contentItemId);
    if (!item) continue;
    const tracking = plannerToCardTracking(record);
    cards.push({
      ...itemToCommandCenterCard(item),
      tracking: {
        saved: tracking.saved,
        covered: tracking.covered,
        note: tracking.note,
        followUpAt: tracking.followUpAt,
      },
    });
  }
  return cards;
}

function trackingMapFromPlanner(
  plannerMap: Map<string, PlannerItemRecord>,
): Map<string, { saved: boolean; covered: boolean; note: string | null; followUpAt: string | null }> {
  const map = new Map<
    string,
    { saved: boolean; covered: boolean; note: string | null; followUpAt: string | null }
  >();
  for (const record of plannerMap.values()) {
    const t = plannerToCardTracking(record);
    map.set(record.contentItemId, {
      saved: t.saved,
      covered: t.covered,
      note: t.note,
      followUpAt: t.followUpAt,
    });
  }
  return map;
}

export async function computeEditorHome(
  items: InventoryItem[],
  options?: { now?: Date; limit?: number; demoMode?: boolean },
): Promise<EditorHomeResponse> {
  const now = options?.now ?? new Date();
  const limit = options?.limit ?? 6;
  const lookup = itemsById(items);
  const plannerMap = await loadAllPlannerItems();
  const trackingMap = trackingMapFromPlanner(plannerMap);

  const excludedIds = new Set(
    [...plannerMap.values()]
      .filter((t) => t.status === 'covered' || t.status === 'skipped')
      .map((t) => t.contentItemId),
  );

  const briefing = computeCommandCenter(items, { now, limit, excludeIds: excludedIds });

  const dueFollowUps = await loadDueFollowUps(now);
  const followUpCards = cardsFromPlannerRecords(dueFollowUps, lookup);
  briefing.sections.followUpsDue.items = followUpCards.slice(0, limit);

  const attach = (cards: CommandCenterCard[]) =>
    attachTrackingToCards(cards, trackingMap);

  for (const key of Object.keys(briefing.sections) as Array<keyof typeof briefing.sections>) {
    if (key === 'followUpsDue') continue;
    briefing.sections[key].items = attach(briefing.sections[key].items);
  }
  briefing.sections.followUpsDue.items = attach(briefing.sections.followUpsDue.items);

  const savedRecords = await loadShortlistItems();
  const coveredRecords = await loadByStatus('covered');
  const weekItems = attach(
    computeWeekPicks(items.filter((i) => !excludedIds.has(i.id)), { now, limit: 20 }),
  );

  const counts = plannerCounts(plannerMap, { now });

  return {
    ...briefing,
    demoMode: options?.demoMode ?? false,
    counts: {
      saved: counts.saved,
      plannedThisWeek: counts.plannedThisWeek,
      covered: counts.covered,
      skipped: counts.skipped,
      followUpsDue: counts.followUpsDue,
      discoveredToday: briefing.sections.discoveredToday.items.length,
    },
    weekItems,
    savedItems: cardsFromPlannerRecords(savedRecords, lookup),
    coveredItems: cardsFromPlannerRecords(coveredRecords, lookup),
  };
}
