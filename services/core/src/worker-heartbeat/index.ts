import { desc, eq, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { resolveWorkerIncident, upsertWorkerIncident } from '../creator-agent/worker-incidents.js';
import { normalizeWorkerErrorSummary } from '../provider-errors.js';
import { logProviderFailure } from '../structured-log.js';
import { workerHeartbeats, workerJobRuns, type NewWorkerJobRun } from '../schema.js';
import { readWorkersProcessRunning } from '../workers-runtime/lock.js';
import { PRODUCTION_WORKERS, workerDefinition } from './definitions.js';

export type WorkerStatus =
  | 'healthy'
  | 'running'
  | 'stale'
  | 'error'
  | 'stopped'
  | 'disabled'
  | 'unknown';

export type WorkerStatusRow = {
  workerId: string;
  displayName: string;
  scheduleLabel: string;
  enabled: boolean;
  status: WorkerStatus;
  lastHeartbeatAt: string | null;
  lastStartedAt: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastErrorSummary: string | null;
  consecutiveFailures: number;
  lastDurationMs: number | null;
  expectedIntervalMs: number | null;
  queueDepth: number | null;
  retryCount: number;
  currentJob: string | null;
  nextScheduledAt: string | null;
};

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

function readLastStartedAt(metadata: unknown): Date | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const value = (metadata as { lastStartedAt?: unknown }).lastStartedAt;
  if (typeof value !== 'string') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Derive live worker freshness — never trust a historical DB status alone. */
export function deriveWorkerStatus(
  row: typeof workerHeartbeats.$inferSelect,
  opts?: { workersProcessRunning?: boolean; now?: number },
): WorkerStatus {
  const now = opts?.now ?? Date.now();
  if (!row.enabled) return 'disabled';
  if (row.status === 'running') return 'running';

  if ((row.consecutiveFailures ?? 0) >= 1 || row.status === 'failed' || row.status === 'degraded') {
    return 'error';
  }

  const workersProcessRunning = opts?.workersProcessRunning ?? readWorkersProcessRunning();
  if (workersProcessRunning === false) return 'stopped';

  const def = workerDefinition(row.workerId);
  const staleMs = def?.staleAfterMs ?? 60 * 60 * 1000;
  const lastOk = row.lastSuccessAt ?? row.lastHeartbeatAt;
  if (!lastOk) return 'unknown';
  if (now - lastOk.getTime() > staleMs) return 'stale';
  return 'healthy';
}

async function reconcilePersistedStatuses(
  rows: Array<{ workerId: string; derived: WorkerStatus; persisted: string }>,
): Promise<void> {
  for (const row of rows) {
    if (row.derived === row.persisted) continue;
    await db
      .update(workerHeartbeats)
      .set({ status: row.derived, updatedAt: new Date() })
      .where(eq(workerHeartbeats.workerId, row.workerId));
  }
}

/** Idempotent upsert of one worker identity — safe for restarts and renamed IDs. */
export async function ensureWorkerRegistered(workerId: string): Promise<void> {
  const def = workerDefinition(workerId);
  await db
    .insert(workerHeartbeats)
    .values({
      workerId,
      displayName: def?.displayName ?? workerId,
      scheduleLabel: def?.scheduleLabel ?? null,
      enabled: true,
      status: 'unknown',
    })
    .onConflictDoNothing();

  // Reconcile display metadata if the canonical definition changed.
  if (def) {
    await db
      .update(workerHeartbeats)
      .set({
        displayName: def.displayName,
        scheduleLabel: def.scheduleLabel,
        updatedAt: new Date(),
      })
      .where(eq(workerHeartbeats.workerId, workerId));
  }
}

export async function ensureWorkerRegistry(): Promise<void> {
  for (const w of PRODUCTION_WORKERS) {
    await ensureWorkerRegistered(w.workerId);
  }
}

export async function recordWorkerRunStart(
  workerId: string,
  trigger: 'scheduled' | 'manual' = 'scheduled',
): Promise<string> {
  // Always register the specific worker first so FK inserts never race a missing
  // PRODUCTION_WORKERS entry (this is what broke early-signals).
  await ensureWorkerRegistered(workerId);
  await ensureWorkerRegistry();
  const now = new Date();
  const [existing] = await db
    .select({ metadata: workerHeartbeats.metadata })
    .from(workerHeartbeats)
    .where(eq(workerHeartbeats.workerId, workerId))
    .limit(1);
  const metadata = {
    ...((existing?.metadata as Record<string, unknown> | undefined) ?? {}),
    lastStartedAt: now.toISOString(),
  };

  await db
    .update(workerHeartbeats)
    .set({
      status: 'running',
      lastHeartbeatAt: now,
      currentJob: 'running',
      metadata,
      updatedAt: now,
    })
    .where(eq(workerHeartbeats.workerId, workerId));

  const [run] = await db
    .insert(workerJobRuns)
    .values({ workerId, status: 'running', trigger })
    .returning({ id: workerJobRuns.id });
  if (!run) throw new Error(`Failed to start worker run for ${workerId}`);
  return run.id;
}

export async function recordWorkerRunSuccess(
  workerId: string,
  runId: string,
  durationMs: number,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const now = new Date();
  await db
    .update(workerJobRuns)
    .set({
      status: 'success',
      finishedAt: now,
      durationMs,
      metadata: metadata ?? {},
    })
    .where(eq(workerJobRuns.id, runId));

  await db
    .update(workerHeartbeats)
    .set({
      status: 'healthy',
      lastHeartbeatAt: now,
      lastSuccessAt: now,
      lastDurationMs: durationMs,
      consecutiveFailures: 0,
      currentJob: null,
      lastErrorSummary: null,
      updatedAt: now,
    })
    .where(eq(workerHeartbeats.workerId, workerId));

  await resolveWorkerIncident({ workerId, recoveryRunId: runId, lastSuccessAt: now });
}

export async function recordWorkerRunFailure(
  workerId: string,
  runId: string,
  durationMs: number,
  errorSummary: string,
  deadLetter = false,
): Promise<void> {
  const now = new Date();
  const normalized = normalizeWorkerErrorSummary(errorSummary);
  const uiSummary = normalized.uiSummary.slice(0, 500);

  logProviderFailure({
    service: 'worker-heartbeat',
    message: `Worker ${workerId} run failed`,
    error: normalized.logSummary,
    workerId,
    jobId: runId,
    errorClassification: normalized.rootCause,
    resolutionStatus: deadLetter ? 'dead_letter' : 'failed',
  });

  await db
    .update(workerJobRuns)
    .set({
      status: deadLetter ? 'dead_letter' : 'failed',
      finishedAt: now,
      durationMs,
      errorSummary: uiSummary,
      metadata: { logSummary: normalized.logSummary, rootCause: normalized.rootCause },
    })
    .where(eq(workerJobRuns.id, runId));

  await db
    .update(workerHeartbeats)
    .set({
      status: deadLetter ? 'failed' : 'degraded',
      lastHeartbeatAt: now,
      lastErrorAt: now,
      lastErrorSummary: uiSummary,
      lastDurationMs: durationMs,
      consecutiveFailures: sql`${workerHeartbeats.consecutiveFailures} + 1`,
      currentJob: null,
      updatedAt: now,
    })
    .where(eq(workerHeartbeats.workerId, workerId));

  await upsertWorkerIncident({
    workerId,
    errorSummary: normalized.logSummary,
    lastFailedRunId: runId,
  });
}

export async function listWorkerStatuses(): Promise<WorkerStatusRow[]> {
  await ensureWorkerRegistry();
  const rows = await db.select().from(workerHeartbeats).orderBy(workerHeartbeats.workerId);
  const workersProcessRunning = readWorkersProcessRunning();
  const now = Date.now();

  const derivedRows = rows.map((row) => {
    const def = workerDefinition(row.workerId);
    const derived = deriveWorkerStatus(row, { workersProcessRunning, now });
    return {
      workerId: row.workerId,
      displayName: row.displayName,
      scheduleLabel: row.scheduleLabel ?? '',
      enabled: row.enabled,
      status: derived,
      lastHeartbeatAt: iso(row.lastHeartbeatAt),
      lastStartedAt: iso(readLastStartedAt(row.metadata) ?? row.lastHeartbeatAt),
      lastSuccessAt: iso(row.lastSuccessAt),
      lastErrorAt: iso(row.lastErrorAt),
      lastErrorSummary: row.lastErrorSummary,
      consecutiveFailures: row.consecutiveFailures ?? 0,
      lastDurationMs: row.lastDurationMs,
      expectedIntervalMs: def?.staleAfterMs ?? null,
      queueDepth: row.queueDepth,
      retryCount: row.retryCount ?? 0,
      currentJob: row.currentJob,
      nextScheduledAt: iso(row.nextScheduledAt),
    };
  });

  await reconcilePersistedStatuses(
    rows.map((row) => ({
      workerId: row.workerId,
      derived: deriveWorkerStatus(row, { workersProcessRunning, now }),
      persisted: row.status,
    })),
  );

  return derivedRows;
}

export async function listRecentJobRuns(workerId: string, limit = 20) {
  const rows = await db
    .select()
    .from(workerJobRuns)
    .where(eq(workerJobRuns.workerId, workerId))
    .orderBy(desc(workerJobRuns.startedAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    workerId: r.workerId,
    startedAt: r.startedAt.toISOString(),
    finishedAt: iso(r.finishedAt),
    status: r.status,
    durationMs: r.durationMs,
    errorSummary: r.errorSummary,
    retryCount: r.retryCount,
    trigger: r.trigger,
  }));
}

export async function listFailedJobRuns(limit = 30) {
  const rows = await db
    .select()
    .from(workerJobRuns)
    .where(sql`${workerJobRuns.status} IN ('failed', 'dead_letter')`)
    .orderBy(desc(workerJobRuns.startedAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    workerId: r.workerId,
    startedAt: r.startedAt.toISOString(),
    finishedAt: iso(r.finishedAt),
    status: r.status,
    errorSummary: r.errorSummary,
    trigger: r.trigger,
  }));
}

export async function createManualJobRun(workerId: string): Promise<NewWorkerJobRun & { id: string }> {
  const runId = await recordWorkerRunStart(workerId, 'manual');
  const [run] = await db.select().from(workerJobRuns).where(eq(workerJobRuns.id, runId)).limit(1);
  return run as NewWorkerJobRun & { id: string };
}

export { PRODUCTION_WORKERS, workerDefinition } from './definitions.js';
