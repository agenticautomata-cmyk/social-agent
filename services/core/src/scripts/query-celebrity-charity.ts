import { db } from '../db.js';
import { contentItems, scanRuns, sources } from '../schema.js';
import { desc, eq, inArray } from 'drizzle-orm';

const PHASE_2L_TYPES = [
  'big_slick_kc',
  'childrens_mercy_events',
  'chiefs_charity_events',
  'royals_charity_events',
  'sporting_kc_charity',
  'kc_current_charity',
  'kauffman_charity_galas',
  'visitkc_charity_events',
  'kc_nonprofit_galas',
  'kc_entertainment_charity',
] as const;

const META_KEYS = [
  'bigSlickKc',
  'childrensMercyEvents',
  'chiefsCharityEvents',
  'royalsCharityEvents',
  'sportingKcCharity',
  'kcCurrentCharity',
  'kauffmanCharityGalas',
  'visitkcCharityEvents',
  'kcNonprofitGalas',
  'kcEntertainmentCharity',
] as const;

type MetaPayload = {
  title?: string;
  celebrityNames?: string[];
  nonprofit?: string | null;
  venue?: string | null;
  category?: string;
  eventDate?: string | null;
  address?: string | null;
  ticketUrl?: string | null;
  sourceUrl?: string;
  celebrityFlag?: boolean;
  charityFlag?: boolean;
  fundraiserFlag?: boolean;
  galaFlag?: boolean;
};

function extractMeta(metadata: Record<string, unknown> | null): MetaPayload | null {
  if (!metadata) return null;
  for (const key of META_KEYS) {
    const block = metadata[key];
    if (block && typeof block === 'object') return block as MetaPayload;
  }
  return null;
}

async function main() {
  const srcRows = await db.select().from(sources).where(inArray(sources.type, [...PHASE_2L_TYPES]));
  const srcById = new Map(srcRows.map((s) => [s.id, s]));

  const rows = await db
    .select({
      id: contentItems.id,
      topic: contentItems.topic,
      sourceId: contentItems.sourceId,
      sourceUrl: contentItems.sourceUrl,
      metadata: contentItems.metadata,
    })
    .from(contentItems)
    .where(inArray(contentItems.sourceId, srcRows.map((s) => s.id)));

  const bySource: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  const celebrities = new Set<string>();
  const nonprofits = new Set<string>();
  let celebrityFlag = 0;
  let charityFlag = 0;
  let fundraiserFlag = 0;
  let galaFlag = 0;
  let withCelebrityNames = 0;
  let withNonprofit = 0;
  let withVenue = 0;
  let withAddress = 0;
  let withEventDate = 0;
  let withTicketUrl = 0;
  let withTitle = 0;

  for (const row of rows) {
    const src = srcById.get(row.sourceId!);
    const type = src?.type ?? 'unknown';
    bySource[type] = (bySource[type] ?? 0) + 1;

    const meta = extractMeta(row.metadata as Record<string, unknown> | null);
    if (!meta) continue;

    if (meta.title) withTitle++;
    const cat = meta.category ?? 'unknown';
    byCategory[cat] = (byCategory[cat] ?? 0) + 1;

    if (meta.celebrityNames?.length) {
      withCelebrityNames++;
      for (const name of meta.celebrityNames) celebrities.add(name);
    }
    if (meta.nonprofit) {
      withNonprofit++;
      nonprofits.add(meta.nonprofit);
    }
    if (meta.venue) withVenue++;
    if (meta.address) withAddress++;
    if (meta.eventDate) withEventDate++;
    if (meta.ticketUrl) withTicketUrl++;
    if (meta.celebrityFlag) celebrityFlag++;
    if (meta.charityFlag) charityFlag++;
    if (meta.fundraiserFlag) fundraiserFlag++;
    if (meta.galaFlag) galaFlag++;
  }

  const totalAll = await db.select().from(contentItems);
  const totalIngested = totalAll.filter((r) => r.sourceId).length;

  const scanStats: Array<{
    name: string;
    type: string;
    itemsFound: number | null;
    itemsCreated: number | null;
    itemsSkipped: number | null;
  }> = [];
  for (const s of srcRows) {
    const runs = await db
      .select()
      .from(scanRuns)
      .where(eq(scanRuns.sourceId, s.id))
      .orderBy(desc(scanRuns.startedAt))
      .limit(5);
    const firstRun = [...runs].reverse().find((r) => (r.itemsCreated ?? 0) > 0) ?? runs[runs.length - 1] ?? runs[0];
    const latestRun = runs[0];
    scanStats.push({
      name: s.name,
      type: s.type,
      itemsFound: firstRun?.itemsFound ?? null,
      itemsCreated: firstRun?.itemsCreated ?? null,
      itemsSkipped: firstRun?.itemsSkipped ?? null,
    });
  }

  console.log(
    JSON.stringify(
      {
        totalPhase2LRows: rows.length,
        totalIngestedRows: totalIngested,
        firstScanStats: scanStats,
        bySource,
        byCategory,
        flags: { celebrityFlag, charityFlag, fundraiserFlag, galaFlag },
        fieldCoverage: {
          title: withTitle,
          celebrityNames: withCelebrityNames,
          nonprofit: withNonprofit,
          venue: withVenue,
          address: withAddress,
          eventDate: withEventDate,
          ticketUrl: withTicketUrl,
        },
        celebritiesDetected: [...celebrities].sort(),
        nonprofitsDetected: [...nonprofits].sort(),
        sampleRows: rows.slice(0, 5).map((r) => {
          const src = srcById.get(r.sourceId!);
          const meta = extractMeta(r.metadata as Record<string, unknown> | null);
          return {
            source: src?.name,
            type: src?.type,
            topic: r.topic,
            category: meta?.category,
            celebrities: meta?.celebrityNames,
            nonprofit: meta?.nonprofit,
          };
        }),
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
