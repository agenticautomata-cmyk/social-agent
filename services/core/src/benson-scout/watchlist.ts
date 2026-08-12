import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../db.js';
import {
  scoutItems,
  scoutSourceRuns,
  sourceWatchers,
  type SourceWatcher,
} from '../schema.js';
import { inspectSubmittedUrl, watcherFingerprint } from './url-inspect.js';
import type { MonitoringMode, UrlInspectResult, WatchlistCard } from './types.js';
import { assertScoutUrlAllowed } from './ssrf.js';
import { canonicalizeWatchSource } from './canonical-source.js';

const HOURS_TO_MS = 3_600_000;

function cardFromRow(row: SourceWatcher, stats?: { qualified: number; hidden: number }): WatchlistCard {
  const freqH = Math.round(row.checkFrequencyMs / HOURS_TO_MS);
  const next =
    row.lastSuccessfulCheck && row.enabled && !row.paused
      ? new Date(row.lastSuccessfulCheck.getTime() + row.checkFrequencyMs).toISOString()
      : null;
  const config = row.config as Record<string, unknown>;
  return {
    id: row.id,
    sourceName: row.sourceName,
    sourceUrl: row.sourceUrl,
    platform: (row.platform as string) ?? (config.platform as string) ?? 'web',
    monitoringMode: ((row.monitoringMode as MonitoringMode) ?? 'WATCH_PAGE') as MonitoringMode,
    enabled: row.enabled,
    paused: row.paused ?? false,
    healthStatus: row.healthStatus,
    sessionStatus: (row.sessionStatus as string) ?? null,
    lastSuccessfulCheck: row.lastSuccessfulCheck?.toISOString() ?? null,
    lastNewItemDetected: row.lastNewItemDetected?.toISOString() ?? null,
    latestContentDate: row.latestContentDate?.toISOString() ?? null,
    qualifiedThisWeek: stats?.qualified ?? 0,
    hiddenNoise: stats?.hidden ?? 0,
    fetchMethod: (config.lastFetchMethod as string) ?? null,
    nextCheckEstimate: next,
    canonicalKey: row.canonicalKey ?? null,
  };
}

export async function listWatchlist(): Promise<WatchlistCard[]> {
  const rows = await db
    .select()
    .from(sourceWatchers)
    .orderBy(desc(sourceWatchers.updatedAt))
    .limit(200);
  return rows.map((r) => cardFromRow(r));
}

export async function getWatchlistItem(id: string): Promise<WatchlistCard | null> {
  const [row] = await db.select().from(sourceWatchers).where(eq(sourceWatchers.id, id)).limit(1);
  return row ? cardFromRow(row) : null;
}

/**
 * Look up a watch source by its stable real-world identity (see canonical-source.ts).
 * A "SINGLE_ITEM" mode source (one specific post/page, not an account/feed) is deliberately
 * excluded from canonical-key matching — those are meant to be processed once, not merged
 * with an account-level watch of the same publisher.
 */
export async function findWatchSourceByCanonicalKey(canonicalKey: string): Promise<WatchlistCard | null> {
  const [row] = await db
    .select()
    .from(sourceWatchers)
    .where(eq(sourceWatchers.canonicalKey, canonicalKey))
    .limit(1);
  return row ? cardFromRow(row) : null;
}

