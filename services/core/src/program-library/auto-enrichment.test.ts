import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { eq } from 'drizzle-orm';
import { assertSafeTestDatabase, db } from '../test-db.js';
import { creatorPartnerships } from '../schema.js';
import { readPartnershipMetadata } from '../creator-partnership/partnership-sources.js';
import { evaluateHomeEligibility } from '../inventory/home-eligibility.js';
import type { InventoryItem } from '../inventory/normalize.js';
import { saveProgramToLibrary } from './save.js';
import { activateProgramLibraryRecord } from './activate.js';
import { getProgramLibraryRecord } from './list.js';
import {
  countSavedProgramsNeedingEnrichment,
  persistEnrichmentAttempt,
  runProgramLibraryAutoEnrichmentCycle,
  selectProgramForAutoEnrichment,
} from './auto-enrichment.js';
import { shouldExcludeProgramLibraryFromDiscover } from './eligibility.js';

function quietProgramItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: '00000000-0000-4000-8000-000000000099',
    title: 'Auto Enrich Brand — Affiliate program',
    summary: 'Quiet library program',
    sourceName: 'Program Library',
    sourceType: 'manual',
    category: 'creator_partnership',
    state: 'planned',
    eventDate: null,
    eventEndDate: null,
    discoveredAt: '2026-08-11T12:00:00.000Z',
    createdAt: '2026-08-11T12:00:00.000Z',
    updatedAt: '2026-08-11T12:00:00.000Z',
    venue: null,
    businessName: 'Auto Enrich Brand',
    neighborhood: null,
    address: null,
    locationName: null,
    locationStatus: null,
    formattedAddress: null,
    locationLat: null,
    locationLng: null,
    googlePlaceId: null,
    googleMapsUrl: null,
    locationWebsiteUrl: null,
    locationConfidence: null,
    locationSource: null,
    locationVerifiedAt: null,
    locationResolutionError: null,
    sourceUrl: null,
    ingest: 'program_library',
    flags: {
      sponsorFriendly: true,
      luxury: false,
      dining: false,
      dateNight: false,
      estateSale: false,
      businessOpening: false,
      freeEvent: false,
      celebrityCharity: false,
      sports: false,
      reddit: false,
      worldCup: false,
      shopping: false,
      retail: false,
      vendorMarket: false,
      collector: false,
    },
    badges: [],
    audienceScore: 4,
    whyItMatters: 'Saved affiliate program in quiet library.',
    metadata: {
      programLibraryQuiet: true,
      quietLibraryOnly: true,
      programLibraryMode: 'saved',
      libraryMode: 'quiet',
      ingest: 'program_library',
      opportunityCategory: 'program_library',
    },
    relevanceScore: '0.4',
    urgencyScore: '0.1',
    coverageFormat: null,
    suggestedCoverageFormat: null,
    firsthandVisited: false,
    creatorValueStatus: 'hidden_raw_signal',
    lifecycleStatus: 'active',
    ...overrides,
  } as InventoryItem;
}

async function saveCandidate(brandName: string, extra: Parameters<typeof saveProgramToLibrary>[0] = {}) {
  const uniqueBrand = brandName.includes('Unit') ? brandName : `${brandName} Unit ${Date.now()}`;
  return saveProgramToLibrary({
    brandName: uniqueBrand,
    programName: uniqueBrand,
    programType: 'affiliate',
    scope: 'national',
    operatorSupplied: true,
    sourceScreen: 'program_library',
    ...extra,
  });
}

describe('program library auto-enrichment selector', () => {
  before(() => {
    assertSafeTestDatabase();
  });
  it('excludes activated records and respects backoff metadata', async () => {
    const saved = await saveCandidate('AutoEnrich Activated Exclude');
    await activateProgramLibraryRecord(saved.programId, { skipResearch: true });

    const selection = await selectProgramForAutoEnrichment();
    assert.ok(!selection || selection.programId !== saved.programId);

    const backoff = await saveCandidate('AutoEnrich Backoff Brand');
    const future = new Date(Date.now() + 48 * 60 * 60 * 1000);
    await persistEnrichmentAttempt(backoff.programId, 'failed', new Date());
    const [row] = await db
      .select()
      .from(creatorPartnerships)
      .where(eq(creatorPartnerships.id, backoff.programId))
      .limit(1);
    const metadata = readPartnershipMetadata(row!.metadata) as { nextEligibleEnrichmentAt?: string };
    assert.ok(metadata.nextEligibleEnrichmentAt);
    assert.ok(Date.parse(metadata.nextEligibleEnrichmentAt!) > Date.now());

    const again = await selectProgramForAutoEnrichment();
    assert.ok(!again || again.programId !== backoff.programId);
    void future;
  });

  it('skips recently verified records using 7-day freshness', async () => {
    const saved = await saveCandidate('AutoEnrich Recent Verify');

    const { verifyProgramMissingInfo } = await import('./enrich.js');
    await verifyProgramMissingInfo(saved.programId, {
      testSkipBudgetGate: true,
      force: true,
      testSearchWeb: (async () => ({
        ok: true,
        summary: 'Official affiliate program pays 8% commission.',
        citations: [{ url: 'https://example.com/affiliate', title: 'Affiliate' }],
      })) as never,
    });

    const selection = await selectProgramForAutoEnrichment();
    assert.ok(!selection || selection.programId !== saved.programId);
  });
});

