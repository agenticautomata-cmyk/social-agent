import { and, eq } from 'drizzle-orm';
import { db } from '../db.js';
import { contentItems, type NewContentItem } from '../schema.js';
import { sanitizeScrapedText, sanitizeScrapedTitle } from '../text-sanitize/sanitize-scraped-text.js';
import {
  containerChildrenShareIdentity,
  listingUrlsEquivalent,
  type ContainerChildMatchInput,
} from '../ask-benson/container-child-persist.js';

/**
 * Deterministic sanitization boundary — every content item created through the
 * scanner pipeline passes through here regardless of which provider produced it,
 * so HTML entities, CSS/JS leaks, and scraping artifacts never reach storage.
 */
function sanitizeRowText(row: NewContentItem): NewContentItem {
  return {
    ...row,
    topic: row.topic ? sanitizeScrapedTitle(row.topic) : row.topic,
    hook: row.hook ? sanitizeScrapedTitle(row.hook) : row.hook,
    script: row.script ? sanitizeScrapedText(row.script) : row.script,
    locationName: row.locationName ? sanitizeScrapedTitle(row.locationName) : row.locationName,
  };
}

export type IngestPersistOutcome = 'created' | 'updated' | 'skipped';

export type IngestPersistResult = {
  outcome: IngestPersistOutcome;
  contentItemId: string | null;
};

export type PersistIngestedContentItemOpts = {
  sourceUrl?: string | null;
  /**
   * Child rows extracted from an editorial/listing container may all share the
   * hub page as sourceUrl. Exact URL is provenance, not identity.
   */
  sharedHubProvenance?: boolean;
  childMatch?: ContainerChildMatchInput;
};

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

async function findSharedHubChild(
  sourceId: string,
  childMatch: ContainerChildMatchInput,
): Promise<{ id: string } | null> {
  const rows = await db
    .select({
      id: contentItems.id,
      topic: contentItems.topic,
      eventStartsAt: contentItems.eventStartsAt,
      locationName: contentItems.locationName,
      sourceUrl: contentItems.sourceUrl,
      metadata: contentItems.metadata,
      rawPayload: contentItems.rawPayload,
    })
    .from(contentItems)
    .where(eq(contentItems.sourceId, sourceId))
    .limit(400);

  for (const row of rows) {
    const extracted = ((row.rawPayload ?? {}) as Record<string, unknown>).extracted as
      | { eventDate?: string | null }
      | undefined;
    if (
      !containerChildrenShareIdentity(childMatch, {
        topic: row.topic,
        eventStartsAt: row.eventStartsAt,
        eventDate: extracted?.eventDate ?? null,
        locationName: row.locationName,
      })
    ) {
      continue;
    }
    if (childMatch.listingUrl) {
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      const listingHit =
        listingUrlsEquivalent(childMatch.listingUrl, row.sourceUrl) ||
        listingUrlsEquivalent(childMatch.listingUrl, typeof meta.listingSourceUrl === 'string' ? meta.listingSourceUrl : null) ||
        listingUrlsEquivalent(childMatch.listingUrl, typeof meta.parentArticleUrl === 'string' ? meta.parentArticleUrl : null);
      if (!listingHit) continue;
    }
    return { id: row.id };
  }
  return null;
}

export async function persistIngestedContentItemResult(
  sourceId: string,
  externalId: string,
  buildRow: () => NewContentItem,
  opts?: PersistIngestedContentItemOpts,
): Promise<IngestPersistResult> {
  const checkedAt = new Date();
  const existing = await db.query.contentItems.findFirst({
    where: and(
      eq(contentItems.sourceId, sourceId),
      eq(contentItems.sourceExternalId, externalId),
    ),
    columns: { id: true },
  });
  if (existing) {
    await touchExistingItem(existing.id, checkedAt);
    return { outcome: 'updated', contentItemId: existing.id };
  }

  if (opts?.sharedHubProvenance && opts.childMatch) {
    const identityHit = await findSharedHubChild(sourceId, opts.childMatch);
    if (identityHit) {
      await touchExistingItem(identityHit.id, checkedAt);
      return { outcome: 'updated', contentItemId: identityHit.id };
    }
  }

  if (opts?.sourceUrl && !opts.sharedHubProvenance) {
    const urlDup = await db.query.contentItems.findFirst({
      where: eq(contentItems.sourceUrl, opts.sourceUrl),
      columns: { id: true },
    });
    if (urlDup) {
      await touchExistingItem(urlDup.id, checkedAt);
      return { outcome: 'updated', contentItemId: urlDup.id };
    }
  }

  if (dryRunMode) return { outcome: 'created', contentItemId: null };

  const row = sanitizeRowText(buildRow());
  const now = checkedAt;
  const [inserted] = await db
    .insert(contentItems)
    .values({
      ...row,
      firstSeenAt: now,
      lastSeenAt: now,
      sourceLastCheckedAt: now,
      stale: false,
      freshnessBucket: freshnessBucket(now),
      discoveredAt: row.discoveredAt ?? now,
    })
    .returning({ id: contentItems.id });

  return { outcome: 'created', contentItemId: inserted?.id ?? null };
}

export async function persistIngestedContentItem(
  sourceId: string,
  externalId: string,
  buildRow: () => NewContentItem,
  opts?: PersistIngestedContentItemOpts,
): Promise<IngestPersistOutcome> {
  const result = await persistIngestedContentItemResult(sourceId, externalId, buildRow, opts);
  return result.outcome;
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
