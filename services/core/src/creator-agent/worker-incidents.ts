import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { workerIncidents } from '../schema.js';
import {
  computeNextRetryAt,
  normalizeWorkerErrorSummary,
  type ProviderRootCause,
} from '../provider-errors.js';

export type IncidentState = 'detected' | 'active' | 'acknowledged' | 'recovering' | 'resolved';

export type WorkerIncidentView = {
  id: string;
  workerId: string;
  state: IncidentState;
  rootCause: ProviderRootCause;
  detectedAt: string;
  updatedAt: string;
  errorSummary: string | null;
  consecutiveFailureCount: number;
  lastSuccessAt: string | null;
  nextRetryAt: string | null;
};

export async function upsertWorkerIncident(input: {
  workerId: string;
  errorSummary: string;
  lastFailedRunId?: string;
  consecutiveFailureCount?: number;
}): Promise<string> {
  const normalized = normalizeWorkerErrorSummary(input.errorSummary);
  const rootCause = normalized.rootCause;
  const nextRetryAt = normalized.retryable
    ? computeNextRetryAt(input.consecutiveFailureCount ?? 1).toISOString()
    : null;

  const existing = await db
    .select({
      id: workerIncidents.id,
      consecutiveFailureCount: workerIncidents.consecutiveFailureCount,
      detectedAt: workerIncidents.detectedAt,
      metadata: workerIncidents.metadata,
    })
    .from(workerIncidents)
    .where(
      and(
        eq(workerIncidents.workerId, input.workerId),
        eq(workerIncidents.lastErrorCode, rootCause),
        isNull(workerIncidents.resolvedAt),
      ),
    )
    .orderBy(desc(workerIncidents.detectedAt))
    .limit(1);

  const now = new Date();
  const occurrenceCount =
    input.consecutiveFailureCount ?? (existing[0]?.consecutiveFailureCount ?? 0) + 1;

  if (existing[0]) {
    const prevMeta = (existing[0].metadata ?? {}) as Record<string, unknown>;
    await db
      .update(workerIncidents)
      .set({
        state: 'active',
        errorSummary: normalized.uiSummary.slice(0, 500),
        consecutiveFailureCount: occurrenceCount,
        lastFailedRunId: input.lastFailedRunId ?? null,
        updatedAt: now,
        metadata: {
          ...prevMeta,
          nextRetryAt,
          logSummary: normalized.logSummary,
          latestFailureAt: now.toISOString(),
          firstFailureAt: (prevMeta.firstFailureAt as string | undefined) ?? now.toISOString(),
        },
      })
      .where(eq(workerIncidents.id, existing[0].id));
    return existing[0].id;
  }

  const [row] = await db
    .insert(workerIncidents)
    .values({
      workerId: input.workerId,
      state: 'detected',
      lastErrorCode: rootCause,
      errorSummary: normalized.uiSummary.slice(0, 500),
      consecutiveFailureCount: occurrenceCount,
      lastFailedRunId: input.lastFailedRunId ?? null,
      metadata: {
        nextRetryAt,
        logSummary: normalized.logSummary,
        firstFailureAt: now.toISOString(),
        latestFailureAt: now.toISOString(),
      },
    })
    .returning({ id: workerIncidents.id });
  return row!.id;
}

export async function resolveWorkerIncident(input: {
  workerId: string;
  recoveryRunId?: string;
  lastSuccessAt?: Date;
}): Promise<void> {
  const now = new Date();
  await db
    .update(workerIncidents)
    .set({
      state: 'resolved',
      resolvedAt: now,
      recoveringAt: now,
      recoveryRunId: input.recoveryRunId ?? null,
      lastSuccessAt: input.lastSuccessAt ?? now,
      updatedAt: now,
    })
    .where(and(eq(workerIncidents.workerId, input.workerId), isNull(workerIncidents.resolvedAt)));
}

function incidentToView(row: typeof workerIncidents.$inferSelect): WorkerIncidentView {
  const metadata = (row.metadata ?? {}) as {
    nextRetryAt?: string | null;
    firstFailureAt?: string;
  };
  return {
    id: row.id,
    workerId: row.workerId,
    state: row.state as IncidentState,
    rootCause: (row.lastErrorCode ?? 'unknown') as ProviderRootCause,
    detectedAt: row.detectedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    errorSummary: row.errorSummary,
    consecutiveFailureCount: row.consecutiveFailureCount,
    lastSuccessAt: row.lastSuccessAt?.toISOString() ?? null,
    nextRetryAt: metadata.nextRetryAt ?? null,
  };
}

export async function listActiveWorkerIncidents(limit = 20): Promise<WorkerIncidentView[]> {
  const rows = await db
    .select()
    .from(workerIncidents)
    .where(isNull(workerIncidents.resolvedAt))
    .orderBy(desc(workerIncidents.updatedAt))
    .limit(limit);
  return rows.map(incidentToView);
}

export async function listRecentResolvedIncidents(limit = 20) {
  const rows = await db
    .select()
    .from(workerIncidents)
    .where(sql`${workerIncidents.resolvedAt} IS NOT NULL`)
    .orderBy(desc(workerIncidents.resolvedAt))
    .limit(limit);
  return rows;
}
