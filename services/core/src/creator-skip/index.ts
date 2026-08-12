import { and, desc, eq, gt, inArray, isNull, or } from 'drizzle-orm';
import { db } from '../db.js';
import { contentItems, creatorSkippedRecords } from '../schema.js';
import { emitDataChange } from '../data-revision/index.js';
import {
  computeOccurrenceFingerprint,
  computeSkipMatchIdentity,
  fingerprintFromInventoryItem,
  skipIdentitiesMatch,
  type SkipMatchIdentity,
} from './fingerprint.js';
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

export function resolveSkipIdentityKey(input: {
  title: string;
  eventDate?: string | null;
  eventEndDate?: string | null;
  locationName?: string | null;
  formattedAddress?: string | null;
  venue?: string | null;
  sourceUrl?: string | null;
  summary?: string | null;
}): string {
  const identity = computeSkipMatchIdentity(input);
  if (identity) return identity.key;
  return `fp:${computeOccurrenceFingerprint({
    title: input.title,
    eventDate: input.eventDate,
    eventEndDate: input.eventEndDate,
    locationName: input.locationName,
    formattedAddress: input.formattedAddress,
    sourceUrl: input.sourceUrl,
    summary: input.summary,
  })}`;
}

export async function skipDiscoveryRecord(options: {
  contentItemId: string;
  sourceScreen: SkipSourceScreen;
  snoozeUntil?: Date | null;
  snoozePreset?: SnoozePreset;
  occurrenceFingerprint?: string;
}): Promise<{ ok: true; fingerprint: string; skipIdentityKey: string; skippedAt: string }> {
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

  const skipIdentity = computeSkipMatchIdentity({
    title: item.topic,
    eventDate: item.eventStartsAt?.toISOString() ?? null,
    locationName: item.locationName,
    formattedAddress: item.formattedAddress,
    venue: item.locationName,
  });
  const skipIdentityKey = skipIdentity?.key ?? resolveSkipIdentityKey({
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
        eq(creatorSkippedRecords.skipIdentityKey, skipIdentityKey),
        isNull(creatorSkippedRecords.restoredAt),
      ),
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(creatorSkippedRecords)
      .set({
        contentItemId: options.contentItemId,
        occurrenceFingerprint: fingerprint,
        skippedAt: now,
        sourceScreen: options.sourceScreen,
        snoozeUntil: snoozeUntil ?? null,
        updatedAt: now,
      })
      .where(eq(creatorSkippedRecords.id, existing[0].id));
  } else {
    await db.insert(creatorSkippedRecords).values({
      contentItemId: options.contentItemId,
      skipIdentityKey,
      occurrenceFingerprint: fingerprint,
      skippedAt: now,
      sourceScreen: options.sourceScreen,
      snoozeUntil: snoozeUntil ?? null,
      metadata: { skipIdentityKey, skipMatchIdentity: skipIdentity, title: item.topic },
    });
  }

  await emitDataChange({
    eventType: 'skip',
    domains: ['opportunities', 'discoveries', 'recommendations', 'home_briefing'],
    completedAt: now.toISOString(),
    source: options.sourceScreen,
    recordIds: [options.contentItemId],
    success: true,
    metadata: { fingerprint, skipIdentityKey, snoozeUntil: snoozeUntil?.toISOString() ?? null },
  });

  return { ok: true, fingerprint, skipIdentityKey, skippedAt: now.toISOString() };
}

export async function loadActiveSkippedRecords(): Promise<
  Array<{
    contentItemId: string | null;
    skipIdentityKey: string | null;
    occurrenceFingerprint: string;
    snoozeUntil: Date | null;
  }>
