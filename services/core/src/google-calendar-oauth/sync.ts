import { and, eq, inArray, isNotNull, or, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { creatorCalendarItems, calendarSyncRecords } from '../schema.js';
import { payloadHashFromItem } from '../creator-calendar/payload-hash.js';
import { CALENDAR_ITEM_TYPE_LABELS } from '../creator-calendar/types.js';
import { emitDataChange } from '../data-revision/index.js';
import type { GoogleExportConfirmInput } from '../creator-calendar/types.js';
import { GOOGLE_CALENDAR_API_BASE } from './constants.js';
import { getLocalCalendarDay } from '../datetime.js';
import {
  getGoogleCalendarAccessToken,
  getGoogleCalendarConnectionRow,
  recordGoogleCalendarSyncFailure,
  recordGoogleCalendarSyncSuccess,
} from './connections.js';
import { ensureDedicatedBensonCalendar } from './provisioning.js';
import { hasGoogleCalendarFreebusyScope } from './scopes.js';

type GoogleEventResponse = {
  id?: string;
  etag?: string;
  updated?: string;
  error?: { message?: string };
};

async function calendarFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getGoogleCalendarAccessToken();
  if (!token) throw new Error('Google Calendar authorization required');

  const res = await fetch(`${GOOGLE_CALENDAR_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  return res;
}

function formatGoogleDateTime(iso: string, timezone: string, allDay: boolean): { date?: string; dateTime?: string; timeZone?: string } {
  if (allDay) {
    // Use the item's own timezone calendar day, not a raw UTC slice — a date-only
    // event stored as UTC midnight otherwise exports one day early for timezones behind UTC.
    return { date: getLocalCalendarDay(new Date(iso), timezone) };
  }
  return { dateTime: iso, timeZone: timezone };
}

function buildEventDescription(item: typeof creatorCalendarItems.$inferSelect): string {
  const lines: string[] = [];
  lines.push(`Benson ${CALENDAR_ITEM_TYPE_LABELS[item.itemType] ?? item.itemType}`);
  if (item.description?.trim()) lines.push('', item.description.trim());
  if (item.notes?.trim()) lines.push('', `Notes: ${item.notes.trim()}`);
  if (item.internalDetailUrl) lines.push('', `Benson record: ${item.internalDetailUrl}`);
  if (item.sourceUrl) lines.push(`Source: ${item.sourceUrl}`);
  const verified = Array.isArray(item.verifiedFields) ? (item.verifiedFields as string[]) : [];
  const unverified = Array.isArray(item.unverifiedFields) ? (item.unverifiedFields as string[]) : [];
  if (verified.length) lines.push('', `Verified: ${verified.join(', ')}`);
  if (unverified.length) lines.push(`Unverified: ${unverified.join(', ')}`);
  lines.push('', '— Exported from Benson (opt-in). Internal calendar remains the planning source of truth.');
  return lines.join('\n');
}

function buildGoogleEventBody(
  item: typeof creatorCalendarItems.$inferSelect,
  options?: GoogleExportConfirmInput,
): Record<string, unknown> {
  const reminderMinutes = options?.googleReminderMinutes ?? 30;
  return {
    summary: item.title,
    location: item.location ?? undefined,
    description: buildEventDescription(item),
    start: formatGoogleDateTime(item.startAt.toISOString(), item.timezone, item.allDay),
    end: item.endAt
      ? formatGoogleDateTime(item.endAt.toISOString(), item.timezone, item.allDay)
      : formatGoogleDateTime(
          new Date(item.startAt.getTime() + 60 * 60 * 1000).toISOString(),
          item.timezone,
          item.allDay,
        ),
    extendedProperties: {
      private: {
        bensonCalendarItemId: item.id,
      },
    },
    reminders: {
      useDefault: false,
      overrides: [{ method: 'popup', minutes: reminderMinutes }],
    },
  };
}

async function resolveDestinationCalendarId(explicitId?: string): Promise<string> {
  if (explicitId) return explicitId;
  const row = await getGoogleCalendarConnectionRow();
  if (row?.selectedCalendarId) return row.selectedCalendarId;
  const dedicated = await ensureDedicatedBensonCalendar();
  return dedicated.id;
}

export async function exportCalendarItemToGoogle(
  itemId: string,
  options?: GoogleExportConfirmInput,
): Promise<{ googleEventId: string; calendarId: string }> {
  const itemRows = await db.select().from(creatorCalendarItems).where(eq(creatorCalendarItems.id, itemId)).limit(1);
  const item = itemRows[0];
  if (!item) throw new Error('Calendar item not found');
  if (item.planningStatus !== 'confirmed') {
    throw new Error('Only confirmed calendar items can be exported to Google Calendar');
  }
  if (item.startAt.getTime() < Date.now()) {
    throw new Error('Past events cannot be exported to Google Calendar');
  }

  const syncRows = await db
    .select()
    .from(calendarSyncRecords)
    .where(eq(calendarSyncRecords.calendarItemId, itemId))
    .limit(1);
  let sync = syncRows[0];

  if (sync?.googleEventId && sync.syncStatus === 'synced') {
    throw new Error('Already synced — no duplicate Google event created');
  }

  const calendarId = await resolveDestinationCalendarId(options?.destinationCalendarId);
  const now = new Date();

  if (sync) {
    await db
      .update(calendarSyncRecords)
      .set({ syncStatus: 'syncing', googleCalendarId: calendarId, updatedAt: now })
      .where(eq(calendarSyncRecords.id, sync.id));
  }

  try {
    const body = buildGoogleEventBody(item, options);
    const res = await calendarFetch(`/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as GoogleEventResponse;
    if (!res.ok || !json.id) {
      throw new Error(json.error?.message ?? 'Google event creation failed');
    }

    const payloadHash = payloadHashFromItem(item);
    if (sync) {
      await db
        .update(calendarSyncRecords)
        .set({
          googleCalendarId: calendarId,
          googleEventId: json.id,
          payloadHash,
          syncStatus: 'synced',
          autoUpdateEnabled: options?.autoUpdateEnabled ?? false,
          lastSyncedAt: now,
          lastGoogleModifiedAt: json.updated ? new Date(json.updated) : now,
          lastError: null,
          retryCount: 0,
          updatedAt: now,
        })
        .where(eq(calendarSyncRecords.id, sync.id));
    } else {
      await db.insert(calendarSyncRecords).values({
        calendarItemId: itemId,
        googleCalendarId: calendarId,
        googleEventId: json.id,
        payloadHash,
        syncStatus: 'synced',
        autoUpdateEnabled: options?.autoUpdateEnabled ?? false,
        lastSyncedAt: now,
        updatedAt: now,
      });
    }

    await recordGoogleCalendarSyncSuccess();
    await emitDataChange({
      eventType: 'google_calendar_sync',
      domains: ['calendar'],
      completedAt: new Date().toISOString(),
      source: 'google-calendar.export',
      recordIds: [itemId],
      success: true,
    });

    return { googleEventId: json.id, calendarId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Google export failed';
    if (sync) {
      await db
        .update(calendarSyncRecords)
        .set({
          syncStatus: msg.includes('authorization') ? 'google_auth_required' : 'sync_failed',
          lastError: msg.slice(0, 500),
          retryCount: (sync.retryCount ?? 0) + 1,
          updatedAt: now,
        })
        .where(eq(calendarSyncRecords.id, sync.id));
    }
    await recordGoogleCalendarSyncFailure(msg);
    throw err;
  }
}

export async function updateGoogleCalendarEvent(itemId: string): Promise<void> {
  const itemRows = await db.select().from(creatorCalendarItems).where(eq(creatorCalendarItems.id, itemId)).limit(1);
  const item = itemRows[0];
  if (!item) throw new Error('Calendar item not found');

  const syncRows = await db
    .select()
    .from(calendarSyncRecords)
    .where(eq(calendarSyncRecords.calendarItemId, itemId))
    .limit(1);
  const sync = syncRows[0];
  if (!sync?.googleEventId) throw new Error('No Google event to update');

  const now = new Date();
  await db
    .update(calendarSyncRecords)
    .set({ syncStatus: 'syncing', updatedAt: now })
    .where(eq(calendarSyncRecords.id, sync.id));

  try {
    const body = buildGoogleEventBody(item);
    const res = await calendarFetch(
      `/calendars/${encodeURIComponent(sync.googleCalendarId)}/events/${encodeURIComponent(sync.googleEventId)}`,
      { method: 'PUT', body: JSON.stringify(body) },
    );
    const json = (await res.json()) as GoogleEventResponse;
    if (!res.ok) throw new Error(json.error?.message ?? 'Google event update failed');

    await db
      .update(calendarSyncRecords)
      .set({
        payloadHash: payloadHashFromItem(item),
        syncStatus: 'synced',
        lastSyncedAt: now,
        lastGoogleModifiedAt: json.updated ? new Date(json.updated) : now,
        lastError: null,
        updatedAt: now,
      })
      .where(eq(calendarSyncRecords.id, sync.id));

    await recordGoogleCalendarSyncSuccess();
    await emitDataChange({
      eventType: 'google_calendar_sync',
      domains: ['calendar'],
      completedAt: new Date().toISOString(),
      source: 'google-calendar.update',
      recordIds: [itemId],
      success: true,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Google update failed';
    await db
      .update(calendarSyncRecords)
      .set({
        syncStatus: 'sync_failed',
        lastError: msg.slice(0, 500),
        retryCount: sync.retryCount + 1,
        updatedAt: now,
      })
      .where(eq(calendarSyncRecords.id, sync.id));
    await recordGoogleCalendarSyncFailure(msg);
    throw err;
  }
}

export async function removeFromGoogleCalendar(itemId: string): Promise<void> {
  const syncRows = await db
    .select()
    .from(calendarSyncRecords)
    .where(eq(calendarSyncRecords.calendarItemId, itemId))
    .limit(1);
  const sync = syncRows[0];
  if (!sync?.googleEventId) {
    await db
      .update(calendarSyncRecords)
      .set({ syncStatus: 'removed_from_google', googleEventId: null, updatedAt: new Date() })
      .where(eq(calendarSyncRecords.calendarItemId, itemId));
    return;
  }

  try {
    const res = await calendarFetch(
      `/calendars/${encodeURIComponent(sync.googleCalendarId)}/events/${encodeURIComponent(sync.googleEventId)}`,
      { method: 'DELETE' },
    );
    if (!res.ok && res.status !== 404 && res.status !== 410) {
      const json = (await res.json()) as { error?: { message?: string } };
      throw new Error(json.error?.message ?? 'Google event deletion failed');
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Delete failed';
    if (!msg.includes('404') && !msg.includes('410')) throw err;
  }

  const now = new Date();
  await db
    .update(calendarSyncRecords)
    .set({
      syncStatus: 'removed_from_google',
      googleEventId: null,
      updatedAt: now,
    })
    .where(eq(calendarSyncRecords.id, sync.id));

  await emitDataChange({
    eventType: 'google_calendar_sync',
    domains: ['calendar'],
    completedAt: new Date().toISOString(),
    source: 'google-calendar.remove',
    recordIds: [itemId],
    success: true,
  });
}

export type BusyBlock = { start: string; end: string };

export async function fetchGoogleBusyBlocks(input: {
  from: Date;
  to: Date;
  calendarIds?: string[];
}): Promise<BusyBlock[]> {
  const row = await getGoogleCalendarConnectionRow();
  if (!row?.availabilityEnabled && !hasGoogleCalendarFreebusyScope(row?.scopes ?? [])) return [];

  const res = await calendarFetch('/freeBusy', {
    method: 'POST',
    body: JSON.stringify({
      timeMin: input.from.toISOString(),
      timeMax: input.to.toISOString(),
      items: (input.calendarIds ?? ['primary']).map((id) => ({ id })),
    }),
  });
  const json = (await res.json()) as {
    calendars?: Record<string, { busy?: Array<{ start: string; end: string }> }>;
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(json.error?.message ?? 'FreeBusy query failed');

  const blocks: BusyBlock[] = [];
  for (const cal of Object.values(json.calendars ?? {})) {
    for (const b of cal.busy ?? []) {
      blocks.push({ start: b.start, end: b.end });
    }
  }
  return blocks;
}

export function detectConflicts(
  plannedStart: Date,
  plannedEnd: Date,
  busyBlocks: BusyBlock[],
): BusyBlock[] {
  return busyBlocks.filter((b) => {
    const start = new Date(b.start).getTime();
    const end = new Date(b.end).getTime();
    return plannedStart.getTime() < end && plannedEnd.getTime() > start;
  });
}

export type CalendarBulkSyncResult = {
  ok: boolean;
  exported: number;
  updated: number;
  removed: number;
  failed: number;
  skipped: number;
  errors: Array<{ itemId: string; title: string; error: string }>;
};

/** Google events that should no longer live on the dedicated Benson calendar. */
async function listGoogleEventsToRemove(now = new Date()): Promise<
  Array<{ itemId: string; title: string }>
> {
  const rows = await db
    .select({
      itemId: creatorCalendarItems.id,
      title: creatorCalendarItems.title,
    })
    .from(calendarSyncRecords)
    .innerJoin(
      creatorCalendarItems,
      eq(calendarSyncRecords.calendarItemId, creatorCalendarItems.id),
    )
    .where(
      and(
        isNotNull(calendarSyncRecords.googleEventId),
        sql`${calendarSyncRecords.syncStatus} <> 'removed_from_google'`,
        or(
          inArray(creatorCalendarItems.planningStatus, [
            'expired',
            'dismissed',
            'cancelled',
            'missed',
          ]),
          isNotNull(creatorCalendarItems.dismissedAt),
          // Past day: event end (or start when no end) is before now.
          sql`COALESCE(${creatorCalendarItems.endAt}, ${creatorCalendarItems.startAt}) < ${now}`,
        ),
      ),
    );

  return rows;
}

/** Push pending confirmed Benson plans to Google (export + update + remove stale). */
export async function syncBensonCalendarToGoogle(): Promise<CalendarBulkSyncResult> {
  const { listCalendarItems, sweepExpiredCalendarItems } = await import(
    '../creator-calendar/items.js'
  );
  const { getGoogleCalendarConnectionStatus } = await import('./connections.js');

  const status = await getGoogleCalendarConnectionStatus();
  if (!status.calendarAuthorized && !status.hasValidTokens) {
    return {
      ok: false,
      exported: 0,
      updated: 0,
      removed: 0,
      failed: 0,
      skipped: 0,
      errors: [{ itemId: '', title: '', error: 'Google Calendar not connected' }],
    };
  }

  await ensureDedicatedBensonCalendar();
  await sweepExpiredCalendarItems();

  let exported = 0;
  let updated = 0;
  let removed = 0;
  let failed = 0;
  let skipped = 0;
  const errors: CalendarBulkSyncResult['errors'] = [];

  const stale = await listGoogleEventsToRemove();
  for (const row of stale) {
    try {
      await removeFromGoogleCalendar(row.itemId);
      removed += 1;
    } catch (err) {
      failed += 1;
      errors.push({
        itemId: row.itemId,
        title: row.title,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const items = await listCalendarItems({
    includeCompleted: false,
    includeExpired: false,
    syncStatuses: [
      'ready_to_export',
      'sync_failed',
      'update_available',
      'google_auth_required',
      'removed_from_google',
    ],
  });

  for (const item of items) {
    const syncStatus = item.sync?.syncStatus;
    try {
      if (syncStatus === 'update_available' && item.sync?.googleEventId) {
        await updateGoogleCalendarEvent(item.id);
        updated += 1;
        continue;
      }
      if (
        (syncStatus === 'ready_to_export' ||
          syncStatus === 'sync_failed' ||
          syncStatus === 'google_auth_required' ||
          syncStatus === 'removed_from_google') &&
        !item.sync?.googleEventId
      ) {
        if (item.planningStatus !== 'confirmed') {
          skipped += 1;
          continue;
        }
        await exportCalendarItemToGoogle(item.id);
        exported += 1;
        continue;
      }
      if (syncStatus === 'sync_failed' && item.sync?.googleEventId) {
        await updateGoogleCalendarEvent(item.id);
        updated += 1;
        continue;
      }
      skipped += 1;
    } catch (err) {
      failed += 1;
      errors.push({
        itemId: item.id,
        title: item.title,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    ok: failed === 0,
    exported,
    updated,
    removed,
    failed,
    skipped,
    errors,
  };
}
