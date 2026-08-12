/**
 * Read-only normalization hotspot audit — phased RSS + Intl/RegExp controls.
 *   NODE_OPTIONS='--expose-gc' pnpm exec tsx src/scripts/normalization-hotspot-audit.ts [phases|intl|regexp|count-intl]
 */
import { and, eq, isNotNull, not, or, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { contentItems, sources } from '../schema.js';
import { contentItemsChronologicalOrder } from '../content-order.js';
import { ingestedWithinRetentionWindow } from '../inventory/retention.js';
import { inventoryLoadContentItemSelect } from '../inventory/inventory-load-projection.js';
import { normalizeInventoryItem, type InventoryItem } from '../inventory/normalize.js';
import { sanitizeStaleTemporalProse } from '../creator-agent/stale-temporal-prose.js';
import { evaluateTemporalState } from '../creator-agent/temporal-state.js';
import { getLocalCalendarDay } from '../datetime.js';

type MemSnap = {
  label: string;
  rssKb: number;
  heapTotalKb: number;
  heapUsedKb: number;
  externalKb: number;
  arrayBuffersKb: number;
};

function snap(label: string): MemSnap {
  const m = process.memoryUsage();
  return {
    label,
    rssKb: Math.round(m.rss / 1024),
    heapTotalKb: Math.round(m.heapTotal / 1024),
    heapUsedKb: Math.round(m.heapUsed / 1024),
    externalKb: Math.round(m.external / 1024),
    arrayBuffersKb: Math.round(m.arrayBuffers / 1024),
  };
}

function logResult(payload: Record<string, unknown>) {
  console.log(JSON.stringify(payload));
}

function maybeGc() {
  if (typeof global.gc === 'function') global.gc();
}

type Row = Awaited<ReturnType<typeof fetchRows>>[number];

async function fetchRows() {
  return db
    .select({
      ...inventoryLoadContentItemSelect,
      sourceName: sources.name,
      sourceType: sources.type,
    })
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
    )
    .orderBy(...contentItemsChronologicalOrder);
}

function flattenMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const flat: Record<string, unknown> = { ...metadata };
  for (const value of Object.values(metadata)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (flat[k] === undefined) flat[k] = v;
      }
    }
  }
  return flat;
}

function runPhase(
  phase: string,
  rows: Row[],
  fn: (row: Row) => unknown,
): { elapsedMs: number; peak: MemSnap; baseline: MemSnap; after: MemSnap; rowCount: number } {
  const baseline = snap(`${phase}_baseline`);
  let peak = baseline;
  const t0 = Date.now();
  const out: unknown[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    out.push(fn(rows[i]!));
    if (i > 0 && i % 100 === 0) {
      const s = snap(`${phase}_row_${i}`);
      if (s.rssKb > peak.rssKb) peak = s;
    }
  }
  const after = snap(`${phase}_after`);
  if (after.rssKb > peak.rssKb) peak = after;
  return { elapsedMs: Date.now() - t0, peak, baseline, after, rowCount: rows.length };
}

function phaseA(row: Row) {
  const { sourceName, sourceType, ...item } = row;
  return {
    id: item.id,
    title: item.topic,
    state: item.state,
    sourceName,
    sourceType,
    eventDate: item.eventStartsAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
  };
}

function phaseB(row: Row) {
  const metadata = (row.metadata ?? {}) as Record<string, unknown>;
  const flat = flattenMetadata(metadata);
  const textBlob = [row.topic, row.hook, row.script, JSON.stringify(metadata)].filter(Boolean).join(' ');
  return { ...phaseA(row), metadata, flat, textBlobLen: textBlob.length };
}

const WORLD_CUP_RE =
  /\b(world cup|fifa|soccer capital|kickoff to the cup|sporting plaza|world cup 26|wc26)\b/i;

function phaseC(row: Row) {
  const b = phaseB(row);
  const textBlob = [row.topic, row.hook, row.script, JSON.stringify(row.metadata ?? {})]
    .filter(Boolean)
    .join(' ');
  const category =
    typeof b.flat.opportunityCategory === 'string' ? b.flat.opportunityCategory : null;
  return {
    category,
    worldCup: WORLD_CUP_RE.test(textBlob),
    reddit: row.sourceType === 'reddit',
    textBlobLen: textBlob.length,
  };
}

function phaseD(row: Row) {
  const metadata = (row.metadata ?? {}) as Record<string, unknown>;
  const flat = flattenMetadata(metadata);
  const tz =
    typeof flat.timezone === 'string'
      ? flat.timezone
      : typeof flat.timeZone === 'string'
        ? flat.timeZone
        : null;
  return evaluateTemporalState({
    startsAt: row.eventStartsAt,
    endsAt: row.eventEndsAt,
    timezone: tz,
  });
}

function phaseE(row: Row) {
  const metadata = (row.metadata ?? {}) as Record<string, unknown>;
  const flat = flattenMetadata(metadata);
  const rawSummary = row.script ?? row.hook;
  return sanitizeStaleTemporalProse({
    text: rawSummary,
    startsAt: row.eventStartsAt,
    endsAt: row.eventEndsAt,
    timezone:
      typeof flat.timezone === 'string'
        ? flat.timezone
        : typeof flat.timeZone === 'string'
          ? flat.timeZone
          : null,
  });
}

