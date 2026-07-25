import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { workerIncidents } from '../schema.js';

export type IncidentState = 'detected' | 'active' | 'acknowledged' | 'recovering' | 'resolved';

export async function upsertWorkerIncident(input: {
  workerId: string;
  errorSummary: string;
  lastFailedRunId?: string;
  consecutiveFailureCount?: number;
}): Promise<string> {
  const existing = await db
    .select({ id: workerIncidents.id, consecutiveFailureCount: workerIncidents.consecutiveFailureCount })
    .from(workerIncidents)
    .where(and(eq(workerIncidents.workerId, input.workerId), isNull(workerIncidents.resolvedAt)))
    .orderBy(desc(workerIncidents.detectedAt))
    .limit(1);

  const now = new Date();
  if (existing[0]) {
    await db
      .update(workerIncidents)
      .set({
        state: 'active',
        errorSummary: input.errorSummary.slice(0, 500),
        consecutiveFailureCount:
          input.consecutiveFailureCount ?? (existing[0].consecutiveFailureCount ?? 0) + 1,
        lastFailedRunId: input.lastFailedRunId ?? null,
        updatedAt: now,
      })
      .where(eq(workerIncidents.id, existing[0].id));
    return existing[0].id;
  }

  const [row] = await db
    .insert(workerIncidents)
    .values({
      workerId: input.workerId,
      state: 'detected',
      errorSummary: input.errorSummary.slice(0, 500),
      consecutiveFailureCount: input.consecutiveFailureCount ?? 1,
      lastFailedRunId: input.lastFailedRunId ?? null,
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

export async function listActiveWorkerIncidents(limit = 20) {
  const rows = await db
    .select()
    .from(workerIncidents)
    .where(isNull(workerIncidents.resolvedAt))
    .orderBy(desc(workerIncidents.detectedAt))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    workerId: row.workerId,
    state: row.state as IncidentState,
    detectedAt: row.detectedAt.toISOString(),
    errorSummary: row.errorSummary,
    consecutiveFailureCount: row.consecutiveFailureCount,
    lastSuccessAt: row.lastSuccessAt?.toISOString() ?? null,
  }));
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
