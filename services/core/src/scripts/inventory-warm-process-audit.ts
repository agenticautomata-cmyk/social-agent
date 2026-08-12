/**
 * Read-only warm-process memory audit — one-time vs repeatable inventory RSS.
 *   NODE_OPTIONS='--expose-gc' pnpm exec tsx src/scripts/inventory-warm-process-audit.ts [test1|test2|test3|all]
 */
import { and, eq, isNotNull, not, or } from 'drizzle-orm';
import { db } from '../db.js';
import { contentItems, sources } from '../schema.js';
import { contentItemsChronologicalOrder } from '../content-order.js';
import { ingestedWithinRetentionWindow } from '../inventory/retention.js';
import { inventoryLoadContentItemSelect } from '../inventory/inventory-load-projection.js';
import { normalizeInventoryItem } from '../inventory/normalize.js';
import { loadIngestedInventoryItems } from '../inventory/load-ingested.js';
import { sql } from 'drizzle-orm';

type MemSnap = {
  label: string;
  time: string;
  rss: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
  arrayBuffers: number;
  rssKb: number;
  heapTotalKb: number;
  heapUsedKb: number;
  externalKb: number;
  arrayBuffersKb: number;
};

function mem(label: string): MemSnap {
  const m = process.memoryUsage();
  const snap: MemSnap = {
    label,
    time: new Date().toISOString(),
    rss: m.rss,
    heapTotal: m.heapTotal,
    heapUsed: m.heapUsed,
    external: m.external,
    arrayBuffers: m.arrayBuffers,
    rssKb: Math.round(m.rss / 1024),
    heapTotalKb: Math.round(m.heapTotal / 1024),
    heapUsedKb: Math.round(m.heapUsed / 1024),
    externalKb: Math.round(m.external / 1024),
    arrayBuffersKb: Math.round(m.arrayBuffers / 1024),
  };
  console.log(JSON.stringify({ type: 'mem', ...snap }));
  return snap;
}

function delta(from: MemSnap, to: MemSnap, label: string) {
  const d = {
    type: 'delta',
    label,
    rssKb: to.rssKb - from.rssKb,
    heapTotalKb: to.heapTotalKb - from.heapTotalKb,
    heapUsedKb: to.heapUsedKb - from.heapUsedKb,
    externalKb: to.externalKb - from.externalKb,
    arrayBuffersKb: to.arrayBuffersKb - from.arrayBuffersKb,
  };
  console.log(JSON.stringify(d));
  return d;
}

