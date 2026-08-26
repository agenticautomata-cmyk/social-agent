/**
 * Narrow READ-ONLY inventory load for voice postToday.
 * Conservative SQL prefilter (when uncertain, keep) + shared ingested finalize
 * + exact Command Center timely prefilter. Ranking still runs through
 * computeCommandCenter(...).sections.postToday.
 *
 * SQL day windows are the UNION of:
 * 1) process-local Date getters — same calendar model as Command Center isToday/isWithinDays
 * 2) creator timezone (America/Chicago by default) via startOfLocalDayKey
 * so the prefilter never depends solely on machine TZ, and never drops a
 * Command Center–timely row when process TZ ≠ creator TZ.
 */
import { and, eq, gte, isNotNull, lt, not, notInArray, or, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { contentItems, sources } from '../schema.js';
import { contentItemsChronologicalOrder } from '../content-order.js';
import { ingestedWithinRetentionWindow } from '../inventory/retention.js';
import { inventoryLoadContentItemSelect } from '../inventory/inventory-load-projection.js';
import { finalizeIngestedInventoryRows } from '../inventory/load-ingested.js';
import { filterPossiblePostTodayCandidates } from '../inventory/command-center.js';
import type { InventoryItem } from '../inventory/normalize.js';
import { getCreatorTimezone, getLocalCalendarDay } from '../datetime.js';
import { startOfLocalDayKey } from '../creator-agent/temporal-state.js';

export type PostTodayVoiceDayWindow = {
  dayStart: Date;
  dayEndExclusive: Date;
  eventEndExclusive: Date;
  label: 'process_local' | 'creator_timezone';
  timezone?: string;
};

function addCalendarDaysYmd(dayKey: string, days: number): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  const utc = new Date(Date.UTC(y!, m! - 1, d! + days));
  return utc.toISOString().slice(0, 10);
}

/** Process-local midnight bounds — mirrors Command Center Date#getFullYear/Month/Date. */
export function processLocalPostTodayDayWindow(now: Date = new Date()): PostTodayVoiceDayWindow {
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayEndExclusive = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const eventEndExclusive = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);
  return {
    dayStart,
    dayEndExclusive,
    eventEndExclusive,
    label: 'process_local',
  };
}

/** Creator-timezone day bounds as explicit UTC instants (not Postgres CURRENT_DATE). */
export function creatorTimezonePostTodayDayWindow(
  now: Date = new Date(),
  timezone: string = getCreatorTimezone(),
): PostTodayVoiceDayWindow {
  const todayKey = getLocalCalendarDay(now, timezone);
  const tomorrowKey = addCalendarDaysYmd(todayKey, 1);
  const dayAfterKey = addCalendarDaysYmd(todayKey, 2);
  return {
    dayStart: startOfLocalDayKey(todayKey, timezone),
    dayEndExclusive: startOfLocalDayKey(tomorrowKey, timezone),
    eventEndExclusive: startOfLocalDayKey(dayAfterKey, timezone),
    label: 'creator_timezone',
    timezone,
  };
}

/**
 * Windows used by the SQL OR prefilter.
 * Always includes process-local (Command Center parity) and creator-timezone
 * (America/Chicago authority). When they coincide, the second OR is redundant.
 */
export function postTodayVoiceSqlDayWindows(
  now: Date = new Date(),
  timezone: string = getCreatorTimezone(),
): PostTodayVoiceDayWindow[] {
  return [processLocalPostTodayDayWindow(now), creatorTimezonePostTodayDayWindow(now, timezone)];
}

/** @deprecated Prefer postTodayVoiceSqlDayWindows — kept as process-local alias for callers. */
export function postTodayVoiceSqlDayBounds(now: Date = new Date()): {
  dayStart: Date;
  dayEndExclusive: Date;
  eventEndExclusive: Date;
} {
  const w = processLocalPostTodayDayWindow(now);
  return {
    dayStart: w.dayStart,
    dayEndExclusive: w.dayEndExclusive,
    eventEndExclusive: w.eventEndExclusive,
  };
}

function windowTimelyOr(window: PostTodayVoiceDayWindow) {
  return or(
    and(gte(contentItems.discoveredAt, window.dayStart), lt(contentItems.discoveredAt, window.dayEndExclusive)),
    and(gte(contentItems.createdAt, window.dayStart), lt(contentItems.createdAt, window.dayEndExclusive)),
    and(
      isNotNull(contentItems.eventStartsAt),
      gte(contentItems.eventStartsAt, window.dayStart),
      lt(contentItems.eventStartsAt, window.eventEndExclusive),
    ),
  );
}

/** Conservative SQL OR — union of process-local + creator-timezone windows. */
export function postTodayVoiceSqlTimelyOr(
  now: Date = new Date(),
  timezone: string = getCreatorTimezone(),
) {
  const windows = postTodayVoiceSqlDayWindows(now, timezone);
  return or(...windows.map((window) => windowTimelyOr(window)));
}

export function timestampInAnyVoiceDayWindow(
  iso: string | null | undefined,
  now: Date,
  kind: 'discovery' | 'event',
  timezone: string = getCreatorTimezone(),
): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  for (const w of postTodayVoiceSqlDayWindows(now, timezone)) {
    const end = kind === 'event' ? w.eventEndExclusive : w.dayEndExclusive;
    if (t >= w.dayStart.getTime() && t < end.getTime()) return true;
  }
  return false;
}

/**
 * Proof helper: every Command Center–timely candidate (same rules as
 * filterPossiblePostTodayCandidates) must match the SQL window for at least
 * one of its discovery/created/event timestamps.
 */
export function commandCenterTimelySurvivesSqlWindow(
  item: Pick<InventoryItem, 'eventDate' | 'discoveredAt' | 'createdAt' | 'audienceScore'>,
  now: Date = new Date(),
  timezone: string = getCreatorTimezone(),
): boolean {
  const discoveryOk =
    timestampInAnyVoiceDayWindow(item.discoveredAt, now, 'discovery', timezone) ||
    timestampInAnyVoiceDayWindow(item.createdAt, now, 'discovery', timezone);
  const eventOk = timestampInAnyVoiceDayWindow(item.eventDate, now, 'event', timezone);
  return discoveryOk || eventOk;
}

export async function loadPostTodayVoiceInventoryCandidates(
  now: Date = new Date(),
): Promise<InventoryItem[]> {
  const rows = await db
    .select({
      ...inventoryLoadContentItemSelect,
      sourceName: sources.name,
      sourceType: sources.type,
    })
    .from(contentItems)
    .leftJoin(sources, eq(sources.id, contentItems.sourceId))
    .where(
      and(
        isNotNull(contentItems.sourceId),
        or(isNotNull(contentItems.sourceExternalId), isNotNull(contentItems.sourceUrl)),
        not(sql`${contentItems.sourceExternalId} LIKE 'mock_%'`),
        not(sql`COALESCE(${contentItems.sourceUrl}, '') LIKE '%/comments/mock%'`),
        ingestedWithinRetentionWindow(),
        postTodayVoiceSqlTimelyOr(now),
        notInArray(contentItems.lifecycleStatus, ['expired', 'archived']),
      ),
    )
    .orderBy(...contentItemsChronologicalOrder);

  const finalized = await finalizeIngestedInventoryRows(rows);
  return filterPossiblePostTodayCandidates(finalized, now);
}
