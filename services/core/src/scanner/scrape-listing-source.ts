import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { scanRuns, sources, type Source } from '../schema.js';
import { scrapeListingUrl } from '../ask-benson/scrape-listing.js';
import { parseScrapeListingConfig } from '../ask-benson/listing-extract.js';
import { tallyIngestOutcome, type IngestPersistOutcome } from './ingest-persist.js';
import type { ScanSourceResult } from './types.js';

export async function scanScrapeListingSource(source: Source): Promise<ScanSourceResult> {
  const config = parseScrapeListingConfig(source.config);
  const [run] = await db
    .insert(scanRuns)
    .values({
      sourceId: source.id,
      campaignId: source.campaignId,
      status: 'running',
    })
    .returning({ id: scanRuns.id });

  let itemsFound = 0;
  const ingestCounts = { created: 0, updated: 0, skipped: 0 };
  let error: string | undefined;

  try {
    const result = await scrapeListingUrl({
      listingUrl: config.listingUrl,
      campaignId: source.campaignId,
      sourceId: source.id,
      ingest: config.discountWatch ? 'discount_watch' : 'scrape_listing',
      webResearchLimit: config.discountWatch ? 1 : 0,
      hookPrefix: config.discountWatch
        ? `Discount watch — ${source.name}`
        : `Recurring scrape — ${source.name}`,
      discountWatch: config.discountWatch,
      defaultCategory: config.opportunityCategory,
    });

    itemsFound = result.extractedCount;
    for (const item of result.items) {
      const outcome: IngestPersistOutcome =
        item.outcome === 'created' ? 'created' : 'updated';
      tallyIngestOutcome(outcome, ingestCounts);
    }

    await db
      .update(sources)
      .set({ lastScanAt: new Date(), lastError: null, updatedAt: new Date() })
      .where(eq(sources.id, source.id));
    await db
      .update(scanRuns)
      .set({
        status: 'success',
        finishedAt: new Date(),
        itemsFound,
        itemsCreated: ingestCounts.created,
        itemsSkipped: ingestCounts.skipped,
        payload: { format: 'scrape', listingUrl: config.listingUrl, ingest: 'scrape_listing' },
      })
      .where(eq(scanRuns.id, run!.id));
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    await db
      .update(sources)
      .set({ lastError: error, updatedAt: new Date() })
      .where(eq(sources.id, source.id));
    await db
      .update(scanRuns)
      .set({
        status: 'failed',
        finishedAt: new Date(),
        itemsFound,
        itemsCreated: ingestCounts.created,
        itemsSkipped: ingestCounts.skipped,
        error,
      })
      .where(eq(scanRuns.id, run!.id));
  }

  return {
    sourceId: source.id,
    scanRunId: run!.id,
    itemsFound,
    itemsCreated: ingestCounts.created,
    itemsUpdated: ingestCounts.updated,
    itemsSkipped: ingestCounts.skipped,
    error,
  };
}