function phaseF(row: Row) {
  const e = phaseE(row);
  const metadata = (row.metadata ?? {}) as Record<string, unknown>;
  const flat = flattenMetadata(metadata);
  const venue = (typeof flat.venue === 'string' ? flat.venue : null) ?? row.locationName;
  return {
    summary: e.text,
    venue,
    locationName: row.locationName,
    googleMapsUrl: row.googleMapsUrl,
    sourceUrl: row.sourceUrl,
  };
}

function phaseG(row: Row) {
  const { sourceName, sourceType, ...item } = row;
  return normalizeInventoryItem(item, sourceName, sourceType);
}

const PHASES: Record<string, (row: Row) => unknown> = {
  A_scalar: phaseA,
  B_metadata_textBlob: phaseB,
  C_flags_regex: phaseC,
  D_temporal_evaluate: phaseD,
  E_summary_sanitize: phaseE,
  F_location_fields: phaseF,
  G_full_normalize: phaseG,
};

async function runPhases(single?: string) {
  maybeGc();
  const rows = await fetchRows();
  const fetchSnap = snap('after_fetch');

  const entries = single
    ? [[single, PHASES[single]!] as const].filter(([, fn]) => fn != null)
    : (Object.entries(PHASES) as [string, (row: Row) => unknown][]);

  for (const [name, fn] of entries) {
    maybeGc();
    const r = runPhase(name, rows, fn);
    logResult({
      type: 'phase_result',
      phase: name,
      rowCount: r.rowCount,
      elapsedMs: r.elapsedMs,
      baseline: r.baseline,
      afterFetchRssKb: fetchSnap.rssKb,
      after: r.after,
      peak: r.peak,
      rssDeltaKb: r.after.rssKb - r.baseline.rssKb,
      peakRssDeltaKb: r.peak.rssKb - r.baseline.rssKb,
      heapUsedDeltaKb: r.after.heapUsedKb - r.baseline.heapUsedKb,
      peakHeapUsedDeltaKb: r.peak.heapUsedKb - r.baseline.heapUsedKb,
    });
  }
}

// --- Intl control: current getLocalCalendarDay vs cached formatter ---

const intlFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getLocalCalendarDayCached(date: Date, timezone: string): string {
  let fmt = intlFormatterCache.get(timezone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    intlFormatterCache.set(timezone, fmt);
  }
  return fmt.format(date);
}

function endOfLocalDayKeyCached(dayKey: string, timezone: string): Date {
  const anchor = Date.parse(`${dayKey}T12:00:00.000Z`);
  let lo = anchor - 14 * 3_600_000;
  let hi = anchor + 36 * 3_600_000;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (getLocalCalendarDayCached(new Date(mid), timezone) <= dayKey) lo = mid;
    else hi = mid;
  }
  return new Date(lo);
}

function evaluateTemporalStateCachedIntl(row: Row) {
  const metadata = (row.metadata ?? {}) as Record<string, unknown>;
  const flat = flattenMetadata(metadata);
  const tz =
    typeof flat.timezone === 'string'
      ? flat.timezone
      : typeof flat.timeZone === 'string'
        ? flat.timeZone
        : 'America/Chicago';
  const starts = row.eventStartsAt;
  const ends = row.eventEndsAt;
  if (!starts && !ends) return 'unknown';
  const endsDate = ends ?? starts!;
  const dayKey = endsDate.toISOString().slice(0, 10);
  endOfLocalDayKeyCached(dayKey, tz);
  return dayKey;
}

async function runIntlControl() {
  maybeGc();
  const rows = await fetchRows();
  const baseline = snap('intl_baseline');

  const t0 = Date.now();
  let peak = baseline;
  for (let i = 0; i < rows.length; i += 1) {
    evaluateTemporalState({
      startsAt: rows[i]!.eventStartsAt,
      endsAt: rows[i]!.eventEndsAt,
      timezone: 'America/Chicago',
    });
    if (i > 0 && i % 100 === 0) {
      const s = snap(`intl_current_row_${i}`);
      if (s.rssKb > peak.rssKb) peak = s;
    }
  }
  const currentAfter = snap('intl_current_after');
  if (currentAfter.rssKb > peak.rssKb) peak = currentAfter;
  const currentPeak = peak;
  const currentElapsed = Date.now() - t0;

  maybeGc();
  await new Promise((r) => setTimeout(r, 5000));
  const cachedBaseline = snap('intl_cached_baseline');

  t0;
  const t1 = Date.now();
  peak = cachedBaseline;
  for (let i = 0; i < rows.length; i += 1) {
    evaluateTemporalStateCachedIntl(rows[i]!);
    if (i > 0 && i % 100 === 0) {
      const s = snap(`intl_cached_row_${i}`);
      if (s.rssKb > peak.rssKb) peak = s;
    }
  }
  const cachedAfter = snap('intl_cached_after');
  if (cachedAfter.rssKb > peak.rssKb) peak = cachedAfter;

  logResult({
    type: 'intl_control',
    rowCount: rows.length,
    current: {
      elapsedMs: currentElapsed,
      peakRssDeltaKb: currentPeak.rssKb - baseline.rssKb,
      afterRssDeltaKb: currentAfter.rssKb - baseline.rssKb,
      peak,
    },
    cached: {
      elapsedMs: Date.now() - t1,
      peakRssDeltaKb: peak.rssKb - cachedBaseline.rssKb,
      afterRssDeltaKb: cachedAfter.rssKb - cachedBaseline.rssKb,
    },
    reductionPct:
      currentPeak.rssKb - baseline.rssKb > 0
        ? ((currentPeak.rssKb - baseline.rssKb - (peak.rssKb - cachedBaseline.rssKb)) /
            (currentPeak.rssKb - baseline.rssKb)) *
          100
        : 0,
  });
}

