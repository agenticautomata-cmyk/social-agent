import { desc, eq, sql } from 'drizzle-orm';
import { db } from '../db.js';
import {
  contentItems,
  scanRuns,
  sourceIngestionRuns,
  sources,
  type Source,
} from '../schema.js';
import { freshnessBucket } from '../scanner/ingest-persist.js';
import { SOURCE_TYPE_META, resolveFeedUrl, type SourceMeta } from './source-meta.js';
import { getSourceMutePolicy, withSourceMutePolicy, type SourceMutePolicy } from './mute-policy.js';
import { countDurableItemsBySource } from './source-items.js';

export type FreshnessStatus = 'fresh' | 'stale' | 'never_run' | 'error' | 'disabled';

export type SourceRegistryEntry = {
  id: string;
  sourceId: string;
  sourceName: string;
  sourceType: Source['type'];
  feedUrl: string | null;
  category: string;
  pillar: string;
  enabled: boolean;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  itemCountLastRun: number | null;
  /** Durable content_items currently linked to this source (strict sourceId). */
  durableItemCount: number;
  freshnessStatus: FreshnessStatus;
  mutePolicy: SourceMutePolicy;
};

function computeFreshness(
  source: Source,
  lastSuccessAt: Date | null,
  lastError: string | null,
): FreshnessStatus {
  if (!source.active) return 'disabled';
  if (lastError && !lastSuccessAt) return 'error';
  if (!lastSuccessAt) return 'never_run';
  const bucket = freshnessBucket(lastSuccessAt);
  if (bucket === 'stale' || source.lastError) return 'stale';
  return 'fresh';
}

export async function listSourceRegistry(): Promise<SourceRegistryEntry[]> {
  const rows = await db.select().from(sources).orderBy(sources.name);
  const durableCounts = await countDurableItemsBySource();

  const entries: SourceRegistryEntry[] = [];
  for (const source of rows) {
    const config = (source.config ?? {}) as Record<string, unknown>;
    const meta: SourceMeta = SOURCE_TYPE_META[source.type] ?? {
      category: 'general',
      pillar: 'general',
    };

    const [lastIngest] = await db
      .select()
      .from(sourceIngestionRuns)
      .where(eq(sourceIngestionRuns.sourceId, source.id))
      .orderBy(desc(sourceIngestionRuns.startedAt))
      .limit(1);

    const [lastSuccessIngest] = await db
      .select()
      .from(sourceIngestionRuns)
      .where(
        sql`${sourceIngestionRuns.sourceId} = ${source.id} AND ${sourceIngestionRuns.status} IN ('success', 'partial')`,
      )
      .orderBy(desc(sourceIngestionRuns.finishedAt))
      .limit(1);

    const lastScan = source.lastScanAt;
    const lastSuccessAt = lastSuccessIngest?.finishedAt ?? lastScan ?? null;
    const lastRunAt = lastIngest?.startedAt ?? lastScan ?? null;
    const itemCountLastRun =
      lastIngest != null
        ? lastIngest.createdCount + lastIngest.updatedCount + lastIngest.skippedCount
        : null;

    entries.push({
      id: source.id,
      sourceId: source.id,
      sourceName: source.name,
      sourceType: source.type,
      feedUrl: resolveFeedUrl(config, source.type),
      category: meta.category,
      pillar: meta.pillar,
      enabled: source.active,
      lastRunAt: lastRunAt?.toISOString() ?? null,
      lastSuccessAt: lastSuccessAt?.toISOString() ?? null,
      lastError: source.lastError ?? lastIngest?.errorMessage ?? null,
      itemCountLastRun,
      durableItemCount: durableCounts.get(source.id) ?? 0,
      freshnessStatus: computeFreshness(source, lastSuccessAt, source.lastError),
      mutePolicy: getSourceMutePolicy(config),
    });
  }

  return entries;
}

export async function getSourceRegistryEntry(sourceId: string): Promise<SourceRegistryEntry | null> {
  const all = await listSourceRegistry();
  return all.find((e) => e.sourceId === sourceId) ?? null;
}

/**
 * Persists a source-level content policy (e.g. "always_ignore" for routine library
 * programming). Survives future ingestion runs since the scanner reads this from
 * `sources.config` on every item, not just at classification time.
 */
export async function setSourceMutePolicy(
  sourceId: string,
  policy: SourceMutePolicy,
  setBy?: string,
): Promise<Source> {
  const source = await db.query.sources.findFirst({ where: eq(sources.id, sourceId) });
  if (!source) throw new Error(`Source not found: ${sourceId}`);

  const [updated] = await db
    .update(sources)
    .set({ config: withSourceMutePolicy(source.config, policy, setBy), updatedAt: new Date() })
    .where(eq(sources.id, sourceId))
    .returning();

  return updated!;
}

export async function countScannableSources(): Promise<number> {
  const registry = await listSourceRegistry();
  return registry.filter((s) => s.enabled).length;
}

/** Latest scan run stats (legacy scan_runs table). */
export async function getLegacyScanRunCount(sourceId: string): Promise<number> {
  const rows = await db
    .select({ id: scanRuns.id })
    .from(scanRuns)
    .where(eq(scanRuns.sourceId, sourceId));
  return rows.length;
}

export async function countIngestedItemsForSource(sourceId: string): Promise<number> {
  const rows = await db
    .select({ id: contentItems.id })
    .from(contentItems)
    .where(eq(contentItems.sourceId, sourceId));
  return rows.length;
}
