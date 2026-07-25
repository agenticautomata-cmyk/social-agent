import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { featureFlags } from '../feature-flags.js';
import { setIngestDryRun } from '../scanner/ingest-persist.js';
import { scanSource, type ScanSourceResult } from '../scanner/index.js';
import { sourceIngestionRuns, sources, type SourceIngestionStatus } from '../schema.js';
import { getSourceRegistryEntry } from './registry.js';

const REFRESH_TIMEOUT_MS = parseInt(process.env.SOURCE_REFRESH_TIMEOUT_MS ?? '120000', 10);
const REFRESH_CONCURRENCY = parseInt(process.env.SOURCE_REFRESH_CONCURRENCY ?? '3', 10);

export type RefreshSourceResult = {
  sourceId: string;
  sourceName: string;
  runId: string;
  status: SourceIngestionStatus;
  dryRun: boolean;
  created: number;
  updated: number;
  skipped: number;
  errorCount: number;
  errorMessage?: string;
  itemsFound: number;
  durationMs: number;
};

export type RefreshAllResult = {
  dryRun: boolean;
  startedAt: string;
  finishedAt: string;
  sources: RefreshSourceResult[];
  totals: {
    created: number;
    updated: number;
    skipped: number;
    failed: number;
  };
};

function assertScannerEnabled(): void {
  if (!featureFlags.enableKcScanner) {
    throw new Error('ENABLE_KC_SCANNER is not enabled — cannot refresh sources');
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]);
}

function mapScanToStatus(scan: ScanSourceResult): SourceIngestionStatus {
  if (scan.error) return scan.itemsCreated + scan.itemsUpdated > 0 ? 'partial' : 'failed';
  return 'success';
}

async function recordIngestionRunStart(
  source: { id: string; name: string },
  dryRun: boolean,
): Promise<string> {
  const [row] = await db
    .insert(sourceIngestionRuns)
    .values({
      sourceId: source.id,
      sourceName: source.name,
      status: 'running',
      dryRun,
    })
    .returning({ id: sourceIngestionRuns.id });
  return row!.id;
}

async function finalizeIngestionRun(
  runId: string,
  scan: ScanSourceResult,
  dryRun: boolean,
  durationMs: number,
): Promise<RefreshSourceResult> {
  const status = mapScanToStatus(scan);
  const errorCount = scan.error ? 1 : 0;
  await db
    .update(sourceIngestionRuns)
    .set({
      status,
      finishedAt: new Date(),
      createdCount: scan.itemsCreated,
      updatedCount: scan.itemsUpdated,
      skippedCount: scan.itemsSkipped,
      errorCount,
      errorMessage: scan.error ?? null,
      rawSummary: {
        dryRun,
        durationMs,
        itemsFound: scan.itemsFound,
        scanRunId: scan.scanRunId,
      },
    })
    .where(eq(sourceIngestionRuns.id, runId));

  const source = await getSourceRegistryEntry(scan.sourceId);
  return {
    sourceId: scan.sourceId,
    sourceName: source?.sourceName ?? scan.sourceId,
    runId,
    status,
    dryRun,
    created: scan.itemsCreated,
    updated: scan.itemsUpdated,
    skipped: scan.itemsSkipped,
    errorCount,
    errorMessage: scan.error,
    itemsFound: scan.itemsFound,
    durationMs,
  };
}

async function recordFailedRun(
  source: { id: string; name: string },
  runId: string,
  dryRun: boolean,
  message: string,
  durationMs: number,
): Promise<RefreshSourceResult> {
  await db
    .update(sourceIngestionRuns)
    .set({
      status: 'failed',
      finishedAt: new Date(),
      errorCount: 1,
      errorMessage: message,
      rawSummary: { dryRun, durationMs },
    })
    .where(eq(sourceIngestionRuns.id, runId));

  await db
    .update(sources)
    .set({ lastError: message, updatedAt: new Date() })
    .where(eq(sources.id, source.id));

  return {
    sourceId: source.id,
    sourceName: source.name,
    runId,
    status: 'failed',
    dryRun,
    created: 0,
    updated: 0,
    skipped: 0,
    errorCount: 1,
    errorMessage: message,
    itemsFound: 0,
    durationMs,
  };
}

export async function refreshOneSource(
  sourceId: string,
  opts?: { dryRun?: boolean },
): Promise<RefreshSourceResult> {
  assertScannerEnabled();
  const dryRun = opts?.dryRun === true;
  const source = await db.query.sources.findFirst({ where: eq(sources.id, sourceId) });
  if (!source) throw new Error(`source not found: ${sourceId}`);
  if (!source.active) throw new Error(`source inactive: ${source.name}`);

  const runId = await recordIngestionRunStart(source, dryRun);
  const started = Date.now();
  setIngestDryRun(dryRun);
  try {
    const scan = await withTimeout(
      scanSource(sourceId),
      REFRESH_TIMEOUT_MS,
      `refresh ${source.name}`,
    );
    return finalizeIngestionRun(runId, scan, dryRun, Date.now() - started);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return recordFailedRun(source, runId, dryRun, message, Date.now() - started);
  } finally {
    setIngestDryRun(false);
  }
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function refreshAllSources(opts?: {
  dryRun?: boolean;
  campaignId?: string;
}): Promise<RefreshAllResult> {
  assertScannerEnabled();
  const dryRun = opts?.dryRun === true;
  const startedAt = new Date();
  const registry = await db.select().from(sources).where(eq(sources.active, true));
  // Share-intake / manual rows are promoted via intake — not scanner-backed.
  let targets = registry.filter((s) => s.type !== 'manual');
  if (opts?.campaignId) {
    targets = targets.filter((s) => s.campaignId === opts.campaignId);
  }

  const perSource: RefreshSourceResult[] = await mapPool(
    targets,
    REFRESH_CONCURRENCY,
    async (source) => {
      if (dryRun) {
        const runId = await recordIngestionRunStart(source, true);
        setIngestDryRun(true);
        try {
          const scan = await withTimeout(
            scanSource(source.id),
            REFRESH_TIMEOUT_MS,
            `dry-run ${source.name}`,
          );
          return finalizeIngestionRun(runId, scan, true, 0);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return recordFailedRun(source, runId, true, message, 0);
        } finally {
          setIngestDryRun(false);
        }
      }
      return refreshOneSource(source.id, { dryRun: false });
    },
  );

  const finishedAt = new Date();
  const result = {
    dryRun,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    sources: perSource,
    totals: {
      created: perSource.reduce((n, r) => n + r.created, 0),
      updated: perSource.reduce((n, r) => n + r.updated, 0),
      skipped: perSource.reduce((n, r) => n + r.skipped, 0),
      failed: perSource.filter((r) => r.status === 'failed').length,
    },
  };

  if (!dryRun && result.totals.failed < perSource.length) {
    try {
      const { emitDataChange } = await import('../data-revision/index.js');
      await emitDataChange({
        eventType: 'source_refresh',
        domains: ['discoveries', 'opportunities', 'home_briefing', 'recommendations'],
        completedAt: finishedAt.toISOString(),
        source: 'source_ingestion',
        success: result.totals.failed === 0 || result.totals.created + result.totals.updated > 0,
        metadata: result.totals,
      });
    } catch (err) {
      console.warn('[source-refresh] data revision emit failed:', err instanceof Error ? err.message : err);
    }
  }

  return result;
}