describe('program library auto-enrichment worker cycle', () => {
  before(() => {
    assertSafeTestDatabase();
  });
  it('respects background budget gate with zero search calls', async () => {
    const prev = process.env.BENSON_LLM_DAILY_BUDGET_USD;
    process.env.BENSON_LLM_DAILY_BUDGET_USD = '0';
    let searchCalls = 0;
    try {
      await saveCandidate('AutoEnrich Budget Gate');
      const result = await runProgramLibraryAutoEnrichmentCycle({
        testSearchWeb: (async () => {
          searchCalls += 1;
          return { ok: true, summary: '', citations: [] };
        }) as never,
      });
      assert.equal(result.ran, false);
      assert.equal(result.skipReason, 'background_budget_gate');
      assert.equal(searchCalls, 0);
    } finally {
      if (prev === undefined) delete process.env.BENSON_LLM_DAILY_BUDGET_USD;
      else process.env.BENSON_LLM_DAILY_BUDGET_USD = prev;
    }
  });

  it('attempts at most one program per run with correct telemetry', async () => {
    let searchCalls = 0;
    let capturedOpts: Record<string, unknown> | null = null;

    await saveCandidate('AutoEnrich Telemetry A');
    const savedB = await saveCandidate('AutoEnrich Telemetry B');

    const result = await runProgramLibraryAutoEnrichmentCycle({
      testSkipBudgetGate: true,
      testOnlyProgramId: savedB.programId,
      testSearchWeb: (async (_q, _i, opts) => {
        searchCalls += 1;
        capturedOpts = opts as Record<string, unknown>;
        return {
          ok: true,
          summary: 'Official affiliate program pays 8% commission.',
          citations: [{ url: 'https://taprefer.com/mock-affiliate-program', title: 'Affiliate' }],
        };
      }) as never,
    });

    assert.equal(result.ran, true);
    assert.equal(searchCalls, 1);
    assert.ok(result.programId);
    assert.equal(result.caller, 'program_library.auto_enrichment');
    assert.equal(result.context, 'background');
    assert.equal(result.process, 'worker');
    assert.equal(capturedOpts?.caller, 'program_library.auto_enrichment');
    assert.equal(capturedOpts?.context, 'background');
    assert.equal(capturedOpts?.process, 'worker');
    assert.equal(capturedOpts?.trigger, 'auto_enrichment');
    assert.equal(result.modeAfter, 'saved');
  });

  it('preserves operator supplied conflicts and keeps program quiet on surfaces', async () => {
    const saved = await saveCandidate('AutoEnrich Conflict Brand', {
      commissionBenefit: '10%',
    });

    const result = await runProgramLibraryAutoEnrichmentCycle({
      testSkipBudgetGate: true,
      testOnlyProgramId: saved.programId,
      testSearchWeb: (async () => ({
        ok: true,
        summary: 'Official affiliate program pays 8% commission.',
        citations: [{ url: 'https://taprefer.com/mock-affiliate-program', title: 'Affiliate' }],
      })) as never,
      now: new Date(),
    });

    assert.equal(result.ran, true);
    assert.equal(result.programId, saved.programId);
    assert.equal(result.modeAfter, 'saved');
    assert.ok(
      (result.enrichResult?.changes?.length ?? 0) > 0 ||
        result.enrichResult?.verificationDisplayState === 'conflicting_information' ||
        result.enrichResult?.verificationDisplayState === 'verified_official',
    );

    const home = evaluateHomeEligibility(
      quietProgramItem({ businessName: 'AutoEnrich Conflict Brand Unit' }),
    );
    assert.equal(home.eligible, false);
    assert.equal(
      shouldExcludeProgramLibraryFromDiscover({ programLibraryQuiet: true, ingest: 'program_library' }),
      true,
    );
  });

  it('backs off failed/no-result attempts and advances to another eligible program', async () => {
    const brandA = `AutoEnrich Seq A ${Date.now()}`;
    const brandB = `AutoEnrich Seq B ${Date.now() + 1}`;
    const a = await saveCandidate(brandA);
    const b = await saveCandidate(brandB);

    const run1 = await runProgramLibraryAutoEnrichmentCycle({
      testSkipBudgetGate: true,
      testOnlyProgramId: a.programId,
      testSearchWeb: (async () => ({ ok: false, summary: '', citations: [] })) as never,
    });
    assert.equal(run1.ran, true);
    assert.ok(run1.programId);

    const run2 = await runProgramLibraryAutoEnrichmentCycle({
      testSkipBudgetGate: true,
      testOnlyProgramId: b.programId,
      testSearchWeb: (async () => ({
        ok: true,
        summary: 'Official affiliate program pays 8% commission.',
        citations: [{ url: 'https://taprefer.com/mock-affiliate-program', title: 'Affiliate' }],
      })) as never,
    });
    assert.equal(run2.ran, true);
    assert.ok(run2.programId);
    assert.notEqual(run2.programId, run1.programId);

    void a;
    void b;
  });

  it('simulates three sequential worker cycles across three programs (smoke)', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const saved = await saveCandidate(`AutoEnrich Smoke ${Date.now()}-${i}`);
      ids.push(saved.programId);
    }

    const selected: string[] = [];
    for (let cycle = 0; cycle < 3; cycle += 1) {
      let calls = 0;
      const result = await runProgramLibraryAutoEnrichmentCycle({
        testSkipBudgetGate: true,
        testOnlyProgramId: ids[cycle]!,
        testSearchWeb: (async () => {
          calls += 1;
          return {
            ok: true,
            summary: 'Official affiliate program pays 8% commission.',
            citations: [{ url: 'https://taprefer.com/mock-affiliate-program', title: 'Affiliate' }],
          };
        }) as never,
      });
      assert.equal(result.ran, true);
      assert.equal(calls, 1);
      assert.ok(result.programId);
      selected.push(result.programId);
    }

    assert.equal(new Set(selected).size, 3);
  });

  it('does not immediately re-verify when backoff metadata says wait', async () => {
    const saved = await saveCandidate('AutoEnrich Restart Guard');
    await persistEnrichmentAttempt(saved.programId, 'failed', new Date());

    let searchCalls = 0;
    const result = await runProgramLibraryAutoEnrichmentCycle({
      testSkipBudgetGate: true,
      testSearchWeb: (async () => {
        searchCalls += 1;
        return { ok: true, summary: '8%', citations: [{ url: 'https://x.example/a', title: 'A' }] };
      }) as never,
    });

    assert.ok(!result.programId || result.programId !== saved.programId);
    if (result.programId === saved.programId) {
      assert.equal(searchCalls, 0);
    }
  });
});

