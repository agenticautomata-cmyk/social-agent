import { and, eq, gte } from 'drizzle-orm';
import { db } from '../db.js';
import { llmUsageEvents } from '../schema.js';

const waveId = process.argv[2] ?? 'refresh-2026-08-11T12:23:11.304Z';
const since = new Date('2026-08-11T12:22:00Z');

const rows = await db
  .select({
    createdAt: llmUsageEvents.createdAt,
    estimatedCost: llmUsageEvents.estimatedCost,
    metadata: llmUsageEvents.metadata,
  })
  .from(llmUsageEvents)
  .where(and(gte(llmUsageEvents.createdAt, since), eq(llmUsageEvents.source, 'web_search')));

const scrape = rows.filter((r) => (r.metadata as Record<string, unknown>)?.caller === 'scrape_listing');
const byWave: Record<string, number> = {};
for (const r of scrape) {
  const w = String((r.metadata as Record<string, unknown>)?.refreshWaveId ?? 'none');
  byWave[w] = (byWave[w] ?? 0) + 1;
}

const waveRows = scrape.filter(
  (r) => (r.metadata as Record<string, unknown>)?.refreshWaveId === waveId,
);

console.log(
  JSON.stringify(
    {
      waveId,
      totalWebSearchSinceDeploy: rows.length,
      scrapeCallerTotal: scrape.length,
      byWave,
      waveRowCount: waveRows.length,
      waveCost: waveRows.reduce((s, r) => s + Number(r.estimatedCost ?? 0), 0),
      listingUrls: waveRows.map((r) => (r.metadata as Record<string, unknown>).listingUrl),
    },
    null,
    2,
  ),
);
