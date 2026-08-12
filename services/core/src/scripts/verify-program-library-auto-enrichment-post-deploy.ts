import {
  countSavedProgramsNeedingEnrichment,
  runProgramLibraryAutoEnrichmentCycle,
  selectProgramForAutoEnrichment,
} from '../program-library/auto-enrichment.js';
import { listProgramLibrary, seedProgramLibrary } from '../program-library/index.js';
import { listCreatorPartnerships } from '../creator-partnership/pipeline.js';

const SEED_BRANDS = [
  'FlexPro Meals',
  'KC Wine Road',
  'KC Chiefs Pro Shop',
  'Dream KC Smoke Shop',
  'BodymetRx KC',
  'KC Cabinetry & Stone',
  'Prestige Transportation KC',
  'The Roasterie',
  'Made in KC',
  'Charlie Hustle',
  'Boulevard Brewing',
  'Cerner / Oracle Health',
  'Hallmark',
  'Garmin',
  'CivicPlus',
];

async function main() {
  const health = await fetch('http://127.0.0.1:4000/health')
    .then((r) => r.json())
    .catch(() => null);
  const dash = await fetch('http://127.0.0.1:3000/program-library')
    .then((r) => ({ status: r.status }))
    .catch(() => ({ status: 0 }));

  const seed = await seedProgramLibrary();
  const programs = await listProgramLibrary({ limit: 80 });
  const seedRows = programs.filter((p) => SEED_BRANDS.includes(p.brandName));
  const savedSeeds = seedRows.filter((p) => p.mode === 'saved');
  const partnerships = await listCreatorPartnerships(100);
  const savedIds = new Set(programs.filter((p) => p.mode === 'saved').map((p) => p.id));
  const overlap = partnerships.filter((p) => savedIds.has(p.id));
  const next = await selectProgramForAutoEnrichment();
  const needing = await countSavedProgramsNeedingEnrichment();

  console.log(
    JSON.stringify(
      {
        apiHealth: health?.ok ?? false,
        dashboardStatus: dash.status,
        seed: {
          updated: seed.updated,
          total: seed.total,
          seedCount: seedRows.length,
          savedSeedCount: savedSeeds.length,
        },
        savedInPartnershipsList: overlap.length,
        needingEnrichment: needing,
        nextCandidate: next
          ? { id: next.programId, brand: next.brandName, reason: next.reason }
          : null,
      },
      null,
      2,
    ),
  );

  const cycle = await runProgramLibraryAutoEnrichmentCycle();
  console.log(
    'CYCLE',
    JSON.stringify(
      {
        ran: cycle.ran,
        skipReason: cycle.skipReason,
        programId: cycle.programId,
        brandName: cycle.brandName,
        searchCalls: cycle.searchCalls,
        modeAfter: cycle.modeAfter,
        caller: cycle.caller,
        context: cycle.context,
        process: cycle.process,
        enrichSkipped: cycle.enrichResult?.skipped,
        enrichSkipReason: cycle.enrichResult?.skipReason,
        changes: cycle.enrichResult?.changes,
      },
      null,
      2,
    ),
  );
}

void main();
