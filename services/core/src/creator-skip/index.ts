import { and, desc, eq, gt, isNull, or } from 'drizzle-orm';
import { db } from '../db.js';
import { contentItems, creatorSkippedRecords } from '../schema.js';
import { emitDataChange } from '../data-revision/index.js';
import { computeOccurrenceFingerprint, fingerprintFromInventoryItem } from './fingerprint.js';
import type { InventoryItem } from '../inventory/normalize.js';

export type SkipSourceScreen =
  | 'today'
  | 'home'
  | 'search'
  | 'early_signals'
  | 'discovery_detail'
  | 'ask_benson'
  | 'planner'
  | 'sources'
  | 'interested_queue'
  | 'unknown';

export type SnoozePreset = 'later_today' | 'tomorrow' | 'this_weekend' | 'next_week';

function snoozeUntilFromPreset(preset: SnoozePreset, now = new Date()): Date {
  const d = new Date(now);
  switch (preset) {
    case 'later_today':
      d.setHours(d.getHours() + 4, 0, 0, 0);
      return d;
    case 'tomorrow': {
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d;
    }
    case 'this_weekend': {
      const day = d.getDay();
      const daysUntilSat = (6 - day + 7) % 7 || 7;
      d.setDate(d.getDate() + daysUntilSat);
      d.setHours(10, 0, 0, 0);
      return d;
    }
    case 'next_week': {
      d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
      d.setHours(9, 0, 0, 0);
      return d;
    }
  }
}

async function loadContentItemForSkip(contentItemId: string) {
  const [row] = await db
    .select({
      id: contentItems.id,
      topic: contentItems.topic,
      eventStartsAt: contentItems.eventStartsAt,
      eventEndsAt: contentItems.eventEndsAt,
      locationName: contentItems.locationName,
      formattedAddress: contentItems.formattedAddress,
      sourceUrl: contentItems.sourceUrl,
      hook: contentItems.hook,
    })
    .from(contentItems)
    .where(eq(contentItems.id, contentItemId))
    .limit(1);
  return row ?? null;
}

export async function skipDiscoveryRecord(options: {
  contentItemId: string;
  sourceScreen: SkipSourceScreen;
  snoozeUntil?: Date | null;
  snoozePreset?: SnoozePreset;
  occurrenceFingerprint?: string;
}): Promise<{ ok: true; fingerprint: string; skippedAt: string }> {
  const item = await loadContentItemForSkip(options.contentItemId);
  if (!item) throw new Error('Content item not found');

  const fingerprint =
    options.occurrenceFingerprint ??
    computeOccurrenceFingerprint({
      title: item.topic,
      eventDate: item.eventStartsAt?.toISOString() ?? null,
      eventEndDate: item.eventEndsAt?.toISOString() ?? null,
      locationName: item.locationName,
      formattedAddress: item.formattedAddress,
      sourceUrl: item.sourceUrl,
      summary: item.hook,
    });

  const snoozeUntil =
    options.snoozeUntil ?? (options.snoozePreset ? snoozeUntilFromPreset(options.snoozePreset) : null);

  const now = new Date();
  const existing = await db
    .select({ id: creatorSkippedRecords.id })
    .from(creatorSkippedRecords)
    .where(
      and(
        eq(creatorSkippedRecords.contentItemId, options.contentItemId),
        eq(creatorSkippedRecords.occurrenceFingerprint, fingerprint),
        isNull(creatorSkippedRecords.restoredAt),
      ),
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(creatorSkippedRecords)
      .set({
        skippedAt: now,
        sourceScreen: options.sourceScreen,
        snoozeUntil: snoozeUntil ?? null,
        updatedAt: now,
      })
      .where(eq(creatorSkippedRecords.id, existing[0].id));
  } else {
    await db.insert(creatorSkippedRecords).values({
      contentItemId: options.contentItemId,
      occurrenceFingerprint: fingerprint,
      skippedAt: now,
      sourceScreen: options.sourceScreen,
      snoozeUntil: snoozeUntil ?? null,
    });
  }

  await emitDataChange({
    eventType: 'skip',
    domains: ['opportunities', 'discoveries', 'recommendations', 'home_briefing'],
    completedAt: now.toISOString(),
    source: options.sourceScreen,
    recordIds: [options.contentItemId],
    success: true,
    metadata: { fingerprint, snoozeUntil: snoozeUntil?.toISOString() ?? null },
  });

  return { ok: true, fingerprint, skippedAt: now.toISOString() };
}

