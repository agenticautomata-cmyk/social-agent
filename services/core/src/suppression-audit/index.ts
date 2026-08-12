import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db.js';
import {
  contentItems,
  creatorCalendarItems,
  creatorSkippedRecords,
  entitySuppressions,
  sources,
  urlIntakeQuarantine,
} from '../schema.js';
import { restoreSkippedByIdentityKey, restoreSkippedRecord } from '../creator-skip/index.js';
import { restoreEntitySuppression } from '../creator-agent/entity-suppression.js';
import { updateCalendarItem } from '../creator-calendar/items.js';
import { getSourceMutePolicy } from '../source-ingestion/mute-policy.js';
import { setSourceMutePolicy } from '../source-ingestion/registry.js';

export type SuppressionCategory =
  | 'skipped_occurrence'
  | 'dismissed_calendar_item'
  | 'muted_source'
  | 'business_suppression'
  | 'quarantined_intake';

export type SuppressionRow = {
  id: string;
  category: SuppressionCategory;
  categoryLabel: string;
  title: string;
  detail: string | null;
  reason: string | null;
  actor: string | null;
  timestamp: string | null;
  source: string | null;
  scope: 'temporary' | 'occurrence' | 'source' | 'business' | 'category';
  restorable: boolean;
};

const CATEGORY_LABEL: Record<SuppressionCategory, string> = {
  skipped_occurrence: 'Skipped / dismissed occurrence',
  dismissed_calendar_item: 'Dismissed calendar suggestion',
  muted_source: 'Muted source',
  business_suppression: 'Business suppression',
  quarantined_intake: 'Quarantined intake (never surfaced)',
};

/** Aggregates every "hidden by Benson" record across skip, dismiss, mute, and suppression tables. */
export async function listHiddenByBenson(limit = 100): Promise<SuppressionRow[]> {
  const [skipped, dismissed, muted, businesses, quarantined] = await Promise.all([
    listSkippedOccurrences(limit),
    listDismissedCalendarItems(limit),
    listMutedSources(),
    listBusinessSuppressions(limit),
    listQuarantinedIntake(limit),
  ]);

  return [...skipped, ...dismissed, ...muted, ...businesses, ...quarantined].sort((a, b) => {
    const at = a.timestamp ? Date.parse(a.timestamp) : 0;
    const bt = b.timestamp ? Date.parse(b.timestamp) : 0;
    return bt - at;
  });
}

async function listSkippedOccurrences(limit: number): Promise<SuppressionRow[]> {
  const rows = await db
    .select({
      id: creatorSkippedRecords.id,
      contentItemId: creatorSkippedRecords.contentItemId,
      occurrenceFingerprint: creatorSkippedRecords.occurrenceFingerprint,
      skippedAt: creatorSkippedRecords.skippedAt,
      sourceScreen: creatorSkippedRecords.sourceScreen,
      snoozeUntil: creatorSkippedRecords.snoozeUntil,
      topic: contentItems.topic,
      eventStartsAt: contentItems.eventStartsAt,
      locationName: contentItems.locationName,
      sourceUrl: contentItems.sourceUrl,
    })
    .from(creatorSkippedRecords)
    .leftJoin(contentItems, eq(contentItems.id, creatorSkippedRecords.contentItemId))
    .where(isNull(creatorSkippedRecords.restoredAt))
    .orderBy(desc(creatorSkippedRecords.skippedAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    category: 'skipped_occurrence' as const,
    categoryLabel: CATEGORY_LABEL.skipped_occurrence,
    title: row.topic ?? '(content item removed)',
    detail: [
      row.eventStartsAt ? new Date(row.eventStartsAt).toLocaleDateString() : null,
      row.locationName,
    ]
      .filter(Boolean)
      .join(' · ') || null,
    reason: row.snoozeUntil ? `Snoozed until ${new Date(row.snoozeUntil).toLocaleString()}` : 'Skipped',
    actor: row.sourceScreen,
    timestamp: row.skippedAt?.toISOString() ?? null,
    source: row.sourceUrl,
    scope: 'occurrence',
    restorable: true,
  }));
}

async function listDismissedCalendarItems(limit: number): Promise<SuppressionRow[]> {
  const rows = await db
    .select({
      id: creatorCalendarItems.id,
      title: creatorCalendarItems.title,
      dismissReason: creatorCalendarItems.dismissReason,
      dismissedAt: creatorCalendarItems.dismissedAt,
      sourceUrl: creatorCalendarItems.sourceUrl,
      startAt: creatorCalendarItems.startAt,
      location: creatorCalendarItems.location,
    })
    .from(creatorCalendarItems)
    .where(eq(creatorCalendarItems.planningStatus, 'dismissed'))
    .orderBy(desc(creatorCalendarItems.dismissedAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    category: 'dismissed_calendar_item' as const,
    categoryLabel: CATEGORY_LABEL.dismissed_calendar_item,
    title: row.title,
    detail: [row.startAt ? new Date(row.startAt).toLocaleDateString() : null, row.location].filter(Boolean).join(' · ') || null,
    reason: row.dismissReason,
    actor: 'creator',
    timestamp: row.dismissedAt?.toISOString() ?? null,
    source: row.sourceUrl,
    scope: 'occurrence',
    restorable: true,
  }));
}

