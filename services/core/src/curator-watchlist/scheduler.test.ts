import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CURATOR_WATCHLIST_INTERVAL_MS,
  CURATOR_WATCHLIST_WORKER_ID,
  acquireCuratorWatchlistLock,
  curatorWatchlistJitterMs,
} from './scheduler.js';
import { workerDefinition } from '../worker-heartbeat/definitions.js';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

describe('curator-watchlist scheduler', () => {
  it('registers a canonical worker identity', () => {
    assert.equal(CURATOR_WATCHLIST_WORKER_ID, 'curator-watchlist-check');
    assert.ok(workerDefinition(CURATOR_WATCHLIST_WORKER_ID));
    assert.equal(CURATOR_WATCHLIST_INTERVAL_MS, 4 * 60 * 60 * 1000);
  });

  it('jitter is bounded (0–10 minutes)', () => {
    for (let i = 0; i < 20; i++) {
      const j = curatorWatchlistJitterMs();
      assert.ok(j >= 0 && j < 10 * 60_000);
    }
  });

  it('lock is exclusive and release allows a second acquire', async () => {
    const lockPath = join(tmpdir(), `benson-watchlist-lock-${randomUUID()}.lock`);
    const release1 = await acquireCuratorWatchlistLock(lockPath);
    assert.ok(release1, 'first acquire should succeed');
    const release2 = await acquireCuratorWatchlistLock(lockPath);
    assert.equal(release2, null, 'second acquire must fail while held');
    await release1!();
    const release3 = await acquireCuratorWatchlistLock(lockPath);
    assert.ok(release3, 'acquire after release should succeed');
    await release3!();
  });
});
