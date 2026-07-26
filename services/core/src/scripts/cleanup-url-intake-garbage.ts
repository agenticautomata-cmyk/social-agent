/**
 * Quarantine URL intake garbage from production inventory.
 * Archives bad ask_benson_link rows with audit trail — never deletes user-created records.
 */
import { and, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { contentItems } from '../schema.js';
import {
  isGenericExtractedTitle,
  isMapSearchUrl,
  isPastEventDate,
} from '../ask-benson/qualify-url-opportunity.js';
import { isOutOfMarketLocation } from '../ask-benson/url-geo.js';
import { recordIntakeAudit } from '../ask-benson/url-intake-store.js';

type CleanupCandidate = {
  id: string;
  topic: string;
  locationName: string | null;
  sourceUrl: string | null;
  eventStartsAt: Date | null;
  relevanceScore: string | null;
  reasons: string[];
};

async function findGarbageCandidates(): Promise<CleanupCandidate[]> {
  const rows = await db
    .select({
      id: contentItems.id,
      topic: contentItems.topic,
      locationName: contentItems.locationName,
      sourceUrl: contentItems.sourceUrl,
      eventStartsAt: contentItems.eventStartsAt,
      relevanceScore: contentItems.relevanceScore,
      lifecycleStatus: contentItems.lifecycleStatus,
      metadata: contentItems.metadata,
    })
    .from(contentItems)
    .where(
      and(
        sql`${contentItems.metadata}->>'ingest' = 'ask_benson_link'`,
        eq(contentItems.lifecycleStatus, 'active'),
      ),
    );

  const candidates: CleanupCandidate[] = [];
  for (const row of rows) {
    const reasons: string[] = [];
    if (isGenericExtractedTitle(row.topic)) reasons.push('generic_title');
    if (row.locationName && isOutOfMarketLocation(row.locationName)) reasons.push('out_of_market');
    if (row.eventStartsAt && isPastEventDate(row.eventStartsAt)) reasons.push('expired');
    if (row.sourceUrl && isMapSearchUrl(row.sourceUrl)) reasons.push('map_search_source');
    if (
      row.relevanceScore &&
      Number(row.relevanceScore) >= 0.5 &&
      row.locationName &&
      isOutOfMarketLocation(row.locationName)
    ) {
      reasons.push('kc_score_out_of_market_mismatch');
    }
    if (reasons.length > 0) {
      candidates.push({
        id: row.id,
        topic: row.topic,
        locationName: row.locationName,
        sourceUrl: row.sourceUrl,
        eventStartsAt: row.eventStartsAt,
        relevanceScore: row.relevanceScore,
        reasons,
      });
    }
  }

  const explicit = await db
    .select({
      id: contentItems.id,
      topic: contentItems.topic,
      locationName: contentItems.locationName,
      sourceUrl: contentItems.sourceUrl,
      eventStartsAt: contentItems.eventStartsAt,
      relevanceScore: contentItems.relevanceScore,
    })
    .from(contentItems)
    .where(
      and(
        ilike(contentItems.topic, '%New Event Starts%'),
        or(ilike(contentItems.locationName, '%Tulsa%'), ilike(contentItems.locationName, '%OK%')),
        eq(contentItems.lifecycleStatus, 'active'),
      ),
    );

  for (const row of explicit) {
    if (candidates.some((c) => c.id === row.id)) continue;
    candidates.push({
      ...row,
      reasons: ['explicit_halfofhalf_garbage', 'expired', 'wrong_geography', 'qualification_failure'],
    });
  }

  return candidates;
}

async function quarantineCandidate(candidate: CleanupCandidate): Promise<void> {
  await db
    .update(contentItems)
    .set({
      lifecycleStatus: 'archived',
      creatorValueStatus: 'rejected',
    })
    .where(eq(contentItems.id, candidate.id));

  await recordIntakeAudit({
    contentItemId: candidate.id,
    action: 'quarantine_garbage_cleanup',
    reasonCode: candidate.reasons[0] ?? 'qualification_failure',
    reasonDetail: candidate.reasons.join(', '),
    metadata: {
      topic: candidate.topic,
      location: candidate.locationName,
      sourceUrl: candidate.sourceUrl,
      eventStartsAt: candidate.eventStartsAt?.toISOString() ?? null,
      relevanceScore: candidate.relevanceScore,
      allReasons: candidate.reasons,
    },
  });
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const candidates = await findGarbageCandidates();

  console.log(`Found ${candidates.length} URL intake garbage candidate(s):`);
  for (const c of candidates) {
    console.log(
      JSON.stringify({
        id: c.id,
        topic: c.topic,
        location: c.locationName,
        eventStartsAt: c.eventStartsAt?.toISOString().slice(0, 10) ?? null,
        sourceUrl: c.sourceUrl,
        reasons: c.reasons,
      }),
    );
  }

  if (dryRun) {
    console.log('\nDry run — no changes made.');
    return;
  }

  for (const c of candidates) {
    await quarantineCandidate(c);
  }
  console.log(`\nQuarantined ${candidates.length} item(s) with audit records.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
