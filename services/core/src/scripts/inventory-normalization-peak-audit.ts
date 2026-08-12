/**
 * Diagnostic — normalization peak memory (variants A/B/C).
 *   NODE_OPTIONS='--expose-gc' pnpm exec tsx src/scripts/inventory-normalization-peak-audit.ts [a|b|c]
 *
 * Fresh process per variant. Variant A writes /tmp/benson-inv-norm-peak-ref.json;
 * B/C compare eligible output against that reference.
 */
import { and, eq, isNotNull, not, or, sql } from 'drizzle-orm';
import { readFileSync, writeFileSync } from 'node:fs';
import { db } from '../db.js';
import { contentItems, sources } from '../schema.js';
import { contentItemsChronologicalOrder } from '../content-order.js';
import { ingestedWithinRetentionWindow } from '../inventory/retention.js';
import { inventoryLoadContentItemSelect } from '../inventory/inventory-load-projection.js';
import { normalizeInventoryItem, type InventoryItem } from '../inventory/normalize.js';
import {
  isAudienceFreshContent,
  isKcSippsRoundup,
  contentPublishedAt,
} from '../inventory/content-freshness.js';
import {
  inventoryItemIsCreatorFacing,
  filterCreatorFacingRecords,
} from '../creator-agent/filters.js';
import { loadSkippedContentIdsForItems } from '../creator-skip/index.js';

const REF_PATH = '/tmp/benson-inv-norm-peak-ref.json';
const SAMPLE_EVERY = 50;
const CHUNK_SIZE = 100;

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

type FetchedRow = Awaited<ReturnType<typeof fetchProjectedInventoryRows>>[number];

