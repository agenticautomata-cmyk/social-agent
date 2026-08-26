/**
 * Pre-deploy smoke / acceptance for Ask Benson URL Intelligence.
 * Usage (from services/core):
 *   pnpm exec tsx src/scripts/url-intelligence-smoke.ts
 */
import { sql } from 'drizzle-orm';
import { askBenson } from '../ask-benson/ask.js';
import { db } from '../db.js';
import {
  classifyUrlIntakeRoute,
  getCreatorPartnership,
  listPartnershipSources,
  readPartnershipMetadata,
  runPartnershipResearch,
  shouldOpenCreatorOpportunityPipeline,
  submitCreatorPartnership,
} from '../creator-partnership/index.js';
import { isCreatorPartnershipIntakeLegacy } from '../creator-partnership/detect.js';

const SCHEELS =
  'https://www.scheels.com/c/all/b/what%20goes%20around%20comes%20around?r=storeAvailability%3A88';
const SCHEELS_TRACKING = `${SCHEELS}&utm_source=smoke&fbclid=test123`;
const SCHEELS_PROGRAM = 'https://www.scheels.com/pages/creator-program';

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx]!;
}

async function main() {
  const report: Record<string, unknown> = { startedAt: new Date().toISOString() };

  // A/B — Plain URL routing + bridge
  const classified = classifyUrlIntakeRoute({ url: SCHEELS, message: SCHEELS });
  const gate = shouldOpenCreatorOpportunityPipeline(SCHEELS);
  report.plainUrlRoute = {
    selectedRoute: classified.route,
    ambiguous: classified.ambiguous,
    pipelineOpen: gate.open,
    initialRoute: gate.initialRoute,
    reason: gate.reason,
  };

  // Clean prior smoke partnerships for this normalized URL (dev only).
  // URL-only: do not DELETE by opportunityFingerprint (legacy truncated keys
  // collide across distinct scheels.com entities).
  const normalized = classified.urlIntel?.normalizedUrl ?? SCHEELS;
  await db.execute(sql`
    DELETE FROM creator_partnerships
    WHERE submitted_url = ${normalized}
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements(COALESCE(metadata->'sourceUrls', '[]'::jsonb)) e
         WHERE e->>'normalizedUrl' = ${normalized}
       )
  `);

  // Plain URL Ask Benson once (no accompanying text)
  const askStarted = Date.now();
  const firstAsk = await askBenson({ message: SCHEELS });
  const firstAskMs = Date.now() - askStarted;

  // End-to-end sync latency: submit path (route+normalize+DB+brief), 20 iterations
  // Uses submitCreatorPartnership — same sync critical path as Ask Benson partnership branch.
  const syncSamples: number[] = [];
  for (let i = 0; i < 20; i++) {
    const t0 = Date.now();
    await submitCreatorPartnership(
      {
        url: SCHEELS,
        text: SCHEELS,
        sourceScreen: 'smoke_latency',
        initialIntakeRoute: 'local_discovery',
      },
      { skipResearch: true },
    );
    syncSamples.push(Date.now() - t0);
  }
  syncSamples.sort((a, b) => a - b);
  report.syncLatencyMs = {
    firstAskBensonMs: firstAskMs,
    submitP50: pct(syncSamples, 50),
    submitP95: pct(syncSamples, 95),
    submitMax: syncSamples[syncSamples.length - 1],
    samples: syncSamples.length,
    note: 'firstAskBensonMs = full askBenson sync; submit* = 20x submitCreatorPartnership sync (DB+brief, no network fetch)',
  };

  const partnershipId = firstAsk?.collection?.partnershipId ?? null;
  report.plainUrlAsk = {
    ok: firstAsk?.ok,
    intakeRoute: firstAsk?.collection?.intakeRoute,
    partnershipId,
    researchStatus: firstAsk?.collection?.partnershipResearchStatus,
    syncMsReported: firstAsk?.collection?.syncMs,
    provisionalBrief: firstAsk?.collection?.decisionBrief ?? null,
    answerPreview: firstAsk?.answer?.slice(0, 800),
    messageId: firstAsk?.messageId,
    conversationId: firstAsk?.conversationId,
  };

  if (!partnershipId) {
    report.fatal = 'Plain SCHEELS URL did not create/link a creator_partnership — STOP deploy';
    console.log(JSON.stringify(report, null, 2));
    process.exit(2);
  }

  // C — DB dedupe / source attach
  const first = await submitCreatorPartnership(
    {
      url: SCHEELS,
      text: SCHEELS,
      sourceScreen: 'smoke',
      initialIntakeRoute: 'local_discovery',
    },
    { skipResearch: true },
  );
  const second = await submitCreatorPartnership(
    {
      url: SCHEELS,
      text: SCHEELS,
      sourceScreen: 'smoke',
      initialIntakeRoute: 'local_discovery',
    },
    { skipResearch: true },
  );
  const tracking = await submitCreatorPartnership(
    {
      url: SCHEELS_TRACKING,
      text: SCHEELS_TRACKING,
      sourceScreen: 'smoke',
      initialIntakeRoute: 'local_discovery',
    },
    { skipResearch: true },
  );
  const programUrl = await submitCreatorPartnership(
    {
      url: SCHEELS_PROGRAM,
      text: SCHEELS_PROGRAM,
      sourceScreen: 'smoke',
      initialIntakeRoute: 'local_discovery',
    },
    { skipResearch: true },
  );

  const p1 = await getCreatorPartnership(first.partnershipId);
  const pTrack = await getCreatorPartnership(tracking.partnershipId);
  const pProg = await getCreatorPartnership(programUrl.partnershipId);
  const sources1 = listPartnershipSources(readPartnershipMetadata(p1?.metadata));
  const sourcesTrack = listPartnershipSources(readPartnershipMetadata(pTrack?.metadata));
  const sourcesProg = listPartnershipSources(readPartnershipMetadata(pProg?.metadata));

  report.dbDedupe = {
    firstId: first.partnershipId,
    firstDuplicate: first.duplicate,
    secondId: second.partnershipId,
    secondDuplicate: second.duplicate,
    sameIdOnRepaste: first.partnershipId === second.partnershipId,
    trackingId: tracking.partnershipId,
    trackingDuplicate: tracking.duplicate,
    trackingSameAsFirst: tracking.partnershipId === first.partnershipId,
    trackingSourceCount: sourcesTrack.length,
    programUrlId: programUrl.partnershipId,
    programAttachedOrNew: programUrl.partnershipId === first.partnershipId ? 'attached_or_same_fp' : 'separate_or_new',
    programExpectedUnderV2: 'separate_or_new',
    programSourceCount: sourcesProg.length,
    firstSourceCount: sources1.length,
  };

  // E — One live async research run (poll in-flight owner; do not stack duplicate claims)
  const researchStarted = Date.now();
  let researchError: string | null = null;
  try {
    const before = await getCreatorPartnership(partnershipId);
    if (before?.researchStatus === 'queued' || before?.researchStatus === 'failed') {
      await runPartnershipResearch(partnershipId, { trigger: 'smoke' });
    }
    const deadline = Date.now() + 10 * 60 * 1000;
    while (Date.now() < deadline) {
      const snap = await getCreatorPartnership(partnershipId);
      if (
        snap?.researchStatus === 'complete' ||
        snap?.researchStatus === 'needs_verification' ||
        snap?.researchStatus === 'failed'
      ) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  } catch (err) {
    researchError = err instanceof Error ? err.message : String(err);
  }
  const researchMs = Date.now() - researchStarted;
  const after = await getCreatorPartnership(partnershipId);
  const meta = readPartnershipMetadata(after?.metadata);
  const research = after?.research;

  report.asyncResearch = {
    partnershipId,
    durationMs: researchMs,
    error: researchError,
    researchStatus: after?.researchStatus,
    fitScore: after?.fitScore,
    brandName: after?.brandName,
    retailerName: after?.retailerName,
    monetizationPaths: after?.monetizationPaths,
    needsVerification: after?.needsVerification,
    creatorProgram: research?.creatorProgram ?? null,
    localFilmingPotential: research?.localFilmingPotential ?? null,
    storyAngleCandidates: research?.storyAngleCandidates ?? [],
    nextActionInputs: research?.nextActionInputs ?? [],
    citationCount: research?.citations?.length ?? 0,
    localLocations: research?.localLocations ?? [],
    promotedToCreatorPartnership: meta.promotedToCreatorPartnership ?? null,
    creatorOpportunityStatus: meta.creatorOpportunityStatus ?? null,
    initialIntakeRoute: meta.initialIntakeRoute ?? null,
    pipelineOpenedAs: meta.pipelineOpenedAs ?? null,
    decisionBrief: after?.decisionBrief ?? null,
    // search/LLM counts: research runs up to 6 searches + 1 synthesis by design
    expectedSearchCalls: 6,
    expectedLlmCalls: 1,
  };

  // G — Poll+patch persistence: brief on partnership GET
  report.pollPatch = {
    briefEndpointReady: Boolean(after?.decisionBrief),
    briefPhase: after?.decisionBrief?.phase ?? null,
    partnershipHref: after?.decisionBrief?.partnershipHref ?? null,
    conversationId: firstAsk?.conversationId,
    messageId: firstAsk?.messageId,
    note: 'UI poll patches same assistant message from GET /api/creator-partnerships/:id/brief; conversation reload reads stored outputJson + can re-fetch brief by partnershipId',
  };

  // H — Feature flag off: legacy intake path remains available
  report.featureFlagOff = {
    legacyPlainScheelsIsPartnershipIntake: isCreatorPartnershipIntakeLegacy(SCHEELS),
    legacyRestaurantMenu: isCreatorPartnershipIntakeLegacy('https://local-cafe.example.com/menu'),
    note: 'PARTNERSHIP_URL_INTELLIGENCE=0 switches isCreatorPartnershipIntake to legacy commerce routing; Ask Benson does not crash.',
  };

  report.completedAt = new Date().toISOString();
  console.log(JSON.stringify(report, null, 2));

  // Soft exit codes
  if (!gate.open || !partnershipId) process.exit(2);
  if (first.partnershipId !== second.partnershipId || !tracking.duplicate) process.exit(3);
  if (researchError) process.exit(4);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
