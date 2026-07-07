import { desc, eq } from 'drizzle-orm';
import { db } from '../db.js';
import { sourceIngestionRuns } from '../schema.js';

export async function listIngestionRuns(opts?: { sourceId?: string; limit?: number }) {
  const limit = opts?.limit ?? 50;
  const rows = await db
    .select()
    .from(sourceIngestionRuns)
    .where(opts?.sourceId ? eq(sourceIngestionRuns.sourceId, opts.sourceId) : undefined)
    .orderBy(desc(sourceIngestionRuns.startedAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    sourceId: r.sourceId,
    sourceName: r.sourceName,
    startedAt: r.startedAt.toISOString(),
    finishedAt: r.finishedAt?.toISOString() ?? null,
    status: r.status,
    createdCount: r.createdCount,
    updatedCount: r.updatedCount,
    skippedCount: r.skippedCount,
    errorCount: r.errorCount,
    errorMessage: r.errorMessage,
    rawSummary: r.rawSummary,
    dryRun: r.dryRun,
  }));
}
