import { and, eq } from 'drizzle-orm';
import { db } from '../db.js';
import { contentItems, type NewContentItem } from '../schema.js';

export type IngestPersistOutcome = 'created' | 'updated' | 'skipped';

let dryRunMode = false;

export function setIngestDryRun(enabled: boolean): void {
  dryRunMode = enabled;
}

export function isIngestDryRun(): boolean {
  return dryRunMode;
}

export function freshnessBucket(checkedAt: Date): string {
  const ageMs = Date.now() - checkedAt.getTime();
  const hours = ageMs / (1000 * 60 * 60);
  if (hours < 6) return 'fresh';
  if (hours < 24) return 'today';
  if (hours < 72) return 'recent';
  if (hours < 168) return 'aging';
  return 'stale';
}

async function touchExistingItem(itemId: string, checkedAt: Date): Promise<void> {
  if (dryRunMode) return;
  const bucket = freshnessBucket(checkedAt);
  await db
    .update(contentItems)
    .set({
      lastSeenAt: checkedAt,
      sourceLastCheckedAt: checkedAt,
      stale: false,
      freshnessBucket: bucket,
    })
    .where(eq(contentItems.id, itemId));
}

export async function persistIngestedContentItem(
  sourceId: string,
  externalId: string,
  buildRow: () => NewContentItem,
  opts?: { sourceUrl?: string | null },
): Promise<IngestPersistOutcome> {
  const checkedAt = new Date();
  const existing = await db.query.contentItems.findFirst({
    where: and(
      eq(contentItems.sourceId, sourceId),
      eq(contentItems.sourceExternalId, externalId),
    ),
  });
  if (existing) {
    await touchExistingItem(existing.id, checkedAt);
    return 'updated';
  }

  if (opts?.sourceUrl) {
    const urlDup = await db.query.contentItems.findFirst({
      where: eq(contentItems.sourceUrl, opts.sourceUrl),
    });
    if (urlDup) {
      await touchExistingItem(urlDup.id, checkedAt);
      return 'updated';
    }
  }

  if (dryRunMode) return 'created';

  const row = buildRow();
  const now = checkedAt;
  await db.insert(contentItems).values({
    ...row,
    firstSeenAt: now,
    lastSeenAt: now,
    sourceLastCheckedAt: now,
    stale: false,
    freshnessBucket: freshnessBucket(now),
    discoveredAt: row.discoveredAt ?? now,
  });
  return 'created';
}

export async function markExistingIngestItem(itemId: string): Promise<IngestPersistOutcome> {
  await touchExistingItem(itemId, new Date());
  return 'updated';
}

export type IngestCountBucket = { created: number; updated: number; skipped: number };

export function tallyIngestOutcome(outcome: IngestPersistOutcome, counts: IngestCountBucket): void {
  if (outcome === 'created') counts.created += 1;
  else if (outcome === 'updated') counts.updated += 1;
  else counts.skipped += 1;
}
