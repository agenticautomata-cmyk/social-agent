import type { MuseIngestStore, MuseItemResult } from './types.js';
import { normalizeMuseBody, validateMuseItem } from './contract.js';

const BATCH_LIMIT = 100;

function resultOf(fingerprint: string, disposition: MuseItemResult['disposition'], reason: string): MuseItemResult {
  return { fingerprint, disposition, reason };
}

/**
 * Authenticated body already parsed. Every run keeps the raw payload.
 * Identical fingerprint replay returns the stored disposition and does not route again.
 */
export async function ingestMusePayload(
  body: unknown,
  store: MuseIngestStore,
  now = new Date(),
): Promise<{ runId: string; items: MuseItemResult[] }> {
  const normalized = normalizeMuseBody(body);
  const items = normalized.ok ? normalized.items : [];
  const run = await store.beginRun({
    rawPayload: body,
    itemCount: normalized.ok ? items.length : 0,
  });

  if (!normalized.ok) {
    const rejected = [resultOf('', 'rejected', normalized.reason)];
    await store.completeRun(run.id, rejected, 'completed');
    return { runId: run.id, items: rejected };
  }

  if (items.length > BATCH_LIMIT) {
    const rejected = [resultOf('', 'rejected', 'batch_too_large')];
    await store.completeRun(run.id, rejected, 'completed');
    return { runId: run.id, items: rejected };
  }

  const results: MuseItemResult[] = [];
  try {
    for (const rawItem of items) {
      results.push(await ingestOne(rawItem, store, run.id, now));
    }
    await store.completeRun(run.id, results, 'completed');
    return { runId: run.id, items: results };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'ingest_failed';
    await store.completeRun(run.id, results, 'failed', message);
    throw err;
  }
}

async function ingestOne(
  rawItem: unknown,
  store: MuseIngestStore,
  runId: string,
  now: Date,
): Promise<MuseItemResult> {
  const validated = validateMuseItem(rawItem);
  if (!validated.ok) {
    if (!validated.fingerprint || validated.reason === 'fingerprint_too_long') {
      return resultOf(validated.fingerprint, 'rejected', validated.reason);
    }
    const existing = await store.findItem('muse-agent', validated.fingerprint);
    if (existing) return resultOf(existing.fingerprint, existing.disposition, existing.reason);
    const committed = await store.commitItem({
      runId,
      source: 'muse-agent',
      fingerprint: validated.fingerprint,
      itemType: itemTypeOf(rawItem),
      disposition: 'rejected',
      reason: validated.reason,
      canonicalUrl: null,
      rawItem,
      routedKind: null,
      routedId: null,
    });
    if (committed === 'conflict') {
      const raced = await store.findItem('muse-agent', validated.fingerprint);
      if (raced) return resultOf(raced.fingerprint, raced.disposition, raced.reason);
    }
    return resultOf(validated.fingerprint, 'rejected', validated.reason);
  }

  const { item } = validated;
  const existing = await store.findItem(item.source, item.fingerprint);
  if (existing) return resultOf(existing.fingerprint, existing.disposition, existing.reason);

  const routed =
    item.type === 'event_finding'
      ? await store.routeEvent({ item, now })
      : item.type === 'opportunity_dossier'
        ? await store.routeDossier({ item })
        : await store.routeOpening({ item });

  const committed = await store.commitItem({
    runId,
    source: item.source,
    fingerprint: item.fingerprint,
    itemType: item.type,
    disposition: routed.disposition,
    reason: routed.reason,
    canonicalUrl: routed.canonicalUrl,
    rawItem: item.raw,
    routedKind: routed.routedKind,
    routedId: routed.routedId,
  });
  if (committed === 'conflict') {
    const raced = await store.findItem(item.source, item.fingerprint);
    if (raced) return resultOf(raced.fingerprint, raced.disposition, raced.reason);
  }
  return resultOf(item.fingerprint, routed.disposition, routed.reason);
}

function itemTypeOf(rawItem: unknown): string {
  if (rawItem && typeof rawItem === 'object' && !Array.isArray(rawItem)) {
    const type = (rawItem as { type?: unknown }).type;
    if (typeof type === 'string' && type.trim()) return type.trim().slice(0, 80);
  }
  return 'invalid';
}

export async function recordUnparsedMuseBody(raw: string, store: MuseIngestStore): Promise<string> {
  const run = await store.beginRun({ rawPayload: { unparsed: raw }, itemCount: 0 });
  await store.completeRun(run.id, [], 'invalid_json', 'invalid_json');
  return run.id;
}
