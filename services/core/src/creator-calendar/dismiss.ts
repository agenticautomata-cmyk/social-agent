import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { calendarDismissalFeedback, creatorCalendarItems, type CreatorCalendarItem } from '../schema.js';
import { computeOccurrenceFingerprint, computeSkipMatchIdentity } from '../creator-skip/fingerprint.js';

function skipKeyForItem(item: CreatorCalendarItem): string | null {
  return (
    computeSkipMatchIdentity({
      title: item.title,
      eventDate: item.startAt.toISOString(),
      locationName: item.location,
      venue: item.location,
    })?.key ?? null
  );
}

function fingerprintsForItem(item: CreatorCalendarItem): string[] {
  const meta = (item.metadata ?? {}) as Record<string, unknown>;
  const skipMeta = typeof meta.skipKey === 'string' ? meta.skipKey : null;
  const computed =
    item.occurrenceFingerprint ??
    computeOccurrenceFingerprint({
      title: item.title,
      eventDate: item.startAt.toISOString(),
      locationName: item.location,
      venue: item.location,
      sourceUrl: item.sourceUrl,
    });
  return [...new Set([computed, item.idempotencyKey, skipMeta, skipKeyForItem(item)].filter(Boolean) as string[])];
}

export async function recordCalendarDismissal(
  item: CreatorCalendarItem,
  reason = 'not_interested',
): Promise<void> {
  const fingerprints = fingerprintsForItem(item);
  if (fingerprints.length === 0) return;
  const existing = await db
    .select({ fp: calendarDismissalFeedback.occurrenceFingerprint })
    .from(calendarDismissalFeedback)
    .where(eq(calendarDismissalFeedback.calendarItemId, item.id));
  const have = new Set(existing.map((row) => row.fp));
  const rows = fingerprints
    .filter((fp) => !have.has(fp))
    .map((fp) => ({
      calendarItemId: item.id,
      sourceRecordType: item.sourceRecordType,
      sourceRecordId: item.sourceRecordId,
      occurrenceFingerprint: fp,
      calendarIntent: item.calendarIntent,
      dismissReason: reason,
      planningStatusBefore: item.planningStatus,
    }));
  if (rows.length === 0) return;
  await db.insert(calendarDismissalFeedback).values(rows);
}

export async function recordCalendarDismissalById(
  id: string,
  reason = 'not_interested',
): Promise<void> {
  const rows = await db
    .select()
    .from(creatorCalendarItems)
    .where(eq(creatorCalendarItems.id, id))
    .limit(1);
  const item = rows[0];
  if (!item) return;
  await recordCalendarDismissal(item, reason);
}
