import assert from 'node:assert/strict';
import test from 'node:test';
import { workerDefinition, PRODUCTION_WORKERS } from './definitions.js';

test('production worker registry includes Benson workers', () => {
  assert.ok(PRODUCTION_WORKERS.length >= 16);
  assert.ok(workerDefinition('benson-pulse'));
  assert.ok(workerDefinition('unposted-draft-intelligence'));
  assert.ok(workerDefinition('eventbrite-kc-discovery'));
});

test('stale thresholds are positive', () => {
  for (const worker of PRODUCTION_WORKERS) {
    assert.ok(worker.staleAfterMs > 0, worker.workerId);
  }
});