function maybeGc() {
  if (typeof global.gc === 'function') global.gc();
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function settle(label: string) {
  await sleep(30_000);
  maybeGc();
  return mem(label);
}

const inventoryWhere = and(
  isNotNull(contentItems.sourceId),
  or(isNotNull(contentItems.sourceExternalId), isNotNull(contentItems.sourceUrl)),
  not(sql`${contentItems.sourceExternalId} LIKE 'mock_%'`),
  not(sql`COALESCE(${contentItems.sourceUrl}, '') LIKE '%/comments/mock%'`),
  ingestedWithinRetentionWindow(),
);

async function fetchProjectedInventoryRows() {
  return db
    .select({
      ...inventoryLoadContentItemSelect,
      sourceName: sources.name,
      sourceType: sources.type,
    })
    .from(contentItems)
    .leftJoin(sources, eq(sources.id, contentItems.sourceId))
    .where(inventoryWhere)
    .orderBy(...contentItemsChronologicalOrder);
}

async function test1() {
  maybeGc();
  const baseline = mem('test1_baseline');

  let plateau = baseline;
  const calls: Array<{
    call: number;
    elapsedMs: number;
    itemCount: number;
    immediatelyAfter: MemSnap;
    afterSettle: MemSnap;
    deltaFromBaselineKb: number;
    deltaFromPriorPlateauKb: number;
  }> = [];

  for (let call = 1; call <= 3; call += 1) {
    const priorPlateau = plateau;
    const t0 = Date.now();
    let items = await loadIngestedInventoryItems();
    const elapsedMs = Date.now() - t0;
    const itemCount = items.length;
    const immediatelyAfter = mem(`test1_call${call}_after_load`);
    const afterSettle = await settle(`test1_call${call}_after_30s_gc`);
    plateau = afterSettle;

    const fromBaseline = immediatelyAfter.rssKb - baseline.rssKb;
    const fromPrior = immediatelyAfter.rssKb - priorPlateau.rssKb;
    const settleFromBaseline = afterSettle.rssKb - baseline.rssKb;
    const settleFromPrior = afterSettle.rssKb - priorPlateau.rssKb;

    calls.push({
      call,
      elapsedMs,
      itemCount,
      immediatelyAfter,
      afterSettle,
      deltaFromBaselineKb: fromBaseline,
      deltaFromPriorPlateauKb: fromPrior,
    });

    console.log(
      JSON.stringify({
        type: 'test1_call_summary',
        call,
        elapsedMs,
        itemCount,
        immediateRssDeltaFromBaselineKb: fromBaseline,
        immediateRssDeltaFromPriorPlateauKb: fromPrior,
        settleRssDeltaFromBaselineKb: settleFromBaseline,
        settleRssDeltaFromPriorPlateauKb: settleFromPrior,
        immediateHeapUsedDeltaKb: immediatelyAfter.heapUsedKb - priorPlateau.heapUsedKb,
        immediateExternalDeltaKb: immediatelyAfter.externalKb - priorPlateau.externalKb,
        immediateArrayBuffersDeltaKb: immediatelyAfter.arrayBuffersKb - priorPlateau.arrayBuffersKb,
      }),
    );

    items = [];
  }

  console.log(
    JSON.stringify({
      type: 'test1_result',
      baseline,
      calls: calls.map((c) => ({
        call: c.call,
        elapsedMs: c.elapsedMs,
        itemCount: c.itemCount,
        immediateRssDeltaFromBaselineKb: c.deltaFromBaselineKb,
        immediateRssDeltaFromPriorPlateauKb: c.deltaFromPriorPlateauKb,
        settleRssKb: c.afterSettle.rssKb,
      })),
    }),
  );
}

async function test2() {
  maybeGc();
  const baseline = mem('test2_baseline');

  const t0 = Date.now();
  const rows = await fetchProjectedInventoryRows();
  const fetchElapsedMs = Date.now() - t0;
  const afterFetch = mem('test2_after_db_fetch');
  delta(baseline, afterFetch, 'test2_db_fetch_from_baseline');

  const t1 = Date.now();
  const normalized = rows.map(({ sourceName, sourceType, ...item }) =>
    normalizeInventoryItem(item, sourceName, sourceType),
  );
  const normalizeElapsedMs = Date.now() - t1;
  const afterNormalize = mem('test2_after_normalize');
  delta(afterFetch, afterNormalize, 'test2_normalize_incremental');
  delta(baseline, afterNormalize, 'test2_fetch_plus_normalize_from_baseline');

  const afterSettle = await settle('test2_after_30s_gc');

  console.log(
    JSON.stringify({
      type: 'test2_result',
      rowCount: rows.length,
      normalizedCount: normalized.length,
      fetchElapsedMs,
      normalizeElapsedMs,
      dbFetchRssDeltaFromBaselineKb: afterFetch.rssKb - baseline.rssKb,
      normalizeRssDeltaFromFetchKb: afterNormalize.rssKb - afterFetch.rssKb,
      combinedRssDeltaFromBaselineKb: afterNormalize.rssKb - baseline.rssKb,
      dbFetchHeapUsedDeltaKb: afterFetch.heapUsedKb - baseline.heapUsedKb,
      normalizeHeapUsedDeltaKb: afterNormalize.heapUsedKb - afterFetch.heapUsedKb,
      dbFetchExternalDeltaKb: afterFetch.externalKb - baseline.externalKb,
      normalizeExternalDeltaKb: afterNormalize.externalKb - afterFetch.externalKb,
      settleRssDeltaFromBaselineKb: afterSettle.rssKb - baseline.rssKb,
    }),
  );
}

async function test3() {
  maybeGc();
  const baseline = mem('test3_baseline');

  await db.execute(sql`SELECT 1`);
  const afterSelect1 = mem('test3_after_select_1');
  delta(baseline, afterSelect1, 'test3_select1_immediate');

  const afterSettle = await settle('test3_after_30s_gc');
  delta(baseline, afterSettle, 'test3_select1_settle_from_baseline');

  maybeGc();
  const beforeTiny = mem('test3_before_tiny_row');
  await db
    .select({ id: contentItems.id })
    .from(contentItems)
    .where(isNotNull(contentItems.sourceId))
    .limit(1);
  const afterTiny = mem('test3_after_tiny_row');
  delta(beforeTiny, afterTiny, 'test3_tiny_row_incremental');

  const afterTinySettle = await settle('test3_tiny_row_after_30s_gc');

  console.log(
    JSON.stringify({
      type: 'test3_result',
      select1ImmediateRssDeltaKb: afterSelect1.rssKb - baseline.rssKb,
      select1SettleRssDeltaKb: afterSettle.rssKb - baseline.rssKb,
      tinyRowImmediateRssDeltaKb: afterTiny.rssKb - beforeTiny.rssKb,
      tinyRowSettleRssDeltaKb: afterTinySettle.rssKb - beforeTiny.rssKb,
    }),
  );
}

const mode = process.argv[2] ?? 'all';
if (mode === 'test1') await test1();
else if (mode === 'test2') await test2();
else if (mode === 'test3') await test3();
else {
  await test1();
  process.exit(0);
}
