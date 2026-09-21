#!/usr/bin/env tsx
/**
 * Live-source correction for Openings Radar BIG LIST acceptance.
 * - Migrates fixture provenance → Facebook social
 * - Ensures Substack Watchlist sources
 * - Runs ordinary watcher check twice (no force / no fixture)
 */
import {
  correctBigListProvenanceAndStatus,
  ensureKcinsidersOpeningsWatchers,
  provenanceTable,
  runOpeningsRadarWatcherCheck,
  BIG_LIST_FACEBOOK_URL,
  KCINSIDERS_SUBSTACK_FEED,
  KCINSIDERS_SUBSTACK_HOME,
} from '../openings-radar/index.js';
import { db } from '../db.js';
import { sql } from 'drizzle-orm';

async function main() {
  console.log('=== Openings Radar live-source correction ===');
  console.log('facebook_url', BIG_LIST_FACEBOOK_URL);
  console.log('substack_home', KCINSIDERS_SUBSTACK_HOME);
  console.log('substack_feed', KCINSIDERS_SUBSTACK_FEED);

  const provenance = await correctBigListProvenanceAndStatus();
  console.log('provenance_correction', JSON.stringify(provenance, null, 2));

  const ensured = await ensureKcinsidersOpeningsWatchers();
  console.log('watchers_ensured', JSON.stringify(ensured, null, 2));

  const facebook = ensured.facebookEvidenceWatcherId
    ? await runOpeningsRadarWatcherCheck(ensured.facebookEvidenceWatcherId, 'manual')
    : null;
  console.log('facebook_check', JSON.stringify(summarize(facebook), null, 2));

  const first = await runOpeningsRadarWatcherCheck(ensured.substackFeedWatcherId, 'manual');
  console.log('substack_check_1', JSON.stringify(summarize(first), null, 2));

  const second = await runOpeningsRadarWatcherCheck(ensured.substackFeedWatcherId, 'manual');
  console.log('substack_check_2', JSON.stringify(summarize(second), null, 2));

  const table = await provenanceTable();
  console.log('provenance_table', JSON.stringify(table, null, 2));

  const vb = await db.execute(sql`
    SELECT id, title, status FROM content_items WHERE id = '1315fdc4-0d60-44bb-a9a0-3e3fb5f74902'
  `);
  console.log('veronica_beard', JSON.stringify(vb, null, 2));

  const openingsCount = await db.execute(sql`SELECT count(*)::int AS n FROM opening_locations`);
  console.log('opening_locations_count', openingsCount);

  console.log(
    JSON.stringify(
      {
        ok: true,
        substackFeedWatcherId: ensured.substackFeedWatcherId,
        facebookEvidenceWatcherId: ensured.facebookEvidenceWatcherId,
        facebookEntries: facebook?.runs?.[0]?.entriesParsed ?? 0,
        facebookCreated: facebook?.runs?.[0]?.locationsCreated ?? 0,
        facebookUpdated: facebook?.runs?.[0]?.locationsUpdated ?? 0,
        substack1: summaryCounts(first),
        substack2: summaryCounts(second),
      },
      null,
      2,
    ),
  );

  process.exit(0);
}

function summarize(report: Awaited<ReturnType<typeof runOpeningsRadarWatcherCheck>> | null) {
  if (!report) return null;
  return {
    watcherId: report.watcherId,
    role: report.role,
    ok: report.ok,
    feedItemsExamined: report.feedItemsExamined,
    roundupsRecognized: report.roundupsRecognized,
    inspectionSummary: report.inspectionSummary,
    error: report.error,
    runs: report.runs.map((r) => ({
      entriesParsed: r.entriesParsed,
      locationsCreated: r.locationsCreated,
      locationsUpdated: r.locationsUpdated,
      opportunitiesCreated: r.opportunitiesCreated,
      eventsCreated: r.eventsCreated,
      rejected: r.rejected,
    })),
  };
}

function summaryCounts(report: Awaited<ReturnType<typeof runOpeningsRadarWatcherCheck>>) {
  return {
    roundups: report.roundupsRecognized,
    created: report.runs.reduce((n, r) => n + r.locationsCreated, 0),
    updated: report.runs.reduce((n, r) => n + r.locationsUpdated, 0),
    opps: report.runs.reduce((n, r) => n + r.opportunitiesCreated, 0),
    events: report.runs.reduce((n, r) => n + r.eventsCreated, 0),
  };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