> {
  const now = new Date();
  const rows = await db
    .select({
      contentItemId: creatorSkippedRecords.contentItemId,
      skipIdentityKey: creatorSkippedRecords.skipIdentityKey,
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

export type SkipMatchers = {
  contentItemIds: Set<string>;
  skipIdentityKeys: Set<string>;
  fingerprints: Set<string>;
  identities: SkipMatchIdentity[];
};

export async function loadSkipMatchers(): Promise<SkipMatchers> {
  const now = new Date();
  const rows = await db
    .select({
      contentItemId: creatorSkippedRecords.contentItemId,
      skipIdentityKey: creatorSkippedRecords.skipIdentityKey,
      occurrenceFingerprint: creatorSkippedRecords.occurrenceFingerprint,
      topic: contentItems.topic,
      eventStartsAt: contentItems.eventStartsAt,
      locationName: contentItems.locationName,
      formattedAddress: contentItems.formattedAddress,
      metadata: creatorSkippedRecords.metadata,
    })
    .from(creatorSkippedRecords)
    .leftJoin(contentItems, eq(contentItems.id, creatorSkippedRecords.contentItemId))
    .where(
      and(
        isNull(creatorSkippedRecords.restoredAt),
        or(isNull(creatorSkippedRecords.snoozeUntil), gt(creatorSkippedRecords.snoozeUntil, now)),
      ),
    );

  const matchers: SkipMatchers = {
    contentItemIds: new Set(),
    skipIdentityKeys: new Set(),
    fingerprints: new Set(),
    identities: [],
  };

  const seenKeys = new Set<string>();
  for (const row of rows) {
    if (row.contentItemId) matchers.contentItemIds.add(row.contentItemId);
    matchers.fingerprints.add(row.occurrenceFingerprint);
    if (row.skipIdentityKey) matchers.skipIdentityKeys.add(row.skipIdentityKey);

    const title = row.topic ?? (row.metadata as { title?: string } | null)?.title;
    const eventDate = row.eventStartsAt?.toISOString() ?? null;
    const locationName = row.locationName;
    const formattedAddress = row.formattedAddress;

    const meta = (row.metadata ?? {}) as {
      skipMatchIdentity?: SkipMatchIdentity;
      title?: string;
    };
    const metaIdentity = meta.skipMatchIdentity;
    if (metaIdentity && !seenKeys.has(metaIdentity.key)) {
      seenKeys.add(metaIdentity.key);
      matchers.identities.push(metaIdentity);
      matchers.skipIdentityKeys.add(metaIdentity.key);
    }

    if (title) {
      const identity = computeSkipMatchIdentity({
        title,
        eventDate,
        locationName,
        formattedAddress,
        venue: locationName,
      });
      if (identity && !seenKeys.has(identity.key)) {
        seenKeys.add(identity.key);
        matchers.identities.push(identity);
        matchers.skipIdentityKeys.add(identity.key);
      }
    } else if (row.skipIdentityKey) {
      matchers.skipIdentityKeys.add(row.skipIdentityKey);
    }
  }

  return matchers;
}

export function isSkippedByMatchers(
  matchers: SkipMatchers,
  item: {
    id: string;
    title: string;
    eventDate?: string | null;
    eventEndDate?: string | null;
    locationName?: string | null;
    formattedAddress?: string | null;
    venue?: string | null;
    sourceUrl?: string | null;
    summary?: string | null;
  },
): boolean {
  if (matchers.contentItemIds.has(item.id)) return true;

  const identity = computeSkipMatchIdentity(item);
  if (identity && matchers.skipIdentityKeys.has(identity.key)) return true;

  const fallbackKey = resolveSkipIdentityKey(item);
  if (matchers.skipIdentityKeys.has(fallbackKey)) return true;

  if (matchers.fingerprints.has(fingerprintFromInventoryItem(item as InventoryItem))) return true;

  if (identity && matchers.identities.length > 0) {
    return matchers.identities.some((skipped) => skipIdentitiesMatch(skipped, identity));
  }

  return false;
}

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
  const matchers = await loadSkipMatchers();
  if (
    matchers.contentItemIds.size === 0 &&
    matchers.fingerprints.size === 0 &&
    matchers.identities.length === 0 &&
    matchers.skipIdentityKeys.size === 0
  ) {
    return new Set();
  }

  const hidden = new Set<string>();
  for (const item of items) {
    if (isSkippedByMatchers(matchers, item)) hidden.add(item.id);
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
        : and(eq(creatorSkippedRecords.contentItemId, contentItemId), isNull(creatorSkippedRecords.restoredAt)),
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

export async function restoreSkippedByIdentityKey(skipIdentityKey: string): Promise<void> {
  const now = new Date();
  await db
    .update(creatorSkippedRecords)
    .set({ restoredAt: now, updatedAt: now })
    .where(
      and(eq(creatorSkippedRecords.skipIdentityKey, skipIdentityKey), isNull(creatorSkippedRecords.restoredAt)),
    );

  await emitDataChange({
    eventType: 'manual_update',
    domains: ['opportunities', 'discoveries', 'recommendations', 'home_briefing'],
    completedAt: now.toISOString(),
    source: 'restore_skip',
    recordIds: [],
    success: true,
    metadata: { skipIdentityKey },
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
    skipIdentityKey: row.skipIdentityKey,
    occurrenceFingerprint: row.occurrenceFingerprint,
    skippedAt: row.skippedAt.toISOString(),
    sourceScreen: row.sourceScreen,
    snoozeUntil: row.snoozeUntil?.toISOString() ?? null,
    restoredAt: row.restoredAt?.toISOString() ?? null,
  }));
}

export * from './fingerprint.js';
