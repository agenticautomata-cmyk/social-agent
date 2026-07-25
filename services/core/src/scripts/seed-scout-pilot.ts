import { seedDefaultWatchers } from '../early-signals/seed-watchers.js';
import { ACTIVE_KC_SOURCES } from '../early-signals/source-catalog.js';
import { db } from '../db.js';
import { sourceWatchers } from '../schema.js';
import { eq } from 'drizzle-orm';
import { inspectSubmittedUrl } from '../benson-scout/url-inspect.js';

/**
 * Seeds KC pilot sources with Scout watchlist metadata.
 * Reuses researched ACTIVE_KC_SOURCES from Early Signals catalog.
 */
async function enrichScoutMetadata(): Promise<number> {
  let enriched = 0;
  for (const source of ACTIVE_KC_SOURCES) {
    let inspect;
    try {
      inspect = inspectSubmittedUrl(source.sourceUrl);
    } catch {
      continue;
    }

    const updated = await db
      .update(sourceWatchers)
      .set({
        submittedUrl: source.sourceUrl,
        canonicalSourceUrl: inspect.canonicalUrl,
        publisherUrl: inspect.publisherUrl,
        platform: inspect.platform,
        monitoringMode:
          source.adapterType === 'rss_feed'
            ? 'WATCH_FEED'
            : source.adapterType === 'socrata_json'
              ? 'WATCH_PUBLISHER'
              : 'WATCH_PAGE',
        jurisdiction: source.jurisdiction,
        sourceReliability: String(source.reliabilityScore),
        creatorLeadPotential: String(Math.min(0.95, source.reliabilityScore + 0.05)),
        approvalStatus: 'approved',
        createdBy: 'scout-pilot-seed',
        updatedAt: new Date(),
      })
      .where(eq(sourceWatchers.sourceUrl, source.sourceUrl))
      .returning({ id: sourceWatchers.id });

    if (updated.length) enriched += 1;
  }
  return enriched;
}

const seed = await seedDefaultWatchers();
const enriched = await enrichScoutMetadata();

console.log('Scout pilot seed complete:', {
  watchers: seed,
  scoutMetadataEnriched: enriched,
  activeCatalogSources: ACTIVE_KC_SOURCES.length,
});

process.exit(0);
