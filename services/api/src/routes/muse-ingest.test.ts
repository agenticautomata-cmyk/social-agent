import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Hono } from 'hono';
import { createMuseIngestRoute } from './muse-ingest.js';
import { createMemoryMuseIngestStore } from '@social-agent/core/muse-ingest';

const TEST_KEY = 'muse-test-only-key';

function appWith(store = createMemoryMuseIngestStore()) {
  const app = new Hono();
  app.route('/api/ingest', createMuseIngestRoute(store));
  return { app, store };
}

describe('POST /api/ingest/muse-agent auth', () => {
  it('returns 401 and writes nothing when the key header is missing', async () => {
    const prior = process.env.MUSE_INGEST_KEY;
    process.env.MUSE_INGEST_KEY = TEST_KEY;
    try {
      const { app, store } = appWith();
      const res = await app.request('/api/ingest/muse-agent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'event_finding' }),
      });
      assert.equal(res.status, 401);
      const body = (await res.json()) as { ok: boolean; error: { code: string } };
      assert.equal(body.ok, false);
      assert.equal(body.error.code, 'UNAUTHORIZED');
      assert.equal(store.runs.length, 0);
      assert.equal(store.writes.length, 0);
      assert.equal(store.items.length, 0);
    } finally {
      if (prior === undefined) delete process.env.MUSE_INGEST_KEY;
      else process.env.MUSE_INGEST_KEY = prior;
    }
  });

  it('returns 401 and writes nothing when the key does not match', async () => {
    const prior = process.env.MUSE_INGEST_KEY;
    process.env.MUSE_INGEST_KEY = TEST_KEY;
    try {
      const { app, store } = appWith();
      const res = await app.request('/api/ingest/muse-agent', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-benson-ingest-key': 'wrong-key',
        },
        body: JSON.stringify({ type: 'event_finding' }),
      });
      assert.equal(res.status, 401);
      assert.equal(store.runs.length, 0);
      assert.equal(store.writes.length, 0);
    } finally {
      if (prior === undefined) delete process.env.MUSE_INGEST_KEY;
      else process.env.MUSE_INGEST_KEY = prior;
    }
  });
});
