/**
 * Dry-run Eventbrite KC public discovery against live public pages.
 * Never persists. Never uses destination-search / OAuth / events/search.
 *
 * Usage:
 *   pnpm --filter @social-agent/core exec tsx src/eventbrite-kc-discovery/cli-dry-run.ts
 */
import { writeFileSync } from 'node:fs';
import { runEventbriteKcDiscovery } from './run.js';

const CONTROL_IDS = [
  '1996482122773', // Taco Festival
  '1992430928542', // Margarita
  '1994365695482', // Bourbon Bacon Brews
  '1988697063451', // R&B Festival Jacquees
  '1993329201300', // Tez Carter All White
  '1994887561397', // Sincerely Yours
  '1993956277903', // Havana Night
  '1997410817524', // AI Club
  '1997339553371', // NAWBO
  '1993554814114', // Woven
  '1996198914690', // Crossroads Vendor Fair
  '1994954910841', // Back to School Bash
  '1990747565558', // HAIRitage
  '1981938776232', // Reptile Show
  '1992933714388', // Totally Tots
  '1993833003185', // John Green
  '1992499539760', // Jodi Picoult
  '1993928508845', // Hard Candy
  '1994872637760', // Studio Night
  '1970414039434', // Disability Inclusion Summit
] as const;

async function main() {
  const started = Date.now();
  console.log('[eventbrite-kc-dry-run] starting (persist=false, destination-search=off)…');
  const result = await runEventbriteKcDiscovery({
    dryRun: true,
    persist: false,
    maxUniqueIds: 100,
    maxDetailFetches: 100,
  });

  const byId = new Map(result.candidates.map((c) => [c.eventbriteEventId, c]));
  const controlRows = CONTROL_IDS.map((id) => {
    const hit = byId.get(id);
    const catalogHit = result.surfaces.some((s) => s.extractedIds.includes(id));
    return {
      eventbriteEventId: id,
      discoveredByCrawler: catalogHit,
      detailParsed: hit?.disposition === 'would_create' ||
        hit?.disposition === 'would_update' ||
        hit?.disposition === 'already_exists_eb' ||
        hit?.disposition === 'cross_source_twin_no_merge',
      kcEligible:
        hit?.disposition === 'would_create' ||
        hit?.disposition === 'would_update' ||
        hit?.disposition === 'already_exists_eb' ||
        hit?.disposition === 'cross_source_twin_no_merge',
      existingTwin: Boolean(hit?.existingTwin),
      disposition: hit?.disposition ?? (catalogHit ? 'catalog_only_no_detail' : 'not_in_ssr_catalog'),
      title: hit?.title ?? null,
      rejectionReason: hit?.rejectionReason ?? null,
    };
  });

  const discoveredCount = controlRows.filter((r) => r.discoveredByCrawler).length;
  const summary = {
    elapsedMs: Date.now() - started,
    dryRun: result.dryRun,
    persist: result.persist,
    surfaces: result.surfaces.map((s) => ({
      id: s.surfaceId,
      fetchOk: s.fetchOk,
      extractedCount: s.extractedCount,
      error: s.httpError ?? null,
    })),
    uniqueIdsFound: result.uniqueIdsFound,
    duplicateIdsAcrossSurfaces: result.duplicateIdsAcrossSurfaces,
    detailFetchAttempts: result.detailFetchAttempts,
    detailParsedOk: result.detailParsedOk,
    kcEligible: result.kcEligible,
    rejectedGeography: result.rejectedGeography,
    parserFailures: result.parserFailures,
    detailFetchFailures: result.detailFetchFailures,
    alreadyExistingEb: result.alreadyExistingEb,
    crossSourceTwins: result.crossSourceTwins,
    wouldCreate: result.wouldCreate,
    wouldUpdate: result.wouldUpdate,
    controlCoverage: `${discoveredCount}/20`,
    controlRows,
  };

  const outPath = '/tmp/eventbrite-kc-dry-run.json';
  writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  console.log(`[eventbrite-kc-dry-run] wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
