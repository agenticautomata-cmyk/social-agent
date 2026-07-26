import { desc, eq, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { resolveWorkerIncident, upsertWorkerIncident } from '../creator-agent/worker-incidents.js';
import { normalizeWorkerErrorSummary } from '../provider-errors.js';
import { logProviderFailure } from '../structured-log.js';
import { workerHeartbeats, workerJobRuns, type NewWorkerJobRun } from '../schema.js';
import { PRODUCTION_WORKERS, workerDefinition } from './definitions.js';

export type WorkerStatus =
  | 'healthy'
  | 'running'
  | 'delayed'
  | 'degraded'
  | 'failed'
  | 'disabled'
  | 'unknown';

export type WorkerStatusRow = {
  workerId: string;
  displayName: string;
  scheduleLabel: string;
  enabled: boolean;
  status: WorkerStatus;
  lastHeartbeatAt: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastErrorSummary: string | null;
  consecutiveFailures: number;
  lastDurationMs: number | null;
  queueDepth: number | null;
  retryCount: number;
  currentJob: string | null;
  nextScheduledAt: string | null;
};

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

function deriveStatus(
  row: typeof workerHeartbeats.$inferSelect,
  now = Date.now(),
): WorkerStatus {
  if (!row.enabled) return 'disabled';
  if (row.status === 'running') return 'running';
  if ((row.consecutiveFailures ?? 0) >= 3) return 'failed';
  if ((row.consecutiveFailures ?? 0) >= 1) return 'degraded';

  const def = workerDefinition(row.workerId);
  const staleMs = def?.staleAfterMs ?? 60 * 60 * 1000;
  const lastOk = row.lastSuccessAt ?? row.lastHeartbeatAt;
  if (!lastOk) return 'unknown';
  if (now - lastOk.getTime() > staleMs) return 'delayed';
  return 'healthy';
}

export async function ensureWorkerRegistry(): Promise<void> {
  for (const w of PRODUCTION_WORKERS) {
    await db
      .insert(workerHeartbeats)
      .values({
        workerId: w.workerId,
        displayName: w.displayName,
        scheduleLabel: w.scheduleLabel,
        enabled: true,
        status: 'unknown',
      })
      .onConflictDoNothing();
  }
}

export async function recordWorkerRunStart(
  workerId: string,
  trigger: 'scheduled' | 'manual' = 'scheduled',
): Promise<string> {
  await ensureWorkerRegistry();
  const now = new Date();
  await db
    .update(workerHeartbeats)
    .set({
      status: 'running',
      lastHeartbeatAt: now,
      currentJob: 'running',
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
  return rows.map((row) => ({
    workerId: row.workerId,
    displayName: row.displayName,
    scheduleLabel: row.scheduleLabel ?? '',
    enabled: row.enabled,
    status: deriveStatus(row),
    lastHeartbeatAt: iso(row.lastHeartbeatAt),
    lastSuccessAt: iso(row.lastSuccessAt),
    lastErrorAt: iso(row.lastErrorAt),
    lastErrorSummary: row.lastErrorSummary,
    consecutiveFailures: row.consecutiveFailures ?? 0,
    lastDurationMs: row.lastDurationMs,
    queueDepth: row.queueDepth,
    retryCount: row.retryCount ?? 0,
    currentJob: row.currentJob,
    nextScheduledAt: iso(row.nextScheduledAt),
  }));
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