function snapshot(label: string): MemSnap {
  const m = process.memoryUsage();
  return {
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
}

function logMem(snap: MemSnap) {
  console.log(JSON.stringify({ type: 'mem', ...snap }));
}

function maybeGc() {
  if (typeof global.gc === 'function') global.gc();
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

class PeakTracker {
  readonly baseline: MemSnap;
  peak: MemSnap;
  samples: MemSnap[] = [];

  constructor(baseline: MemSnap) {
    this.baseline = baseline;
    this.peak = baseline;
  }

  sample(label: string, log = false): MemSnap {
    const snap = snapshot(label);
    this.samples.push(snap);
    if (snap.rss > this.peak.rss) this.peak = snap;
    if (log) logMem(snap);
    return snap;
  }

  peakDeltaKb() {
    return this.peak.rssKb - this.baseline.rssKb;
  }
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

async function filterSkippedInventoryItems<T extends InventoryItem>(items: T[]): Promise<T[]> {
  if (items.length === 0) return items;
  const skippedIds = await loadSkippedContentIdsForItems(items).catch(() => new Set<string>());
  if (skippedIds.size === 0) return items;
  return items.filter((item) => !skippedIds.has(item.id));
}

async function applyEligibilityPipeline(normalized: InventoryItem[]): Promise<InventoryItem[]> {
  const audienceFresh = normalized.filter((item) => {
    if (!inventoryItemIsCreatorFacing(item)) return false;
    if (isKcSippsRoundup(item)) {
      const published = contentPublishedAt(item);
      if (!published) return false;
      const ageDays = (Date.now() - published.getTime()) / (24 * 60 * 60 * 1000);
      if (ageDays > 21) return false;
    }
    return isAudienceFreshContent(item);
  });
  return filterSkippedInventoryItems(await filterCreatorFacingRecords(audienceFresh));
}

function normalizeRow(row: FetchedRow): InventoryItem {
  const { sourceName, sourceType, ...item } = row;
  return normalizeInventoryItem(item, sourceName, sourceType);
}

function variantA(rows: FetchedRow[], tracker: PeakTracker) {
  const normalized: InventoryItem[] = new Array(rows.length);
  const t0 = Date.now();
  for (let i = 0; i < rows.length; i += 1) {
    normalized[i] = normalizeRow(rows[i]!);
    if (i > 0 && i % SAMPLE_EVERY === 0) tracker.sample(`a_normalize_row_${i}`, true);
  }
  tracker.sample('a_normalize_complete', true);
  return { normalized, normalizeElapsedMs: Date.now() - t0 };
}

function variantB(rows: FetchedRow[], tracker: PeakTracker) {
  const normalized: InventoryItem[] = new Array(rows.length);
  const t0 = Date.now();
  for (let i = 0; i < rows.length; i += 1) {
    normalized[i] = normalizeRow(rows[i]!);
    (rows as Array<FetchedRow | undefined>)[i] = undefined;
    if (i > 0 && i % SAMPLE_EVERY === 0) tracker.sample(`b_normalize_row_${i}`, true);
  }
  tracker.sample('b_normalize_complete', true);
  return { normalized, normalizeElapsedMs: Date.now() - t0 };
}

function variantC(rows: FetchedRow[], tracker: PeakTracker) {
  const normalized: InventoryItem[] = [];
  const t0 = Date.now();
  for (let start = 0; start < rows.length; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE, rows.length);
    for (let i = start; i < end; i += 1) {
      normalized.push(normalizeRow(rows[i]!));
      (rows as Array<FetchedRow | undefined>)[i] = undefined;
    }
    tracker.sample(`c_chunk_end_${end}`, true);
    maybeGc();
  }
  tracker.sample('c_normalize_complete', true);
  return { normalized, normalizeElapsedMs: Date.now() - t0 };
}

/** Variant D — same as C but no global.gc() between chunks. */
function variantD(rows: FetchedRow[], tracker: PeakTracker) {
  const normalized: InventoryItem[] = [];
  const t0 = Date.now();
  for (let start = 0; start < rows.length; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE, rows.length);
    for (let i = start; i < end; i += 1) {
      normalized.push(normalizeRow(rows[i]!));
      (rows as Array<FetchedRow | undefined>)[i] = undefined;
    }
    tracker.sample(`d_chunk_end_${end}`, true);
  }
  tracker.sample('d_normalize_complete', true);
  return { normalized, normalizeElapsedMs: Date.now() - t0 };
}

function outputSignature(items: InventoryItem[]) {
  return {
    eligibleCount: items.length,
    ids: items.map((i) => i.id),
    items,
  };
}

function compareToRef(variant: string, eligible: InventoryItem[]) {
  const sig = outputSignature(eligible);
  if (variant === 'a') {
    writeFileSync(REF_PATH, JSON.stringify(sig));
    return { ok: true, message: 'reference written' };
  }
  const ref = JSON.parse(readFileSync(REF_PATH, 'utf8')) as {
    eligibleCount: number;
    ids: string[];
    items: InventoryItem[];
  };
  const idsMatch = JSON.stringify(sig.ids) === JSON.stringify(ref.ids);
  const countMatch = sig.eligibleCount === ref.eligibleCount;
  const deepMatch = JSON.stringify(sig.items) === JSON.stringify(ref.items);
  return {
    ok: idsMatch && countMatch && deepMatch,
    idsMatch,
    countMatch,
    deepMatch,
    refCount: ref.eligibleCount,
    gotCount: sig.eligibleCount,
  };
}

async function runVariant(variant: 'a' | 'b' | 'c' | 'd') {
  maybeGc();
  const baseline = snapshot(`${variant}_baseline`);
  logMem(baseline);
  const tracker = new PeakTracker(baseline);

  const fetchStart = Date.now();
  const rows = await fetchProjectedInventoryRows();
  const fetchElapsedMs = Date.now() - fetchStart;
  const afterFetch = tracker.sample(`${variant}_after_fetch`, true);

  const normalizeFn =
    variant === 'a'
      ? variantA
      : variant === 'b'
        ? variantB
        : variant === 'c'
          ? variantC
          : variantD;
  const { normalized, normalizeElapsedMs } = normalizeFn(rows, tracker);

  const pipelineStart = Date.now();
  const eligible = await applyEligibilityPipeline(normalized);
  const pipelineElapsedMs = Date.now() - pipelineStart;

  const atCompletion = tracker.sample(`${variant}_at_completion`, true);
  await sleep(30_000);
  maybeGc();
  const afterSettle = snapshot(`${variant}_after_30s_gc`);
  logMem(afterSettle);

  const correctness = compareToRef(variant, eligible);

  const result = {
    type: 'variant_result',
    variant: variant.toUpperCase(),
    rowCount: normalized.length,
    eligibleCount: eligible.length,
    fetchElapsedMs,
    normalizeElapsedMs,
    pipelineElapsedMs,
    totalElapsedMs: fetchElapsedMs + normalizeElapsedMs + pipelineElapsedMs,
    baseline,
    afterFetch,
    peakDuringNormalization: tracker.peak,
    peakRssDeltaKb: tracker.peakDeltaKb(),
    peakRssDeltaFromFetchKb: tracker.peak.rssKb - afterFetch.rssKb,
    atCompletion,
    completionRssDeltaKb: atCompletion.rssKb - baseline.rssKb,
    settledRssDeltaKb: afterSettle.rssKb - baseline.rssKb,
    peakHeapUsedDeltaKb: tracker.peak.heapUsedKb - baseline.heapUsedKb,
    peakExternalDeltaKb: tracker.peak.externalKb - baseline.externalKb,
    peakArrayBuffersDeltaKb: tracker.peak.arrayBuffersKb - baseline.arrayBuffersKb,
    correctness,
    sampleCount: tracker.samples.length,
  };
  console.log(JSON.stringify(result, null, 2));
}

const mode = (process.argv[2] ?? 'a').toLowerCase();
if (mode === 'a' || mode === 'b' || mode === 'c' || mode === 'd') {
  await runVariant(mode);
} else {
  console.error('Usage: inventory-normalization-peak-audit.ts [a|b|c|d]');
  process.exit(1);
}