/** Skip/snooze rows that currently hide an item from active queues. */
export async function loadActiveSkippedRecords(): Promise<
  Array<{ contentItemId: string; occurrenceFingerprint: string; snoozeUntil: Date | null }>
> {
  const now = new Date();
  const rows = await db
    .select({
      contentItemId: creatorSkippedRecords.contentItemId,
      occurrenceFingerprint: creatorSkippedRecords.occurrenceFingerprint,
      snoozeUntil: creatorSkippedRecords.snoozeUntil,
    })
    .from(creatorSkippedRecords)
    .where(
      and(
        isNull(creatorSkippedRecords.restoredAt),
        or(isNull(creatorSkippedRecords.snoozeUntil), gt(creatorSkippedRecords.snoozeUntil, now)),
      ),
    );

  return rows;
}

/** Content IDs hidden by skip when fingerprint still matches. */
export async function loadSkippedContentIdsForItems(
  items: Pick<
    InventoryItem,
    | 'id'
    | 'title'
    | 'eventDate'
    | 'eventEndDate'
    | 'locationName'
    | 'formattedAddress'
    | 'venue'
    | 'sourceUrl'
    | 'summary'
  >[],
): Promise<Set<string>> {
  if (items.length === 0) return new Set();
  const skips = await loadActiveSkippedRecords();
  if (skips.length === 0) return new Set();

  const skipByItem = new Map<string, Set<string>>();
  for (const skip of skips) {
    const set = skipByItem.get(skip.contentItemId) ?? new Set();
    set.add(skip.occurrenceFingerprint);
    skipByItem.set(skip.contentItemId, set);
  }

  const hidden = new Set<string>();
  for (const item of items) {
    const fingerprints = skipByItem.get(item.id);
    if (!fingerprints?.size) continue;
    const current = fingerprintFromInventoryItem(item as InventoryItem);
    if (fingerprints.has(current)) hidden.add(item.id);
  }
  return hidden;
}

export async function restoreSkippedRecord(contentItemId: string, fingerprint?: string): Promise<void> {
  const now = new Date();
  await db
    .update(creatorSkippedRecords)
    .set({ restoredAt: now, updatedAt: now })
    .where(
      fingerprint
        ? and(
            eq(creatorSkippedRecords.contentItemId, contentItemId),
            eq(creatorSkippedRecords.occurrenceFingerprint, fingerprint),
            isNull(creatorSkippedRecords.restoredAt),
          )
        : and(
            eq(creatorSkippedRecords.contentItemId, contentItemId),
            isNull(creatorSkippedRecords.restoredAt),
          ),
    );

  await emitDataChange({
    eventType: 'manual_update',
    domains: ['opportunities', 'discoveries', 'recommendations', 'home_briefing'],
    completedAt: now.toISOString(),
    source: 'restore_skip',
    recordIds: [contentItemId],
    success: true,
  });
}

export async function listSkippedHistory(limit = 50) {
  const rows = await db
    .select()
    .from(creatorSkippedRecords)
    .orderBy(desc(creatorSkippedRecords.skippedAt))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    contentItemId: row.contentItemId,
    occurrenceFingerprint: row.occurrenceFingerprint,
    skippedAt: row.skippedAt.toISOString(),
    sourceScreen: row.sourceScreen,
    snoozeUntil: row.snoozeUntil?.toISOString() ?? null,
    restoredAt: row.restoredAt?.toISOString() ?? null,
  }));
}

export * from './fingerprint.js';
