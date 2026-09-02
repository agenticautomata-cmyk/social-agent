import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, or, sql } from 'drizzle-orm';
import { db } from '../db.js';
import {
  calendarSyncRecords,
  contentItems,
  creatorCalendarItems,
  type CalendarSyncRecord,
  type CreatorCalendarItem,
} from '../schema.js';
import { emitDataChange } from '../data-revision/index.js';
import { sanitizeScrapedText, sanitizeScrapedTitle } from '../text-sanitize/sanitize-scraped-text.js';
import { resolveDisplayTitleFromRecord } from '../display-title/index.js';
import {
  DEFAULT_CALENDAR_TIMEZONE,
  type CalendarItemView,
  type CalendarListFilters,
  type CalendarPlanningStatus,
  type CalendarSyncView,
  type CreateCalendarItemInput,
  type UpdateCalendarItemInput,
} from './types.js';
import {
  parseReminderSettings,
  parseStringArray,
  payloadHashFromItem,
} from './payload-hash.js';
import { eventFallsInChicagoWeekend } from './weekend-things-to-do.js';
import { loadByBoard } from '../content-planner/items.js';
import { recordCalendarDismissal } from './dismiss.js';
import { calendarProjectionReadPlan, calendarProjectionWindowKey, CALENDAR_PROJECTION_BACKGROUND_DELAY_MS } from './population/projection-freshness.js';
import { ensureCalendarInventoryProjections } from './population/sync.js';
import { calendarSuggestionIsDisplayable } from './population/eligibility.js';
import { calendarCategoryFromStored } from './population/calendar-category.js';
import { dedupeActiveCalendarViews } from './population/merge.js';
import {
  beginCalendarReadProfile,
  calendarReadSpan,
  finishCalendarReadProfile,
  nowMs,
} from './population/read-profile.js';
import {
  listActiveCalendarCategorySnoozes,
  shouldHideUnselectedSuggestionForSnooze,
} from './category-snooze.js';

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function mapSync(row: CalendarSyncRecord | null | undefined): CalendarSyncView | null {
  if (!row) return null;
  return {
    syncStatus: row.syncStatus,
    googleCalendarId: row.googleCalendarId,
    googleEventId: row.googleEventId,
    autoUpdateEnabled: row.autoUpdateEnabled,
    lastSyncedAt: toIso(row.lastSyncedAt),
    lastError: row.lastError,
    updateAvailable: row.syncStatus === 'update_available',
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function metaString(meta: Record<string, unknown>, key: string): string | null {
  const value = meta[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isPipelineWhyIncluded(value: string): boolean {
  if (value.length > 96) return false;
  if (/\bamphitheatr|\bwith very special\b/i.test(value)) return false;
  return /watchlist|discoveries@|ask benson|^newsletter$|benson inventory|visitkc|kc library/i.test(
    value,
  );
}

function displayWhyIncluded(notes: string | null, meta: Record<string, unknown>): string | null {
  const candidates = [metaString(meta, 'whyIncluded'), notes?.trim() || null].filter(
    (value): value is string => Boolean(value),
  );
  return candidates.find(isPipelineWhyIncluded) ?? null;
}

function recommendedAction(item: CreatorCalendarItem, sync: CalendarSyncView | null): string | null {
  if (item.planningStatus === 'suggested') {
    return 'Benson suggestion — add to weekend list, select, or dismiss';
  }
  if (item.planningStatus === 'expired') return null;
  if (sync?.syncStatus === 'update_available') return 'Update Google Calendar';
  if (sync?.syncStatus === 'ready_to_export' && item.planningStatus === 'confirmed') {
    return 'Add to Google Calendar';
  }
  if (sync?.syncStatus === 'sync_failed') return 'Retry Google sync';
  if (sync?.syncStatus === 'google_auth_required') return 'Reconnect Google Calendar';
  return null;
}

export function mapCalendarItemView(
  item: CreatorCalendarItem,
  sync?: CalendarSyncRecord | null,
  extras?: { selected?: boolean },
): CalendarItemView {
  const syncView = mapSync(sync);
  const meta = asRecord(item.metadata);
  const whyIncluded = displayWhyIncluded(item.notes, meta);
  const display = resolveDisplayTitleFromRecord({
    rawTitle: typeof meta.rawTitle === 'string' ? meta.rawTitle : item.title,
    sourceName: typeof meta.sourceName === 'string' ? meta.sourceName : null,
    venueName: item.location,
    sourceUrl: item.sourceUrl,
    summary: item.description,
    metadata: meta,
  });
  return {
    id: item.id,
    title: display.displayTitle,
    subtitle: display.displaySubtitle,
    rawTitle: display.rawTitle,
    sourceName: display.sourceName,
    venueName: display.venueName ?? item.location,
    description: item.description,
    itemType: item.itemType,
    sourceRecordType: item.sourceRecordType,
    sourceRecordId: item.sourceRecordId,
    sourceUrl: item.sourceUrl,
    internalDetailUrl: item.internalDetailUrl,
    startAt: item.startAt.toISOString(),
    endAt: toIso(item.endAt),
    allDay: item.allDay,
    timezone: item.timezone,
    location: item.location,
    latitude: item.latitude,
    longitude: item.longitude,
    status: item.status,
    planningStatus: item.planningStatus,
    creatorAction: item.creatorAction,
    reminderSettings: parseReminderSettings(item.reminderSettings),
    contentFormat: item.contentFormat,
    verifiedFields: parseStringArray(item.verifiedFields),
    unverifiedFields: parseStringArray(item.unverifiedFields),
    notes: item.notes,
    travelMinutes: item.travelMinutes,
    createdBy: item.createdBy,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    completedAt: toIso(item.completedAt),
    missedAt: toIso(item.missedAt),
    expiredAt: toIso(item.expiredAt),
    calendarIntent: item.calendarIntent,
    verificationState: item.verificationState ?? 'unverified',
    whyIncluded,
    confidence: item.confidence != null ? Number(item.confidence) : null,
    selected: extras?.selected ?? item.planningStatus === 'confirmed',
    fallsInWeekend: eventFallsInChicagoWeekend(item.startAt.toISOString(), item.endAt ? item.endAt.toISOString() : null),
    ticketUrl: metaString(meta, 'ticketUrl'),
    organizerUrl: metaString(meta, 'organizerUrl'),
    calendarCategory: calendarCategoryFromStored({
      metadata: meta,
      ingest: metaString(meta, 'ingest'),
      populationSource: item.populationSource,
      sourceType: metaString(meta, 'sourceType'),
    }),
    sync: syncView,
    recommendedAction: recommendedAction(item, syncView),
  };
}

async function weekendSelectedContentIds(): Promise<Set<string>> {
  const rows = await loadByBoard('Weekend').catch(() => []);
  return new Set(
    rows
      .filter((row) => row.status !== 'skipped' && row.status !== 'covered')
      .map((row) => row.contentItemId),
  );
}

function withSelection(view: CalendarItemView, weekendIds: Set<string>): CalendarItemView {
  const contentId =
    view.sourceRecordType === 'content_item' && view.sourceRecordId ? view.sourceRecordId : null;
  const selected = view.planningStatus === 'confirmed' || (contentId ? weekendIds.has(contentId) : false);
  return { ...view, selected };
}

async function enrichCalendarCategories(views: CalendarItemView[]): Promise<CalendarItemView[]> {
  const needIds = [
    ...new Set(
      views
        .filter(
          (view) =>
            !view.calendarCategory &&
            view.sourceRecordType === 'content_item' &&
            view.sourceRecordId,
        )
        .map((view) => view.sourceRecordId as string),
    ),
  ];
  if (needIds.length === 0) return views;
  const rows = await db
    .select({
      id: contentItems.id,
      metadata: contentItems.metadata,
      contentCategory: contentItems.contentCategory,
    })
    .from(contentItems)
    .where(inArray(contentItems.id, needIds));
  const byId = new Map(
    rows.map((row) => [
      row.id,
      calendarCategoryFromStored({
        metadata: asRecord(row.metadata),
        contentCategory: row.contentCategory,
      }),
    ]),
  );
  return views.map((view) => {
    if (view.calendarCategory) return view;
    if (view.sourceRecordType !== 'content_item' || !view.sourceRecordId) return view;
    const category = byId.get(view.sourceRecordId) ?? null;
    return category ? { ...view, calendarCategory: category } : view;
  });
}

async function loadSyncMap(itemIds: string[]): Promise<Map<string, CalendarSyncRecord>> {
  if (itemIds.length === 0) return new Map();
  const rows = await db
    .select()
    .from(calendarSyncRecords)
    .where(inArray(calendarSyncRecords.calendarItemId, itemIds));
  return new Map(rows.map((r) => [r.calendarItemId, r]));
}

function parseDate(input: Date | string): Date {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) throw new Error('Invalid date');
  return d;
}

export async function createCalendarItem(input: CreateCalendarItemInput): Promise<CalendarItemView> {
  const now = new Date();
  const planningStatus = input.planningStatus ?? 'tentative';
  const [item] = await db
    .insert(creatorCalendarItems)
    .values({
      // Calendar items are often populated from scraped newsletter/event sources —
      // sanitize at write time so HTML entities and CSS/JS artifacts never reach the UI.
      title: sanitizeScrapedTitle(input.title.trim()),
      description: input.description ? sanitizeScrapedText(input.description) : null,
      itemType: input.itemType,
      sourceRecordType: input.sourceRecordType ?? null,
      sourceRecordId: input.sourceRecordId ?? null,
      sourceUrl: input.sourceUrl ?? null,
      internalDetailUrl: input.internalDetailUrl ?? null,
      startAt: parseDate(input.startAt),
      endAt: input.endAt ? parseDate(input.endAt) : null,
      allDay: input.allDay ?? false,
      timezone: input.timezone ?? DEFAULT_CALENDAR_TIMEZONE,
      location: input.location ? sanitizeScrapedTitle(input.location) : input.location ?? null,
      latitude: input.latitude != null ? String(input.latitude) : null,
      longitude: input.longitude != null ? String(input.longitude) : null,
      status: planningStatus,
      planningStatus,
      creatorAction: input.creatorAction ?? null,
      reminderSettings: input.reminderSettings ?? {},
      contentFormat: input.contentFormat ?? null,
      verifiedFields: input.verifiedFields ?? [],
      unverifiedFields: input.unverifiedFields ?? [],
      notes: input.notes ?? null,
      travelMinutes: input.travelMinutes ?? null,
      createdBy: input.createdBy ?? 'kellie',
      updatedAt: now,
    })
    .returning();

  if (!item) throw new Error('Failed to create calendar item');

  const syncStatus =
    planningStatus === 'confirmed' && item.startAt.getTime() > Date.now()
      ? 'ready_to_export'
      : 'benson_only';

  const [sync] = await db
    .insert(calendarSyncRecords)
    .values({
      calendarItemId: item.id,
      googleCalendarId: 'pending',
      syncStatus,
      updatedAt: now,
    })
    .returning();

  await emitDataChange({
    eventType: 'calendar_change',
    domains: ['calendar', 'recommendations', 'home_briefing'],
    completedAt: new Date().toISOString(),
    source: 'creator-calendar.create',
    recordIds: [item.id],
    success: true,
  });

  return mapCalendarItemView(item, sync);
}

export async function getCalendarItem(id: string): Promise<CalendarItemView | null> {
  const rows = await db.select().from(creatorCalendarItems).where(eq(creatorCalendarItems.id, id)).limit(1);
  const item = rows[0];
  if (!item) return null;
  const syncRows = await db
    .select()
    .from(calendarSyncRecords)
    .where(eq(calendarSyncRecords.calendarItemId, id))
    .limit(1);
  const weekendIds = await weekendSelectedContentIds();
  const [view] = await enrichCalendarCategories([
    withSelection(mapCalendarItemView(item, syncRows[0]), weekendIds),
  ]);
  return view ?? null;
}

export async function listCalendarItems(filters: CalendarListFilters = {}): Promise<CalendarItemView[]> {
  const started = nowMs();
  beginCalendarReadProfile();
  const from = filters.from ? parseDate(filters.from) : new Date(Date.now() - 24 * 60 * 60 * 1000);
  const to = filters.to ? parseDate(filters.to) : new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

  const conditions = [];

  if (filters.from) conditions.push(gte(creatorCalendarItems.startAt, from));
  if (filters.to) conditions.push(lte(creatorCalendarItems.startAt, to));
  if (filters.itemTypes?.length) {
    conditions.push(inArray(creatorCalendarItems.itemType, filters.itemTypes));
  }
  if (filters.planningStatuses?.length) {
    conditions.push(inArray(creatorCalendarItems.planningStatus, filters.planningStatuses));
  }
  if (filters.sourceRecordType) {
    conditions.push(eq(creatorCalendarItems.sourceRecordType, filters.sourceRecordType));
  }
  if (filters.sourceRecordId) {
    conditions.push(eq(creatorCalendarItems.sourceRecordId, filters.sourceRecordId));
  }
  if (!filters.includeCompleted) {
    conditions.push(ne(creatorCalendarItems.planningStatus, 'completed'));
  }
  if (!filters.includeExpired) {
    conditions.push(ne(creatorCalendarItems.planningStatus, 'expired'));
  }
  // A dismissed/cancelled item (e.g. a repeatedly-skipped Don Felder concert) must never
  // resurface in the active calendar just because nothing else filtered it out.
  if (!filters.includeDismissed) {
    conditions.push(ne(creatorCalendarItems.planningStatus, 'dismissed'));
  }
  if (!filters.includeCancelled) {
    conditions.push(ne(creatorCalendarItems.planningStatus, 'cancelled'));
  }

  const rowsStarted = nowMs();
  let rows = await db
    .select()
    .from(creatorCalendarItems)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(creatorCalendarItems.startAt));
  const profile = calendarReadSpan();
  profile.calendarRowsReadMs += nowMs() - rowsStarted;
  profile.calendarRowCount = rows.length;

  const projectionMode = calendarProjectionReadPlan({
    windowKey: calendarProjectionWindowKey(from, to),
    hasProjectedRows: rows.length > 0,
  });
  if (projectionMode === 'awaited') {
    try {
      await ensureCalendarInventoryProjections(from, to);
      const reloadStarted = nowMs();
      rows = await db
        .select()
        .from(creatorCalendarItems)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(asc(creatorCalendarItems.startAt));
      profile.calendarRowsReadMs += nowMs() - reloadStarted;
      profile.calendarRowCount = rows.length;
    } catch (err) {
      console.error('[creator-calendar] inventory projection failed', err);
    }
  }

  const syncStarted = nowMs();
  const syncMap = await loadSyncMap(rows.map((r) => r.id));
  profile.syncMapMs += nowMs() - syncStarted;

  const selectStarted = nowMs();
  const weekendIds = await weekendSelectedContentIds();
  const mapped = rows.map((item) =>
    withSelection(mapCalendarItemView(item, syncMap.get(item.id)), weekendIds),
  );
  profile.selectionOverlayMs += nowMs() - selectStarted;

  const enrichStarted = nowMs();
  const enriched = await enrichCalendarCategories(mapped);
  profile.categoryEnrichMs += nowMs() - enrichStarted;

  const shapeStarted = nowMs();
  let views = enriched.filter((view) => {
    if (view.planningStatus !== 'suggested') return true;
    return calendarSuggestionIsDisplayable({
      title: view.title,
      location: view.location,
    });
  });
  views = dedupeActiveCalendarViews(views);
  profile.displayDedupeMs += nowMs() - shapeStarted;

  const snoozeStarted = nowMs();
  const snoozes = await listActiveCalendarCategorySnoozes().catch((err) => {
    console.error('[creator-calendar] category snooze load failed', err);
    return [];
  });
  if (snoozes.length) {
    views = views.filter((view) => !shouldHideUnselectedSuggestionForSnooze(view, snoozes));
  }
  profile.snoozeFilterMs += nowMs() - snoozeStarted;

  if (filters.googleSynced) {
    views = views.filter((v) =>
      ['synced', 'update_available'].includes(v.sync?.syncStatus ?? ''),
    );
  }
  if (filters.bensonOnly) {
    views = views.filter((v) =>
      !v.sync?.googleEventId || v.sync.syncStatus === 'benson_only' || v.sync.syncStatus === 'removed_from_google',
    );
  }
  if (filters.syncStatuses?.length) {
    views = views.filter((v) => v.sync && filters.syncStatuses!.includes(v.sync.syncStatus));
  }

  profile.viewCount = views.length;
  finishCalendarReadProfile(nowMs() - started);
  if (projectionMode === 'background') {
    const fromCopy = from;
    const toCopy = to;
    setTimeout(() => {
      void ensureCalendarInventoryProjections(fromCopy, toCopy).catch((err) => {
        console.error('[creator-calendar] background inventory projection failed', err);
      });
    }, CALENDAR_PROJECTION_BACKGROUND_DELAY_MS);
  }
  return views;
}

export async function updateCalendarItem(
  id: string,
  input: UpdateCalendarItemInput,
): Promise<CalendarItemView | null> {
  const existingRows = await db
    .select()
    .from(creatorCalendarItems)
    .where(eq(creatorCalendarItems.id, id))
    .limit(1);
  const existing = existingRows[0];
  if (!existing) return null;

  const now = new Date();
  const patch: Partial<typeof creatorCalendarItems.$inferInsert> = { updatedAt: now };

  if (input.title !== undefined) patch.title = input.title.trim();
  if (input.description !== undefined) patch.description = input.description;
  if (input.itemType !== undefined) patch.itemType = input.itemType;
  if (input.startAt !== undefined) patch.startAt = parseDate(input.startAt);
  if (input.endAt !== undefined) patch.endAt = input.endAt ? parseDate(input.endAt) : null;
  if (input.allDay !== undefined) patch.allDay = input.allDay;
  if (input.timezone !== undefined) patch.timezone = input.timezone;
  if (input.location !== undefined) patch.location = input.location;
  if (input.latitude !== undefined) patch.latitude = input.latitude != null ? String(input.latitude) : null;
  if (input.longitude !== undefined) patch.longitude = input.longitude != null ? String(input.longitude) : null;
  if (input.creatorAction !== undefined) patch.creatorAction = input.creatorAction;
  if (input.reminderSettings !== undefined) patch.reminderSettings = input.reminderSettings;
  if (input.contentFormat !== undefined) patch.contentFormat = input.contentFormat;
  if (input.verifiedFields !== undefined) patch.verifiedFields = input.verifiedFields;
  if (input.unverifiedFields !== undefined) patch.unverifiedFields = input.unverifiedFields;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.travelMinutes !== undefined) patch.travelMinutes = input.travelMinutes;
  if (input.planningStatus !== undefined) {
    patch.planningStatus = input.planningStatus;
    patch.status = input.planningStatus;
    if (input.planningStatus === 'completed') patch.completedAt = now;
    if (input.planningStatus === 'missed') patch.missedAt = now;
    if (input.planningStatus === 'expired') patch.expiredAt = now;
    if (input.planningStatus === 'dismissed') patch.dismissedAt = now;
  }
  if (input.status !== undefined) {
    patch.status = input.status;
    patch.planningStatus = input.status;
  }

  const [updated] = await db
    .update(creatorCalendarItems)
    .set(patch)
    .where(eq(creatorCalendarItems.id, id))
    .returning();

  if (!updated) throw new Error('Calendar item not found');

  if (updated.planningStatus === 'dismissed') {
    await recordCalendarDismissal(updated).catch((err) => {
      console.error('[creator-calendar] dismissal fingerprint write failed', err);
    });
  }

  const syncRows = await db
    .select()
    .from(calendarSyncRecords)
    .where(eq(calendarSyncRecords.calendarItemId, id))
    .limit(1);
  let sync = syncRows[0];

  if (sync?.googleEventId && sync.syncStatus === 'synced') {
    const newHash = payloadHashFromItem(updated);
    if (newHash !== sync.payloadHash) {
      if (sync.autoUpdateEnabled) {
        // Caller may trigger auto sync; mark update available for manual review by default safety
        const [next] = await db
          .update(calendarSyncRecords)
          .set({ syncStatus: 'update_available', updatedAt: now })
          .where(eq(calendarSyncRecords.id, sync.id))
          .returning();
        sync = next!;
      } else {
        const [next] = await db
          .update(calendarSyncRecords)
          .set({ syncStatus: 'update_available', updatedAt: now })
          .where(eq(calendarSyncRecords.id, sync.id))
          .returning();
        sync = next!;
      }
    }
  } else if (sync && updated.planningStatus === 'confirmed' && updated.startAt.getTime() > Date.now()) {
    if (sync.syncStatus === 'benson_only' || sync.syncStatus === 'removed_from_google') {
      const [next] = await db
        .update(calendarSyncRecords)
        .set({ syncStatus: 'ready_to_export', updatedAt: now })
        .where(eq(calendarSyncRecords.id, sync.id))
        .returning();
      sync = next!;
    }
  }

  await emitDataChange({
    eventType: 'calendar_change',
    domains: ['calendar', 'recommendations', 'home_briefing'],
    completedAt: new Date().toISOString(),
    source: 'creator-calendar.update',
    recordIds: [id],
    success: true,
  });

  return mapCalendarItemView(updated, sync);
}

export type DeleteCalendarItemMode = 'benson_only' | 'benson_and_google';

export async function deleteCalendarItem(
  id: string,
  _mode: DeleteCalendarItemMode = 'benson_only',
): Promise<boolean> {
  const result = await db.delete(creatorCalendarItems).where(eq(creatorCalendarItems.id, id)).returning({ id: creatorCalendarItems.id });
  if (result.length === 0) return false;

  await emitDataChange({
    eventType: 'calendar_change',
    domains: ['calendar', 'recommendations', 'home_briefing'],
    completedAt: new Date().toISOString(),
    source: 'creator-calendar.delete',
    recordIds: [id],
    success: true,
  });
  return true;
}

export async function markCalendarItemMissed(id: string): Promise<CalendarItemView | null> {
  return updateCalendarItem(id, { planningStatus: 'missed' });
}

export async function confirmCalendarItem(id: string): Promise<CalendarItemView | null> {
  return updateCalendarItem(id, { planningStatus: 'confirmed' });
}

export async function loadCalendarContextForAsk(options?: {
  from?: Date;
  to?: Date;
  limit?: number;
}): Promise<CalendarItemView[]> {
  const from = options?.from ?? new Date();
  const to = options?.to ?? new Date(Date.now() + 21 * 24 * 60 * 60 * 1000);
  const items = await listCalendarItems({
    from,
    to,
    includeCompleted: false,
    includeExpired: false,
  });
  return items.slice(0, options?.limit ?? 40);
}

export async function sweepExpiredCalendarItems(now = new Date()): Promise<number> {
  const rows = await db
    .update(creatorCalendarItems)
    .set({
      planningStatus: 'expired',
      status: 'expired',
      expiredAt: now,
      updatedAt: now,
    })
    .where(
      and(
        lte(creatorCalendarItems.startAt, now),
        inArray(creatorCalendarItems.planningStatus, ['suggested', 'tentative', 'confirmed']),
        or(isNull(creatorCalendarItems.endAt), lte(creatorCalendarItems.endAt, now)),
      ),
    )
    .returning({ id: creatorCalendarItems.id });

  if (rows.length > 0) {
    await emitDataChange({
      eventType: 'calendar_change',
      domains: ['calendar'],
      completedAt: new Date().toISOString(),
      source: 'creator-calendar.expire-sweep',
      recordIds: rows.map((r) => r.id),
      success: true,
    });
  }
  return rows.length;
}

export function canExportToGoogle(item: CalendarItemView): { ok: boolean; reason?: string } {
  if (item.planningStatus === 'expired' || new Date(item.startAt).getTime() < Date.now()) {
    return { ok: false, reason: 'Past events cannot be exported to Google Calendar.' };
  }
  if (item.planningStatus !== 'confirmed') {
    return { ok: false, reason: 'Only confirmed plans can be exported to Google Calendar.' };
  }
  if (item.sync?.googleEventId && item.sync.syncStatus === 'synced') {
    return { ok: false, reason: 'Already synced — use Update Google instead.' };
  }
  return { ok: true };
}
