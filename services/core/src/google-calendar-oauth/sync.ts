import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { creatorCalendarItems, calendarSyncRecords } from '../schema.js';
import {
  BENSON_DEDICATED_CALENDAR_NAME,
  GOOGLE_CALENDAR_API_BASE,
} from './constants.js';
import {
  getGoogleCalendarAccessToken,
  getGoogleCalendarConnectionRow,
  recordGoogleCalendarSyncFailure,
  recordGoogleCalendarSyncSuccess,
  setDedicatedGoogleCalendar,
  updateGoogleCalendarSelection,
} from './connections.js';
import { payloadHashFromItem } from '../creator-calendar/payload-hash.js';
import { CALENDAR_ITEM_TYPE_LABELS } from '../creator-calendar/types.js';
import { emitDataChange } from '../data-revision/index.js';
import type { GoogleExportConfirmInput } from '../creator-calendar/types.js';

type GoogleCalendarListEntry = {
  id: string;
  summary: string;
  accessRole: string;
  primary?: boolean;
};

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

export async function listWritableGoogleCalendars(): Promise<
  Array<{ id: string; name: string; primary: boolean }>
> {
  const res = await calendarFetch('/users/me/calendarList');
  const json = (await res.json()) as { items?: GoogleCalendarListEntry[]; error?: { message?: string } };
  if (!res.ok) throw new Error(json.error?.message ?? 'Failed to list Google calendars');

  return (json.items ?? [])
    .filter((c) => c.accessRole === 'owner' || c.accessRole === 'writer')
    .map((c) => ({ id: c.id, name: c.summary, primary: c.primary === true }));
}

/** Lists calendars created by this app (calendar.app.created scope). */
export async function listAppCreatedCalendars(): Promise<
  Array<{ id: string; name: string }>
> {
  const calendars = await listWritableGoogleCalendars();
  return calendars.map((c) => ({ id: c.id, name: c.name }));
}

export async function ensureDedicatedBensonCalendar(): Promise<{ id: string; name: string; created: boolean }> {
  const row = await getGoogleCalendarConnectionRow();
  if (row?.dedicatedCalendarId) {
    return {
      id: row.dedicatedCalendarId,
      name: row.dedicatedCalendarName ?? BENSON_DEDICATED_CALENDAR_NAME,
      created: false,
    };
  }

  const calendars = await listWritableGoogleCalendars();
  const existing = calendars.find((c) => c.name === BENSON_DEDICATED_CALENDAR_NAME);
  if (existing) {
    await setDedicatedGoogleCalendar({ calendarId: existing.id, calendarName: existing.name });
    return { id: existing.id, name: existing.name, created: false };
  }

  const res = await calendarFetch('/calendars', {
    method: 'POST',
    body: JSON.stringify({
      summary: BENSON_DEDICATED_CALENDAR_NAME,
      timeZone: 'America/Chicago',
      description: 'Creator operations calendar managed by Benson. Events are added only when Kellie approves export.',
    }),
  });
  const json = (await res.json()) as { id?: string; summary?: string; error?: { message?: string } };
  if (!res.ok || !json.id) throw new Error(json.error?.message ?? 'Failed to create Benson calendar');

  await setDedicatedGoogleCalendar({ calendarId: json.id, calendarName: json.summary ?? BENSON_DEDICATED_CALENDAR_NAME });
  return { id: json.id, name: json.summary ?? BENSON_DEDICATED_CALENDAR_NAME, created: true };
}

export async function selectGoogleCalendar(calendarId: string, calendarName: string): Promise<void> {
  await updateGoogleCalendarSelection({ selectedCalendarId: calendarId, selectedCalendarName: calendarName });
}

function formatGoogleDateTime(iso: string, timezone: string, allDay: boolean): { date?: string; dateTime?: string; timeZone?: string } {
  if (allDay) {
    return { date: iso.slice(0, 10) };
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
  if (!row?.availabilityEnabled && !row?.scopes?.includes('calendar.freebusy')) return [];

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