async function countIntlPerRow() {
  const rows = await fetchRows();
  let totalCalls = 0;
  let rowsWithDates = 0;
  const sample = rows.slice(0, 20);
  const original = getLocalCalendarDay;
  (globalThis as { __intlCount?: number }).__intlCount = 0;
  // Patch via counting wrapper in diagnostic only
  const { getLocalCalendarDay: g } = await import('../datetime.js');
  let callCount = 0;
  const proxyDay = (date: Date, tz?: string) => {
    callCount += 1;
    return g(date, tz);
  };

  for (const row of sample) {
    callCount = 0;
    evaluateTemporalState({
      startsAt: row.eventStartsAt,
      endsAt: row.eventEndsAt,
      timezone: 'America/Chicago',
    });
    sanitizeStaleTemporalProse({
      text: row.script ?? row.hook,
      startsAt: row.eventStartsAt,
      endsAt: row.eventEndsAt,
      timezone: 'America/Chicago',
    });
    // Count by re-invoking temporal path with manual tracking
    let inner = 0;
    const trackG = (date: Date, timezone = 'America/Chicago') => {
      inner += 1;
      return original(date, timezone);
    };
    // approximate: call evaluateTemporalState internals count via direct simulation
    totalCalls += inner;
    if (row.eventStartsAt || row.eventEndsAt) rowsWithDates += 1;
  }

  // Direct measurement: monkey-patch Intl.DateTimeFormat constructor
  let intlConstructs = 0;
  const OrigIntl = Intl.DateTimeFormat;
  (Intl as unknown as { DateTimeFormat: typeof Intl.DateTimeFormat }).DateTimeFormat = function (
    ...args: ConstructorParameters<typeof Intl.DateTimeFormat>
  ) {
    intlConstructs += 1;
    return new OrigIntl(...args);
  } as typeof Intl.DateTimeFormat;
  Object.setPrototypeOf(Intl.DateTimeFormat, OrigIntl);
  Intl.DateTimeFormat.prototype = OrigIntl.prototype;
  Intl.DateTimeFormat.supportedLocalesOf = OrigIntl.supportedLocalesOf;

  intlConstructs = 0;
  for (const row of rows) {
    sanitizeStaleTemporalProse({
      text: row.script ?? row.hook,
      startsAt: row.eventStartsAt,
      endsAt: row.eventEndsAt,
      timezone: 'America/Chicago',
    });
  }

  logResult({
    type: 'intl_count',
    rowCount: rows.length,
    intlDateTimeFormatConstructsFullRun: intlConstructs,
    perRowAvg: intlConstructs / rows.length,
  });

  // Restore
  (Intl as unknown as { DateTimeFormat: typeof Intl.DateTimeFormat }).DateTimeFormat = OrigIntl;
}

async function runRegexpControl() {
  maybeGc();
  const rows = await fetchRows();
  const baseline = snap('regexp_baseline');
  let peak = baseline;
  const t0 = Date.now();
  for (let i = 0; i < rows.length; i += 1) {
    phaseE(rows[i]!);
    if (i > 0 && i % 100 === 0) {
      const s = snap(`regexp_current_${i}`);
      if (s.rssKb > peak.rssKb) peak = s;
    }
  }
  const currentAfter = snap('regexp_current_after');
  if (currentAfter.rssKb > peak.rssKb) peak = currentAfter;

  logResult({
    type: 'regexp_control_note',
    message: 'sanitizeStaleTemporalProse creates 2 RegExp per parseLatestExplicitDateInText call; module-level hoist not tested separately — see intl_count for dominant signal',
    peakRssDeltaKb: peak.rssKb - baseline.rssKb,
    elapsedMs: Date.now() - t0,
    rowCount: rows.length,
  });
}

const mode = process.argv[2] ?? 'phases';
const phaseArg = process.argv[3];
if (mode === 'phases') await runPhases(phaseArg);
else if (mode === 'intl') await runIntlControl();
else if (mode === 'count-intl') await countIntlPerRow();
else if (mode === 'regexp') await runRegexpControl();
else {
  console.error('Usage: normalization-hotspot-audit.ts [phases [PHASE_NAME]|intl|count-intl|regexp]');
  process.exit(1);
}
