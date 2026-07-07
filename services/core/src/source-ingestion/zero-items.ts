import { desc, eq, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { contentItems, sourceIngestionRuns, sources } from '../schema.js';
export type ZeroItemSourceRow = {
  sourceId: string;
  sourceName: string;
  sourceType: string;
  enabled: boolean;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  itemCount: number;
  lastError: string | null;
  reason: string;
};

function zeroItemReason(
  source: { type: string; active: boolean; lastError: string | null },
  lastStatus: string | null,
  itemCount: number,
): string {
  if (!source.active) return 'Source is disabled in the registry.';
  if (source.type === 'manual') return 'Manual intake source — not scanned by KC feeds.';
  if (source.lastError) return 'Last refresh reported an error.';
  if (lastStatus === 'failed') return 'Last ingestion run failed.';
  if (lastStatus === 'success' && itemCount === 0) {
    return 'Feed scanned successfully but no items matched ingest rules on the last run.';
  }
  if (lastStatus === 'partial') return 'Last run was partial — some items may have been skipped.';
  return 'No items stored yet — run a source refresh after seeding.';
}

export async function listZeroItemSources(): Promise<ZeroItemSourceRow[]> {
  const registry = await db.select().from(sources).orderBy(sources.name);
  const counts = await db
    .select({
      sourceId: contentItems.sourceId,
      count: sql<number>`count(*)::int`,
    })
    .from(contentItems)
    .where(sql`${contentItems.sourceId} IS NOT NULL`)
    .groupBy(contentItems.sourceId);

  const countBySource = new Map(counts.map((r) => [r.sourceId!, r.count]));

  const rows: ZeroItemSourceRow[] = [];

  for (const source of registry) {
    const itemCount = countBySource.get(source.id) ?? 0;
    if (itemCount > 0) continue;

    const [lastRun] = await db
      .select()
      .from(sourceIngestionRuns)
      .where(eq(sourceIngestionRuns.sourceId, source.id))
      .orderBy(desc(sourceIngestionRuns.startedAt))
      .limit(1);

    rows.push({
      sourceId: source.id,
      sourceName: source.name,
      sourceType: source.type,
      enabled: source.active,
      lastRunAt: lastRun?.startedAt?.toISOString() ?? source.lastScanAt?.toISOString() ?? null,
      lastRunStatus: lastRun?.status ?? null,
      itemCount: 0,
      lastError: source.lastError ?? lastRun?.errorMessage ?? null,
      reason: zeroItemReason(source, lastRun?.status ?? null, itemCount),
    });
  }

  return rows;
}
