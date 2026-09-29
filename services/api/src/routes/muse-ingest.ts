import { Hono } from 'hono';
import {
  authorizeMuseIngest,
  consumeMuseIngestRateLimit,
  createPostgresMuseIngestStore,
  ingestMusePayload,
  MUSE_INGEST_MAX_BYTES,
  recordUnparsedMuseBody,
  type MuseIngestStore,
} from '@social-agent/core/muse-ingest';

function jsonError(
  c: { json: (body: unknown, status: 400 | 401 | 413 | 429 | 500) => Response },
  status: 400 | 401 | 413 | 429 | 500,
  code: string,
  message: string,
) {
  return c.json({ ok: false, error: { code, message } }, status);
}

export function createMuseIngestRoute(store: MuseIngestStore = createPostgresMuseIngestStore()): Hono {
  const route = new Hono();

  route.post('/muse-agent', async (c) => {
    const declared = c.req.header('content-length');
    if (declared && Number(declared) > MUSE_INGEST_MAX_BYTES) {
      return jsonError(c, 413, 'PAYLOAD_TOO_LARGE', 'JSON body exceeds 1 MB');
    }

    const auth = authorizeMuseIngest(c.req.header('x-benson-ingest-key'));
    if (!auth.ok) {
      return jsonError(c, 401, 'UNAUTHORIZED', 'Invalid or missing ingest key');
    }
    if (!consumeMuseIngestRateLimit(auth.keyId)) {
      return jsonError(c, 429, 'RATE_LIMITED', 'Ingest rate limit exceeded');
    }

    const raw = await c.req.text();
    if (Buffer.byteLength(raw, 'utf8') > MUSE_INGEST_MAX_BYTES) {
      return jsonError(c, 413, 'PAYLOAD_TOO_LARGE', 'JSON body exceeds 1 MB');
    }

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      const runId = await recordUnparsedMuseBody(raw, store);
      return c.json(
        { ok: false, runId, error: { code: 'INVALID_JSON', message: 'Body must be JSON' } },
        400,
      );
    }

    try {
      const result = await ingestMusePayload(body, store);
      return c.json({ ok: true, runId: result.runId, items: result.items });
    } catch (err) {
      console.error('[muse-ingest]', err instanceof Error ? err.message : 'ingest_failed');
      return jsonError(c, 500, 'INTERNAL_ERROR', 'Ingest failed');
    }
  });

  return route;
}

export const museIngestRoute = createMuseIngestRoute();