export async function createWatchedSource(input: {
  url: string;
  monitoringMode: MonitoringMode;
  sourceName?: string;
  processOnly?: boolean;
}): Promise<{ watcher: WatchlistCard; inspect: UrlInspectResult; alreadyWatching: boolean }> {
  await assertScoutUrlAllowed(input.url);
  const inspect = inspectSubmittedUrl(input.url);
  const mode = input.processOnly ? 'SINGLE_ITEM' : input.monitoringMode;
  const adapterType =
    inspect.platform === 'rss'
      ? 'rss_feed'
      : inspect.platform === 'instagram'
        ? 'social_account'
        : inspect.platform === 'pdf'
          ? 'document'
          : 'html_watch';

  const checkFrequencyMs =
    inspect.checkFrequencyHours * HOURS_TO_MS;

  const sourceName = input.sourceName?.trim() || inspect.titleGuess;
  const sourceUrl =
    mode === 'SINGLE_ITEM' ? inspect.canonicalUrl : inspect.publisherUrl ?? inspect.canonicalUrl;

  // One-off "process this single post/page" requests are not account-level watches —
  // don't let them collide with (or block) an existing account watch of the same publisher.
  const canonical = mode === 'SINGLE_ITEM' ? null : canonicalizeWatchSource(sourceUrl);

  if (canonical) {
    const existing = await findWatchSourceByCanonicalKey(canonical.key);
    if (existing) {
      return { watcher: existing, inspect, alreadyWatching: true };
    }
  }

  const insertValues = {
    sourceName,
    sourceUrl,
    submittedUrl: inspect.submittedUrl,
    canonicalSourceUrl: inspect.canonicalUrl,
    publisherUrl: inspect.publisherUrl,
    platform: inspect.platform,
    sourceCategory: inspect.sourceType,
    adapterType,
    monitoringMode: mode,
    approvalStatus: 'approved',
    checkFrequencyMs,
    authenticationRequired: inspect.loginRequired,
    sessionStatus: inspect.loginRequired ? 'login_required' : 'none',
    enabled: true,
    paused: inspect.loginRequired && mode !== 'SINGLE_ITEM',
    healthStatus: inspect.loginRequired ? 'login_required' : 'pending',
    sourceReliability: String(inspect.sourceReliability),
    creatorLeadPotential: String(inspect.creatorLeadPotential),
    canonicalKey: canonical?.key ?? null,
    config: {
      platform: inspect.platform,
      extractionMethod: inspect.extractionMethod,
      fingerprint: watcherFingerprint(sourceUrl, mode),
    },
    createdBy: 'creator',
  };

  // Guard against a concurrent request creating the same canonical source between our
  // lookup above and this insert — the unique index is the real source of truth.
  const inserted = canonical
    ? await db.insert(sourceWatchers).values(insertValues).onConflictDoNothing({ target: sourceWatchers.canonicalKey }).returning()
    : await db.insert(sourceWatchers).values(insertValues).returning();

  let row = inserted[0];
  let alreadyWatching = false;
  if (!row && canonical) {
    const existing = await findWatchSourceByCanonicalKey(canonical.key);
    if (existing) {
      return { watcher: existing, inspect, alreadyWatching: true };
    }
  }
  if (!row) throw new Error('Failed to create watch source');

  const { emitDataChange } = await import('../data-revision/index.js');
  await emitDataChange({
    eventType: 'manual_update',
    domains: ['scout', 'early_signals'],
    completedAt: new Date().toISOString(),
    source: 'watchlist-create',
    recordIds: [row.id],
    success: true,
  });

  return { watcher: cardFromRow(row), inspect, alreadyWatching };
}

export async function pauseWatchlistSource(id: string, paused: boolean): Promise<boolean> {
  const [row] = await db
    .update(sourceWatchers)
    .set({ paused, updatedAt: new Date() })
    .where(eq(sourceWatchers.id, id))
    .returning();
  return Boolean(row);
}

export async function deleteWatchlistSource(id: string): Promise<boolean> {
  const [row] = await db.delete(sourceWatchers).where(eq(sourceWatchers.id, id)).returning();
  return Boolean(row);
}

export async function listWatcherRuns(watcherId: string, limit = 10) {
  const rows = await db
    .select()
    .from(scoutSourceRuns)
    .where(eq(scoutSourceRuns.watcherId, watcherId))
    .orderBy(desc(scoutSourceRuns.completedAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    triggerType: r.triggerType,
    startedAt: r.startedAt?.toISOString() ?? null,
    completedAt: r.completedAt?.toISOString() ?? null,
    finalFetchMethod: r.finalFetchMethod,
    itemCount: r.itemCount,
    newCount: r.newCount,
    hiddenCount: r.hiddenCount,
    qualifiedCount: r.qualifiedCount,
    failureCategory: r.failureCategory,
    sanitizedFailure: r.sanitizedFailure,
  }));
}

export async function listScoutItemsForWatcher(watcherId: string) {
  return db
    .select()
    .from(scoutItems)
    .where(eq(scoutItems.watcherId, watcherId))
    .orderBy(desc(scoutItems.detectedAt))
    .limit(100);
}

export async function recordSourceRun(input: {
  watcherId: string;
  triggerType: string;
  finalFetchMethod?: string;
  itemCount?: number;
  newCount?: number;
  qualifiedCount?: number;
  hiddenCount?: number;
  sanitizedFailure?: string;
  traceId?: string;
}): Promise<string> {
  const [row] = await db
    .insert(scoutSourceRuns)
    .values({
      watcherId: input.watcherId,
      triggerType: input.triggerType,
      completedAt: new Date(),
      finalFetchMethod: input.finalFetchMethod,
      itemCount: input.itemCount ?? 0,
      newCount: input.newCount ?? 0,
      qualifiedCount: input.qualifiedCount ?? 0,
      hiddenCount: input.hiddenCount ?? 0,
      sanitizedFailure: input.sanitizedFailure,
      traceId: input.traceId,
    })
    .returning({ id: scoutSourceRuns.id });
  return row!.id;
}

export async function scoutHealthSummary() {
  const [watchers] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(sourceWatchers);
  const [enabled] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(sourceWatchers)
    .where(and(eq(sourceWatchers.enabled, true), eq(sourceWatchers.paused, false)));
  const [failed] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(sourceWatchers)
    .where(eq(sourceWatchers.healthStatus, 'failed'));
  const [login] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(sourceWatchers)
    .where(eq(sourceWatchers.sessionStatus, 'login_required'));
  return {
    totalWatchers: Number(watchers?.count ?? 0),
    activeWatchers: Number(enabled?.count ?? 0),
    failedWatchers: Number(failed?.count ?? 0),
    loginRequired: Number(login?.count ?? 0),
  };
}
