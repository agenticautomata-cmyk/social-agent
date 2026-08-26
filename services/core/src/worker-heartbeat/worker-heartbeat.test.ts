import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ensureWorkerRegistered,
  ensureWorkerRegistry,
  listRecentJobRuns,
  recordWorkerRunStart,
  recordWorkerRunSuccess,
} from './index.js';
import { PRODUCTION_WORKERS, workerDefinition } from './definitions.js';
import { db } from '../test-db.js';
import { workerHeartbeats, workerJobRuns } from '../schema.js';
import { eq } from 'drizzle-orm';

describe('worker-heartbeat — early-signals FK + idempotent registration', () => {
  it('includes early-signals and curator-watchlist-check in PRODUCTION_WORKERS', () => {
    assert.ok(workerDefinition('early-signals'), 'early-signals must be registered');
    assert.ok(workerDefinition('curator-watchlist-check'), 'curator-watchlist-check must be registered');
    const ids = PRODUCTION_WORKERS.map((w) => w.workerId);
    assert.equal(new Set(ids).size, ids.length, 'no duplicate worker IDs');
  });

  it('registers early-signals then logs a run without FK error (fresh + repeat)', async () => {
    await ensureWorkerRegistry();
    await ensureWorkerRegistered('early-signals');

    const [row] = await db
      .select()
      .from(workerHeartbeats)
      .where(eq(workerHeartbeats.workerId, 'early-signals'))
      .limit(1);
    assert.ok(row, 'heartbeat row must exist before job run insert');

    const runId1 = await recordWorkerRunStart('early-signals', 'manual');
    await recordWorkerRunSuccess('early-signals', runId1, 12, { test: true });

    const runId2 = await recordWorkerRunStart('early-signals', 'manual');
    await recordWorkerRunSuccess('early-signals', runId2, 8, { test: true });

    assert.notEqual(runId1, runId2);

    const runs = await listRecentJobRuns('early-signals', 5);
    assert.ok(runs.some((r) => r.id === runId1));
    assert.ok(runs.some((r) => r.id === runId2));
    assert.ok(runs.every((r) => r.workerId === 'early-signals'));
  });

  it('restart remains idempotent — no duplicate worker_heartbeats rows', async () => {
    await ensureWorkerRegistered('early-signals');
    await ensureWorkerRegistered('early-signals');
    await ensureWorkerRegistry();
    await ensureWorkerRegistry();

    const rows = await db
      .select()
      .from(workerHeartbeats)
      .where(eq(workerHeartbeats.workerId, 'early-signals'));
    assert.equal(rows.length, 1);
  });

  it('renamed/stale identity reconciles via ensureWorkerRegistered without FK errors', async () => {
    const staleId = 'early-signals-stale-test';
    await ensureWorkerRegistered(staleId);
    const runId = await recordWorkerRunStart(staleId, 'manual');
    await recordWorkerRunSuccess(staleId, runId, 1);

    // Cleanup test-only identity so Control Tower stays clean.
    await db.delete(workerJobRuns).where(eq(workerJobRuns.workerId, staleId));
    await db.delete(workerHeartbeats).where(eq(workerHeartbeats.workerId, staleId));
  });
});