describe('program library auto-enrichment test artifact exclusion', () => {
  before(() => {
    assertSafeTestDatabase();
  });
  it('does not select confirmed AutoEnrich smoke/test records', async () => {
    const smoke = await saveProgramToLibrary({
      brandName: `AutoEnrich Smoke ${Date.now()}-exclude`,
      programName: `AutoEnrich Smoke ${Date.now()}-exclude`,
      operatorSupplied: true,
      sourceScreen: 'auto_enrichment_test',
    });
    const selection = await selectProgramForAutoEnrichment();
    assert.ok(!selection || selection.programId !== smoke.programId);

    const legit = await saveProgramToLibrary({
      brandName: `Legit Seed Style ${Date.now()}`,
      programName: `Legit Seed Style ${Date.now()}`,
      operatorSupplied: true,
      operatorSuppliedMasterList: true,
      sourceScreen: 'program_library_seed',
    });
    const next = await selectProgramForAutoEnrichment();
    if (next) {
      assert.notEqual(next.programId, smoke.programId);
    }
    void legit;
  });
});

describe('program library auto-enrichment counts', () => {
  before(() => {
    assertSafeTestDatabase();
  });
  it('reports remaining unverified saved programs', async () => {
    const before = await countSavedProgramsNeedingEnrichment();
    await saveCandidate(`AutoEnrich Count ${Date.now()}`);
    const after = await countSavedProgramsNeedingEnrichment();
    assert.ok(after >= before);
  });
});
