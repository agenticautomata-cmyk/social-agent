import { and, desc, eq, gte, isNotNull, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { contentItems, sourceIngestionRuns } from '../schema.js';

export type IngestionFreshnessSummary = {
  dataFreshnessAt: string | null;
  sourcesRefreshedToday: number;
  lastRefreshStatus: 'success' | 'partial' | 'failed' | 'running' | 'none';
  lastRefreshAt: string | null;
  lastRefreshError: string | null;
  ingestedItemCount: number;
  staleItemCount: number;
  demoMode: boolean;
};

export async function getIngestionFreshnessSummary(
  demoMode: boolean,
): Promise<IngestionFreshnessSummary> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [lastRun] = await db
    .select()
    .from(sourceIngestionRuns)
    .orderBy(desc(sourceIngestionRuns.startedAt))
    .limit(1);

  const todayRuns = await db
    .select({ sourceId: sourceIngestionRuns.sourceId })
    .from(sourceIngestionRuns)
    .where(
      and(
        gte(sourceIngestionRuns.startedAt, startOfDay),
        eq(sourceIngestionRuns.dryRun, false),
        isNotNull(sourceIngestionRuns.sourceId),
      ),
    );

  const uniqueSourcesToday = new Set(todayRuns.map((r) => r.sourceId).filter(Boolean));

  const [ingestedCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contentItems)
    .where(isNotNull(contentItems.sourceId));

  const [staleCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contentItems)
    .where(and(isNotNull(contentItems.sourceId), eq(contentItems.stale, true)));

  const [maxChecked] = await db
    .select({ at: sql<Date | null>`max(${contentItems.sourceLastCheckedAt})` })
    .from(contentItems)
    .where(isNotNull(contentItems.sourceId));

  const maxCheckedAt = maxChecked?.at
    ? maxChecked.at instanceof Date
      ? maxChecked.at
      : new Date(maxChecked.at as string)
    : null;
  const dataFreshnessAt =
    maxCheckedAt && !Number.isNaN(maxCheckedAt.getTime())
      ? maxCheckedAt.toISOString()
      : lastRun?.finishedAt?.toISOString() ?? null;

  return {
    dataFreshnessAt,
    sourcesRefreshedToday: uniqueSourcesToday.size,
    lastRefreshStatus: lastRun?.status ?? 'none',
    lastRefreshAt: lastRun?.finishedAt?.toISOString() ?? lastRun?.startedAt?.toISOString() ?? null,
    lastRefreshError: lastRun?.errorMessage ?? null,
    ingestedItemCount: ingestedCount?.count ?? 0,
    staleItemCount: staleCount?.count ?? 0,
    demoMode,
  };
}
