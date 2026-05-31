import {
  loadAllPlannerItems,
  loadDueFollowUps as loadPlannerDueFollowUps,
  loadShortlistItems,
  loadByStatus,
  upsertPlannerItem,
  plannerToCardTracking,
  type PlannerItemRecord,
  type PlannerItemUpdate,
} from '../content-planner/items.js';

export type TrackingRecord = {
  contentItemId: string;
  saved: boolean;
  covered: boolean;
  note: string | null;
  followUpAt: string | null;
  savedAt: string | null;
  coveredAt: string | null;
};

export type TrackingUpdate = {
  saved?: boolean;
  covered?: boolean;
  note?: string | null;
  followUpAt?: string | null;
};

function toTrackingRecord(record: PlannerItemRecord): TrackingRecord {
  const card = plannerToCardTracking(record);
  return {
    contentItemId: record.contentItemId,
    saved: card.saved,
    covered: card.covered,
    note: card.note,
    followUpAt: card.followUpAt,
    savedAt: card.saved ? record.updatedAt : null,
    coveredAt: card.covered ? record.updatedAt : null,
  };
}

export async function loadAllTracking(): Promise<Map<string, TrackingRecord>> {
  const plannerMap = await loadAllPlannerItems();
  const map = new Map<string, TrackingRecord>();
  for (const record of plannerMap.values()) {
    map.set(record.contentItemId, toTrackingRecord(record));
  }
  return map;
}

export async function loadTrackingForIds(ids: string[]): Promise<Map<string, TrackingRecord>> {
  const all = await loadAllTracking();
  const map = new Map<string, TrackingRecord>();
  for (const id of ids) {
    const record = all.get(id);
    if (record) map.set(id, record);
  }
  return map;
}

export async function loadDueFollowUps(now = new Date()): Promise<TrackingRecord[]> {
  const rows = await loadPlannerDueFollowUps(now);
  return rows.map(toTrackingRecord);
}

export async function loadSavedItems(): Promise<TrackingRecord[]> {
  const rows = await loadShortlistItems();
  return rows.map(toTrackingRecord);
}

export async function loadCoveredItems(): Promise<TrackingRecord[]> {
  const rows = await loadByStatus('covered');
  return rows.map(toTrackingRecord);
}

export async function upsertTracking(
  contentItemId: string,
  update: TrackingUpdate,
): Promise<TrackingRecord> {
  const plannerUpdate: PlannerItemUpdate = {};

  if (update.saved === true) {
    plannerUpdate.action = 'save';
  }
  if (update.covered === true) {
    plannerUpdate.action = 'mark_covered';
  }
  if (update.note !== undefined) plannerUpdate.notes = update.note;
  if (update.followUpAt !== undefined) plannerUpdate.followUpAt = update.followUpAt;

  const record = await upsertPlannerItem(contentItemId, plannerUpdate);
  return toTrackingRecord(record);
}

export function trackingCounts(map: Map<string, TrackingRecord>): {
  saved: number;
  covered: number;
  followUpsDue: number;
} {
  const now = Date.now();
  let saved = 0;
  let covered = 0;
  let followUpsDue = 0;
  for (const t of map.values()) {
    if (t.saved) saved++;
    if (t.covered) covered++;
    if (
      !t.covered &&
      t.followUpAt &&
      new Date(t.followUpAt).getTime() <= now
    ) {
      followUpsDue++;
    }
  }
  return { saved, covered, followUpsDue };
}
