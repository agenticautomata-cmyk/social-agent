/**
 * Read-only memory split audit — inventory vs sponsor intel.
 *   NODE_OPTIONS='--expose-gc' pnpm exec tsx src/scripts/home-memory-split-audit.ts [test1|test2|fields]
 */
import { loadIngestedInventoryItems } from '../inventory/load-ingested.js';
import { computeSponsorIntelligence } from '../sponsor-intelligence/recommendations.js';
import { db } from '../db.js';
import { contentItems, sources } from '../schema.js';
import { and, eq, isNotNull, not, or, sql } from 'drizzle-orm';
import { ingestedWithinRetentionWindow } from '../inventory/retention.js';

function mem(label: string) {
  const m = process.memoryUsage();
  const snap = {
    label,
    time: new Date().toISOString(),
    rssKb: Math.round(m.rss / 1024),
    heapUsedKb: Math.round(m.heapUsed / 1024),
    heapTotalKb: Math.round(m.heapTotal / 1024),
    externalKb: Math.round(m.external / 1024),
    arrayBuffersKb: Math.round(m.arrayBuffers / 1024),
  };
  console.log(JSON.stringify({ type: 'mem', ...snap }));
  return snap;
}

function maybeGc() {
  if (typeof global.gc === 'function') global.gc();
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function countDbRows() {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contentItems)
    .leftJoin(sources, eq(sources.id, contentItems.sourceId))
    .where(
      and(
        isNotNull(contentItems.sourceId),
        or(isNotNull(contentItems.sourceExternalId), isNotNull(contentItems.sourceUrl)),
        not(sql`${contentItems.sourceExternalId} LIKE 'mock_%'`),
        not(sql`COALESCE(${contentItems.sourceUrl}, '') LIKE '%/comments/mock%'`),
        ingestedWithinRetentionWindow(),
      ),
    );
  return count;
}

function estimateInventoryBytes(items: Awaited<ReturnType<typeof loadIngestedInventoryItems>>) {
  let metadataJson = 0;
  let summary = 0;
  let title = 0;
  let whyItMatters = 0;
  for (const item of items) {
    metadataJson += JSON.stringify(item.metadata ?? {}).length;
    summary += (item.summary ?? '').length + (item.summaryRaw ?? '').length;
    title += item.title.length;
    whyItMatters += item.whyItMatters.length;
  }
  return {
    itemCount: items.length,
    metadataJsonBytes: metadataJson,
    summaryBytes: summary,
    titleBytes: title,
    whyItMattersBytes: whyItMatters,
    approxTotalTrackedBytes: metadataJson + summary + title + whyItMatters,
  };
}

async function test1() {
  maybeGc();
  const baseline = mem('test1_baseline');
  const t0 = Date.now();
  const items = await loadIngestedInventoryItems();
  const dbRows = await countDbRows();
  const elapsedMs = Date.now() - t0;
  const after = mem('test1_after_load');
  const shape = estimateInventoryBytes(items);
  console.log(
    JSON.stringify({
      type: 'test1_result',
      dbRowsScannedApprox: dbRows,
      eligibleInventoryCount: items.length,
      elapsedMs,
      shape,
      rssDeltaKb: after.rssKb - baseline.rssKb,
      heapUsedDeltaKb: after.heapUsedKb - baseline.heapUsedKb,
    }),
  );
  await sleep(30_000);
  maybeGc();
  const after30 = mem('test1_after_30s');
  console.log(
    JSON.stringify({
      type: 'test1_after_30s',
      rssDeltaFromBaselineKb: after30.rssKb - baseline.rssKb,
      heapUsedDeltaFromBaselineKb: after30.heapUsedKb - baseline.heapUsedKb,
    }),
  );
}

async function test2() {
  maybeGc();
  const baseline = mem('test2_baseline');
  const loadStart = Date.now();
  const inventory = await loadIngestedInventoryItems();
  const afterInventory = mem('test2_after_inventory');
  console.log(
    JSON.stringify({
      type: 'test2_inventory',
      eligibleInventoryCount: inventory.length,
      loadElapsedMs: Date.now() - loadStart,
      rssDeltaFromBaselineKb: afterInventory.rssKb - baseline.rssKb,
      heapUsedDeltaFromBaselineKb: afterInventory.heapUsedKb - baseline.heapUsedKb,
    }),
  );

  maybeGc();
  const beforeIntel = mem('test2_before_intel');
  const intelStart = Date.now();
  const intel = await computeSponsorIntelligence(inventory, { limit: 50 });
  const afterIntel = mem('test2_after_intel');
  let recommendationCount = 0;
  for (const section of intel.sections) recommendationCount += section.items.length;

  console.log(
    JSON.stringify({
      type: 'test2_intel',
      intelElapsedMs: Date.now() - intelStart,
      totalEligible: intel.counts.totalEligible,
      recommendationCount,
      sectionCount: intel.sections.length,
      rssDeltaFromInventoryKb: afterIntel.rssKb - afterInventory.rssKb,
      heapUsedDeltaFromInventoryKb: afterIntel.heapUsedKb - afterInventory.heapUsedKb,
      rssDeltaFromBaselineKb: afterIntel.rssKb - baseline.rssKb,
      heapUsedDeltaFromBaselineKb: afterIntel.heapUsedKb - baseline.heapUsedKb,
    }),
  );

  await sleep(30_000);
  maybeGc();
  const after30 = mem('test2_after_30s');
  console.log(
    JSON.stringify({
      type: 'test2_after_30s',
      rssDeltaFromBaselineKb: after30.rssKb - baseline.rssKb,
      incrementalIntelRssKb: after30.rssKb - afterInventory.rssKb,
    }),
  );
}

async function fieldStats() {
  const rows = await db.execute(sql`
    SELECT
      count(*)::int AS row_count,
      coalesce(sum(pg_column_size(metadata)), 0)::bigint AS metadata_bytes,
      coalesce(sum(pg_column_size(raw_payload)), 0)::bigint AS raw_payload_bytes,
      coalesce(sum(pg_column_size(script)), 0)::bigint AS script_bytes,
      coalesce(sum(pg_column_size(hook)), 0)::bigint AS hook_bytes,
      coalesce(sum(pg_column_size(topic)), 0)::bigint AS topic_bytes,
      coalesce(sum(pg_column_size(location_candidates)), 0)::bigint AS location_candidates_bytes,
      coalesce(avg(pg_column_size(metadata)), 0)::int AS metadata_avg,
      coalesce(avg(pg_column_size(raw_payload)), 0)::int AS raw_payload_avg,
      coalesce(avg(pg_column_size(script)), 0)::int AS script_avg,
      coalesce(max(pg_column_size(raw_payload)), 0)::int AS raw_payload_max,
      coalesce(max(pg_column_size(metadata)), 0)::int AS metadata_max
    FROM content_items
    WHERE source_id IS NOT NULL
      AND (source_external_id IS NOT NULL OR source_url IS NOT NULL)
      AND source_external_id NOT LIKE 'mock_%'
      AND coalesce(source_url, '') NOT LIKE '%/comments/mock%'
  `);
  console.log(JSON.stringify({ type: 'field_stats', rows: rows.rows[0] }, null, 2));
}

const mode = process.argv[2] ?? 'all';
if (mode === 'test1') await test1();
else if (mode === 'test2') await test2();
else if (mode === 'fields') await fieldStats();
else {
  await fieldStats();
  await test1();
  process.exit(0); // test2 needs fresh process — run separately
}
