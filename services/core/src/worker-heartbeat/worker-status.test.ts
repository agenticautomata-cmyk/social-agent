import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deriveWorkerStatus } from './index.js';
import type { workerHeartbeats } from '../schema.js';

function row(
  overrides: Partial<typeof workerHeartbeats.$inferSelect>,
): typeof workerHeartbeats.$inferSelect {
  return {
    workerId: 'gmail-inbox-sync',
    displayName: 'Gmail inbox sync',
    scheduleLabel: 'poll',
    enabled: true,
    status: 'healthy',
    lastHeartbeatAt: null,
    lastSuccessAt: null,
    lastErrorAt: null,
    lastErrorSummary: null,
    consecutiveFailures: 0,
    lastDurationMs: null,
    queueDepth: null,
    retryCount: 0,
    currentJob: null,
    nextScheduledAt: null,
    metadata: {},
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('deriveWorkerStatus freshness', () => {
  it('marks stale when last success exceeds staleAfterMs', () => {
    const staleAt = new Date(Date.now() - 31 * 60 * 1000);
    const status = deriveWorkerStatus(
      row({ lastSuccessAt: staleAt, status: 'healthy' }),
      { workersProcessRunning: true, now: Date.now() },
    );
    assert.equal(status, 'stale');
  });

  it('marks stopped when workers process is unavailable', () => {
    const recent = new Date(Date.now() - 5 * 60 * 1000);
    const status = deriveWorkerStatus(
      row({ lastSuccessAt: recent, status: 'healthy' }),
      { workersProcessRunning: false, now: Date.now() },
    );
    assert.equal(status, 'stopped');
  });

  it('marks error when consecutive failures exist', () => {
    const status = deriveWorkerStatus(
      row({ consecutiveFailures: 1, status: 'degraded', lastSuccessAt: new Date() }),
      { workersProcessRunning: true, now: Date.now() },
    );
    assert.equal(status, 'error');
  });

  it('marks healthy inside freshness window', () => {
    const recent = new Date(Date.now() - 5 * 60 * 1000);
    const status = deriveWorkerStatus(
      row({ lastSuccessAt: recent, status: 'healthy' }),
      { workersProcessRunning: true, now: Date.now() },
    );
    assert.equal(status, 'healthy');
  });
});
