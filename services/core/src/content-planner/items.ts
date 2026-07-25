import { and, asc, desc, eq, inArray, lte, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { contentItems, plannerItems } from '../schema.js';
import { recordPassedOpportunity } from '../creator-preferences/passed-opportunities.js';
import type { PlannerBoard, PlannerItemStatus, PlannerQuickAction, PlannerBatchAction } from './constants.js';
import { isDateInWeek, nextSaturday, startOfWeekMonday, toDateOnlyString } from './dates.js';

export type PlannerItemRecord = {
  contentItemId: string;
  listName: string;
  notes: string | null;
  priority: number;
  plannedDate: string | null;
  dueDate: string | null;
  contentAngle: string | null;
  status: PlannerItemStatus;
  followUpAt: string | null;
  draftCaption: string | null;
  postedUrl: string | null;
  postedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PlannerItemUpdate = {
  listName?: string;
  notes?: string | null;
  priority?: number;
  plannedDate?: string | null;
  dueDate?: string | null;
  contentAngle?: string | null;
  status?: PlannerItemStatus;
  followUpAt?: string | null;
  draftCaption?: string | null;
  postedUrl?: string | null;
  postedAt?: string | null;
  action?: PlannerQuickAction;
  pinToTop?: boolean;
};

async function bumpTodayBoardPriorities(exceptContentItemId?: string): Promise<void> {
  const rows = await db
    .select()
    .from(plannerItems)
    .where(eq(plannerItems.listName, 'Today'));

  for (const row of rows) {
    if (row.contentItemId === exceptContentItemId) continue;
    await db
      .update(plannerItems)
      .set({ priority: row.priority + 1, updatedAt: new Date() })
      .where(eq(plannerItems.id, row.id));
  }
}

function rowToRecord(row: typeof plannerItems.$inferSelect): PlannerItemRecord {
  return {
    contentItemId: row.contentItemId,
    listName: row.listName,
    notes: row.notes,
    priority: row.priority,
    plannedDate: row.plannedDate ?? null,
    dueDate: row.dueDate ?? null,
    contentAngle: row.contentAngle,
    status: row.status,
    followUpAt: row.followUpAt?.toISOString() ?? null,
    draftCaption: row.draftCaption ?? null,
    postedUrl: row.postedUrl ?? null,
    postedAt: row.postedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function applyAction(
  action: PlannerQuickAction,
  now: Date,
): Partial<typeof plannerItems.$inferInsert> {
  const today = toDateOnlyString(now);
  switch (action) {
    case 'save':
      return { status: 'saved', listName: 'Saved For Later' };
    case 'plan_today':
      return { status: 'planned', listName: 'Today', plannedDate: today };
    case 'plan_this_week':
      return {
        status: 'planned',
        listName: 'This Week',
        plannedDate: toDateOnlyString(startOfWeekMonday(now)),
      };
    case 'plan_weekend':
      return {
        status: 'planned',
        listName: 'Weekend',
        plannedDate: toDateOnlyString(nextSaturday(now)),
      };
    case 'mark_covered':
      return { status: 'covered' };
    case 'skip':
      return { status: 'skipped' };
  }
}

export async function loadAllPlannerItems(): Promise<Map<string, PlannerItemRecord>> {
  const rows = await db.select().from(plannerItems);
  const map = new Map<string, PlannerItemRecord>();
  for (const row of rows) {
    map.set(row.contentItemId, rowToRecord(row));
  }
  return map;
}

/** Content item IDs Kellie already covered or skipped — exclude from suggestion surfaces. */
export async function loadExcludedPlannerContentIds(): Promise<Set<string>> {
  const rows = await db
    .select({ contentItemId: plannerItems.contentItemId })
    .from(plannerItems)
    .where(sql`${plannerItems.status} IN ('covered', 'skipped')`);
  return new Set(rows.map((row) => row.contentItemId));
}

export async function loadPlannerForIds(ids: string[]): Promise<Map<string, PlannerItemRecord>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select()
    .from(plannerItems)
    .where(inArray(plannerItems.contentItemId, ids));
  const map = new Map<string, PlannerItemRecord>();
  for (const row of rows) {
    map.set(row.contentItemId, rowToRecord(row));
  }
  return map;
}

export async function loadByBoard(board: PlannerBoard): Promise<PlannerItemRecord[]> {
  const rows = await db
    .select()
    .from(plannerItems)
    .where(eq(plannerItems.listName, board))
    .orderBy(asc(plannerItems.priority), desc(plannerItems.updatedAt));
  return rows.map(rowToRecord);
}

export async function loadByStatus(status: PlannerItemStatus): Promise<PlannerItemRecord[]> {
  const rows = await db
    .select()
    .from(plannerItems)
    .where(eq(plannerItems.status, status))
    .orderBy(desc(plannerItems.updatedAt));
  return rows.map(rowToRecord);
}

export async function loadShortlistItems(): Promise<PlannerItemRecord[]> {
  const rows = await db
    .select()
    .from(plannerItems)
    .where(
      inArray(plannerItems.status, ['saved', 'considering', 'planned']),
    )
    .orderBy(desc(plannerItems.updatedAt));
  return rows.map(rowToRecord);
}

export async function loadDueFollowUps(now = new Date()): Promise<PlannerItemRecord[]> {
  const rows = await db
    .select()
    .from(plannerItems)
    .where(
      and(
        sql`${plannerItems.status} NOT IN ('covered', 'skipped')`,
        lte(plannerItems.followUpAt, now),
        sql`${plannerItems.followUpAt} IS NOT NULL`,
      ),
    )
    .orderBy(desc(plannerItems.followUpAt));
  return rows.map(rowToRecord);
}

export async function upsertPlannerItem(
  contentItemId: string,
  update: PlannerItemUpdate,
): Promise<PlannerItemRecord> {
  const now = new Date();
  if (update.pinToTop) {
    await bumpTodayBoardPriorities(contentItemId);
  }

  const existing = await db
    .select()
    .from(plannerItems)
    .where(eq(plannerItems.contentItemId, contentItemId))
    .limit(1);

  const patch: Partial<typeof plannerItems.$inferInsert> = { updatedAt: now };

  if (update.action) {
    Object.assign(patch, applyAction(update.action, now));
  }
  if (update.pinToTop) {
    patch.priority = 0;
    if (!update.action) {
      patch.listName = 'Today';
      patch.status = 'planned';
      patch.plannedDate = toDateOnlyString(now);
    }
  }
  if (update.listName !== undefined) patch.listName = update.listName;
  if (update.notes !== undefined) patch.notes = update.notes;
  if (update.priority !== undefined) patch.priority = update.priority;
  if (update.plannedDate !== undefined) patch.plannedDate = update.plannedDate;
  if (update.dueDate !== undefined) patch.dueDate = update.dueDate;
  if (update.contentAngle !== undefined) patch.contentAngle = update.contentAngle;
  if (update.status !== undefined) patch.status = update.status;
  if (update.followUpAt !== undefined) {
    patch.followUpAt = update.followUpAt ? new Date(update.followUpAt) : null;
  }
  if (update.draftCaption !== undefined) patch.draftCaption = update.draftCaption;
  if (update.postedUrl !== undefined) patch.postedUrl = update.postedUrl;
  if (update.postedAt !== undefined) {
    patch.postedAt = update.postedAt ? new Date(update.postedAt) : null;
  }

  if (existing[0]) {
    const [row] = await db
      .update(plannerItems)
      .set(patch)
      .where(eq(plannerItems.id, existing[0].id))
      .returning();
    if (update.action === 'skip' || patch.status === 'skipped') {
      const [item] = await db
        .select({ topic: contentItems.topic })
        .from(contentItems)
        .where(eq(contentItems.id, contentItemId))
        .limit(1);
      if (item?.topic) {
        await recordPassedOpportunity(item.topic, 'dashboard', 'Skipped in planner').catch(() => {});
      }
    }
    return rowToRecord(row!);
  }

  const defaults = update.action ? applyAction(update.action, now) : {};
  const [row] = await db
    .insert(plannerItems)
    .values({
      contentItemId,
      listName: update.listName ?? defaults.listName ?? 'Saved For Later',
      notes: update.notes ?? null,
      priority: update.priority ?? 2,
      plannedDate: update.plannedDate ?? defaults.plannedDate ?? null,
      dueDate: update.dueDate ?? null,
      contentAngle: update.contentAngle ?? null,
      status: update.status ?? defaults.status ?? 'saved',
      followUpAt: update.followUpAt ? new Date(update.followUpAt) : null,
      draftCaption: update.draftCaption ?? null,
      postedUrl: update.postedUrl ?? null,
      postedAt: update.postedAt ? new Date(update.postedAt) : null,
    })
    .returning();
  return rowToRecord(row!);
}

export async function batchUpsertPlannerItems(
  contentItemIds: string[],
  action: PlannerBatchAction,
): Promise<{ updated: number; results: PlannerItemRecord[] }> {
  const uniqueIds = [...new Set(contentItemIds)].filter(Boolean);
  const results: PlannerItemRecord[] = [];

  for (const id of uniqueIds) {
    if (action === 'dismiss') {
      const { dismissOpportunity } = await import('../sponsor-intelligence/actions.js');
      try {
        await dismissOpportunity(id);
      } catch {
        /* optional sponsor row */
      }
      results.push(await upsertPlannerItem(id, { action: 'skip' }));
      continue;
    }
    results.push(await upsertPlannerItem(id, { action }));
  }

  return { updated: results.length, results };
}

export function plannerCounts(
  map: Map<string, PlannerItemRecord>,
  options?: { now?: Date },
): {
  saved: number;
  plannedThisWeek: number;
  covered: number;
  skipped: number;
  followUpsDue: number;
} {
  const now = options?.now ?? new Date();
  const weekStart = startOfWeekMonday(now);
  const nowMs = now.getTime();

  let saved = 0;
  let plannedThisWeek = 0;
  let covered = 0;
  let skipped = 0;
  let followUpsDue = 0;

  for (const item of map.values()) {
    if (item.status === 'saved' || item.status === 'considering') saved++;
    if (item.status === 'planned' && item.plannedDate && isDateInWeek(item.plannedDate, weekStart)) {
      plannedThisWeek++;
    }
    if (item.status === 'covered') covered++;
    if (item.status === 'skipped') skipped++;
    if (
      item.status !== 'covered' &&
      item.status !== 'skipped' &&
      item.followUpAt &&
      new Date(item.followUpAt).getTime() <= nowMs
    ) {
      followUpsDue++;
    }
  }

  return { saved, plannedThisWeek, covered, skipped, followUpsDue };
}

export function plannerToCardTracking(record: PlannerItemRecord): {
  saved: boolean;
  covered: boolean;
  skipped: boolean;
  status: PlannerItemStatus;
  listName: string;
  plannedDate: string | null;
  contentAngle: string | null;
  priority: number;
  note: string | null;
  followUpAt: string | null;
} {
  return {
    saved: ['saved', 'considering', 'planned'].includes(record.status),
    covered: record.status === 'covered',
    skipped: record.status === 'skipped',
    status: record.status,
    listName: record.listName,
    plannedDate: record.plannedDate,
    contentAngle: record.contentAngle,
    priority: record.priority,
    note: record.notes,
    followUpAt: record.followUpAt,
  };
}
