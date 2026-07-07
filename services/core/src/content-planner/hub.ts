import type { InventoryItem } from '../inventory/normalize.js';
import {
  attachTrackingToCards,
  computeWeekPicks,
  itemToCommandCenterCard,
  type CommandCenterCard,
} from '../inventory/command-center.js';
import { PLANNER_BOARDS, type PlannerBoard } from './constants.js';
import {
  loadAllPlannerItems,
  loadByBoard,
  loadByStatus,
  loadShortlistItems,
  plannerCounts,
  plannerToCardTracking,
  type PlannerItemRecord,
} from './items.js';
import { enrichPlannerCards, type PlannerCardWithSponsors } from '../benson-intelligence/planner-sponsors.js';

export type PlannerCard = CommandCenterCard & {
  planner: {
    listName: string;
    notes: string | null;
    priority: number;
    plannedDate: string | null;
    contentAngle: string | null;
    status: PlannerItemRecord['status'];
    followUpAt: string | null;
    draftCaption: string | null;
    postedUrl: string | null;
    postedAt: string | null;
  };
};

export type PlannerHubResponse = {
  demoMode: boolean;
  generatedAt: string;
  counts: {
    saved: number;
    plannedThisWeek: number;
    covered: number;
    skipped: number;
  };
  boards: Array<{
    name: PlannerBoard;
    count: number;
  }>;
  recentItems: PlannerCardWithSponsors[];
  topIngestedPicks: CommandCenterCard[];
};

function itemsById(items: InventoryItem[]): Map<string, InventoryItem> {
  return new Map(items.map((item) => [item.id, item]));
}

export function recordsToPlannerCards(
  records: PlannerItemRecord[],
  lookup: Map<string, InventoryItem>,
): PlannerCard[] {
  const cards: PlannerCard[] = [];
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
      planner: {
        listName: record.listName,
        notes: record.notes,
        priority: record.priority,
        plannedDate: record.plannedDate,
        contentAngle: record.contentAngle,
        status: record.status,
        followUpAt: record.followUpAt,
        draftCaption: record.draftCaption,
        postedUrl: record.postedUrl,
        postedAt: record.postedAt,
      },
    });
  }
  return cards;
}

export async function computePlannerHub(
  items: InventoryItem[],
  options?: { demoMode?: boolean; recentLimit?: number },
): Promise<PlannerHubResponse> {
  const lookup = itemsById(items);
  const plannerMap = await loadAllPlannerItems();
  const counts = plannerCounts(plannerMap);

  const boards = await Promise.all(
    PLANNER_BOARDS.map(async (name) => {
      const boardItems = await loadByBoard(name);
      return { name, count: boardItems.length };
    }),
  );

  const recentRecords = [...plannerMap.values()]
    .filter((r) => r.status !== 'covered' && r.status !== 'skipped')
    .sort((a, b) => a.priority - b.priority || b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, options?.recentLimit ?? 8);

  const recentCards = recordsToPlannerCards(recentRecords, lookup);
  const recentItems = await enrichPlannerCards(recentCards);

  const excludedIds = new Set(
    [...plannerMap.values()]
      .filter((t) => t.status === 'covered' || t.status === 'skipped')
      .map((t) => t.contentItemId),
  );
  const trackingMap = new Map<
    string,
    { saved: boolean; covered: boolean; note: string | null; followUpAt: string | null }
  >();
  for (const record of plannerMap.values()) {
    const t = plannerToCardTracking(record);
    trackingMap.set(record.contentItemId, {
      saved: t.saved,
      covered: t.covered,
      note: t.note,
      followUpAt: t.followUpAt,
    });
  }
  const topIngestedPicks = attachTrackingToCards(
    computeWeekPicks(
      items.filter((i) => !excludedIds.has(i.id)),
      { now: new Date(), limit: options?.recentLimit ?? 12 },
    ),
    trackingMap,
  );

  return {
    demoMode: options?.demoMode ?? false,
    generatedAt: new Date().toISOString(),
    counts: {
      saved: counts.saved,
      plannedThisWeek: counts.plannedThisWeek,
      covered: counts.covered,
      skipped: counts.skipped,
    },
    boards,
    recentItems,
    topIngestedPicks,
  };
}

export async function computeShortlistView(
  items: InventoryItem[],
  options?: { board?: PlannerBoard; status?: PlannerItemRecord['status'] },
): Promise<PlannerCard[]> {
  const lookup = itemsById(items);
  let records: PlannerItemRecord[];

  if (options?.board) {
    records = await loadByBoard(options.board);
  } else if (options?.status) {
    records = await loadByStatus(options.status);
  } else {
    records = await loadShortlistItems();
  }

  return recordsToPlannerCards(records, lookup);
}