async function listMutedSources(): Promise<SuppressionRow[]> {
  const rows = await db.select().from(sources).where(eq(sources.active, true));
  const muted = rows.filter((row) => getSourceMutePolicy(row.config) === 'always_ignore');
  return muted.map((row) => {
    const config = (row.config as Record<string, unknown>) ?? {};
    return {
      id: row.id,
      category: 'muted_source' as const,
      categoryLabel: CATEGORY_LABEL.muted_source,
      title: row.name,
      detail: row.type,
      reason: 'Source policy: always ignore (ordinary items suppressed; major exceptions still surface)',
      actor: typeof config.mutePolicySetBy === 'string' ? config.mutePolicySetBy : null,
      timestamp: typeof config.mutePolicyUpdatedAt === 'string' ? config.mutePolicyUpdatedAt : null,
      source: null,
      scope: 'source',
      restorable: true,
    };
  });
}

async function listBusinessSuppressions(limit: number): Promise<SuppressionRow[]> {
  const rows = await db
    .select()
    .from(entitySuppressions)
    .where(isNull(entitySuppressions.restoredAt))
    .orderBy(desc(entitySuppressions.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    category: 'business_suppression' as const,
    categoryLabel: CATEGORY_LABEL.business_suppression,
    title: row.canonicalName,
    detail: row.aliases?.length ? `Aliases: ${row.aliases.join(', ')}` : null,
    reason: row.suppressionReason,
    actor: row.createdBy,
    timestamp: row.createdAt?.toISOString() ?? null,
    source: null,
    scope: row.suppressionScope === 'suppress_everywhere' ? 'category' : 'business',
    restorable: true,
  }));
}

async function listQuarantinedIntake(limit: number): Promise<SuppressionRow[]> {
  const rows = await db
    .select()
    .from(urlIntakeQuarantine)
    .orderBy(desc(urlIntakeQuarantine.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    category: 'quarantined_intake' as const,
    categoryLabel: CATEGORY_LABEL.quarantined_intake,
    title: row.extractedTitle ?? row.entityName ?? row.sourceUrl,
    detail: row.extractedLocation,
    reason: row.rejectionReason,
    actor: 'system',
    timestamp: row.createdAt?.toISOString() ?? null,
    source: row.sourceUrl,
    scope: 'occurrence',
    restorable: false,
  }));
}

export async function restoreHiddenByBenson(
  category: SuppressionCategory,
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  switch (category) {
    case 'skipped_occurrence': {
      const [row] = await db
        .select({
          contentItemId: creatorSkippedRecords.contentItemId,
          skipIdentityKey: creatorSkippedRecords.skipIdentityKey,
        })
        .from(creatorSkippedRecords)
        .where(eq(creatorSkippedRecords.id, id))
        .limit(1);
      if (!row) return { ok: false, error: 'Skip record not found' };
      if (row.contentItemId) {
        await restoreSkippedRecord(row.contentItemId);
      } else if (row.skipIdentityKey) {
        await restoreSkippedByIdentityKey(row.skipIdentityKey);
      } else {
        return { ok: false, error: 'Skip record has no restorable identity' };
      }
      return { ok: true };
    }
    case 'dismissed_calendar_item': {
      const updated = await updateCalendarItem(id, { planningStatus: 'tentative' });
      return updated ? { ok: true } : { ok: false, error: 'Calendar item not found' };
    }
    case 'muted_source': {
      await setSourceMutePolicy(id, 'none', 'dashboard_restore');
      return { ok: true };
    }
    case 'business_suppression': {
      await restoreEntitySuppression(id);
      return { ok: true };
    }
    case 'quarantined_intake':
      return { ok: false, error: 'Quarantined intake was never surfaced — nothing to restore' };
    default:
      return { ok: false, error: 'Unknown suppression category' };
  }
}

export async function countHiddenByBenson(): Promise<Record<SuppressionCategory, number>> {
  const [skipped] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(creatorSkippedRecords)
    .where(isNull(creatorSkippedRecords.restoredAt));
  const [dismissed] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(creatorCalendarItems)
    .where(eq(creatorCalendarItems.planningStatus, 'dismissed'));
  const [businesses] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(entitySuppressions)
    .where(isNull(entitySuppressions.restoredAt));
  const [quarantined] = await db.select({ count: sql<number>`count(*)::int` }).from(urlIntakeQuarantine);
  const mutedSources = await listMutedSources();

  return {
    skipped_occurrence: skipped?.count ?? 0,
    dismissed_calendar_item: dismissed?.count ?? 0,
    muted_source: mutedSources.length,
    business_suppression: businesses?.count ?? 0,
    quarantined_intake: quarantined?.count ?? 0,
  };
}
