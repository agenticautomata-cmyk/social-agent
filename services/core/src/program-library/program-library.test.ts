import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import {
  buildCanonicalProgramIdentity,
  extractProgramNamesFromMessage,
  isProgramLibrarySaveIntent,
} from './canonical.js';
import { mergeFieldClaim, operatorSuppliedClaim } from './metadata.js';
import {
  isProgramLibraryQuietMetadata,
  shouldExcludeProgramLibraryFromDiscover,
} from './eligibility.js';
import { evaluateHomeEligibility } from '../inventory/home-eligibility.js';
import type { InventoryItem } from '../inventory/normalize.js';
import { verifyProgramMissingInfo } from './enrich.js';
import { saveProgramToLibrary } from './save.js';
import { seedProgramLibrary, PROGRAM_LIBRARY_SEED_RECORDS } from './index.js';
import {
  activateProgramLibraryRecord,
  deactivateProgramLibraryRecord,
} from './activate.js';
import { countProgramLibraryRecords, getProgramLibraryRecord, listProgramLibrary } from './list.js';
import { tryProgramLibraryIntake } from './intake.js';
import { runPartnershipResearch } from '../creator-partnership/pipeline.js';
import { assertSafeTestDatabase } from '../test-db.js';

function quietProgramItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: '00000000-0000-4000-8000-000000000099',
    title: 'FlexPro Meals — Affiliate program',
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
    businessName: 'FlexPro Meals',
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
    sourceUrl: 'https://flexpro.example.com/affiliate',
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

describe('program library canonical identity', () => {
  it('builds stable canonical keys and does not collapse different brands on same network', () => {
    const a = buildCanonicalProgramIdentity({
      brandName: 'KC Chiefs Pro Shop',
      programName: 'KC Chiefs Pro Shop',
      affiliateNetwork: 'Impact',
    });
    const b = buildCanonicalProgramIdentity({
      brandName: 'Dream KC Smoke Shop',
      programName: 'Dream KC Smoke Shop',
      affiliateNetwork: 'Impact',
    });
    assert.notEqual(a, b);
    assert.equal(
      buildCanonicalProgramIdentity({
        brandName: 'FlexPro Meals',
        programName: 'FlexPro Meals',
      }),
      buildCanonicalProgramIdentity({
        brandName: 'FlexPro Meals',
        programName: 'FlexPro Meals',
      }),
    );
  });

  it('detects Ask Benson save intents and extracts names', () => {
    assert.equal(isProgramLibrarySaveIntent('Save FlexPro Meals affiliate program'), true);
    assert.equal(isProgramLibrarySaveIntent('Store affiliate info'), true);
    const names = extractProgramNamesFromMessage('Save FlexPro Meals affiliate program');
    assert.equal(names.brandName, 'FlexPro Meals');
  });
});

describe('program library provenance / conflicts', () => {
  it('preserves operator supplied values and surfaces official conflicts', () => {
    const conflicts: import('./types.js').ProgramLibraryConflict[] = [];
    const existing = operatorSuppliedClaim('10%');
    const incoming = {
      value: '8%',
      authority: 'official_brand' as const,
      verificationState: 'verified_official' as const,
      sourceUrl: 'https://brand.example.com/affiliate',
      observedAt: new Date().toISOString(),
      verifiedAt: new Date().toISOString(),
    };
    const merged = mergeFieldClaim({
      existing,
      incoming,
      field: 'commission/benefit',
      conflicts,
    });
    assert.equal(merged.conflictAdded, true);
    assert.equal(conflicts.length, 1);
    assert.equal(merged.claim?.value, '8%');
    assert.equal(conflicts[0]?.claims[0]?.value, '10%');
  });
});

describe('program library quiet eligibility', () => {
  it('saved programs fail Home eligibility at shared authority layer', () => {
    const result = evaluateHomeEligibility(quietProgramItem());
    assert.equal(result.eligible, false);
    assert.ok(result.reasons.includes('quiet_library_only'));
  });

  it('saved programs are excluded from Discover metadata gate', () => {
    assert.equal(
      shouldExcludeProgramLibraryFromDiscover({ programLibraryQuiet: true, ingest: 'program_library' }),
      true,
    );
    assert.equal(isProgramLibraryQuietMetadata({ programLibraryMode: 'saved' }), true);
    assert.equal(isProgramLibraryQuietMetadata({ programLibraryMode: 'activated' }), false);
  });
});

describe('program library enrichment safety', () => {
  before(() => {
    assertSafeTestDatabase();
  });
  it('verify missing info uses background caller metadata and mock search only', async () => {
    let searchCalls = 0;
    const testSearchWeb = async () => {
      searchCalls += 1;
      return {
        ok: true,
        summary: 'Official affiliate program pays 8% commission.',
        citations: [{ url: 'https://taprefer.com/mock-affiliate-program', title: 'Affiliate Program' }],
      };
    };

    const saved = await saveProgramToLibrary({
      brandName: `Mock Enrich Verify ${Date.now()}`,
      programName: `Mock Enrich Verify ${Date.now()}`,
      programType: 'affiliate',
      scope: 'national',
      commissionBenefit: '10%',
      operatorSupplied: true,
      sourceScreen: 'program_library',
    });

    const result = await verifyProgramMissingInfo(saved.programId, {
      testSearchWeb: testSearchWeb as never,
      testSkipBudgetGate: true,
      force: true,
    });
    assert.equal(result.skipped, false);
    assert.equal(searchCalls, 1);

    const program = await getProgramLibraryRecord(saved.programId);
    assert.ok(program);
    assert.ok(
      program.conflictingClaims.length >= 1 ||
        program.verificationDisplayState === 'conflicting_information',
    );
  });

  it('respects background budget gate with zero paid search calls', async () => {
    const prev = process.env.BENSON_LLM_DAILY_BUDGET_USD;
    process.env.BENSON_LLM_DAILY_BUDGET_USD = '0';
    let searchCalls = 0;
    try {
      const saved = await saveProgramToLibrary({
        brandName: 'Budget Gate Brand',
        programName: 'Budget Gate Brand',
        operatorSupplied: true,
        sourceScreen: 'program_library_test',
      });
      const result = await verifyProgramMissingInfo(saved.programId, {
        testSearchWeb: (async () => {
          searchCalls += 1;
          return { ok: true, summary: '', citations: [] };
        }) as never,
        force: true,
      });
      assert.equal(result.skipped, true);
      assert.equal(searchCalls, 0);
    } finally {
      if (prev === undefined) delete process.env.BENSON_LLM_DAILY_BUDGET_USD;
      else process.env.BENSON_LLM_DAILY_BUDGET_USD = prev;
    }
  });
});

describe('program library seed + activation', () => {
  before(() => {
    assertSafeTestDatabase();
  });
  it('seeds 15 programs idempotently with operator supplied verification only', async () => {
    const first = await seedProgramLibrary();
    assert.equal(first.canonicalIdentities.length, 15);
    assert.equal(PROGRAM_LIBRARY_SEED_RECORDS.length, 15);
    assert.ok(first.total >= 15);

    const second = await seedProgramLibrary();
    assert.equal(second.created, 0);
    assert.equal(second.updated, 15);
    assert.ok((await countProgramLibraryRecords()) >= first.total);

    const flex = (await getProgramLibraryRecord(
      (
        await saveProgramToLibrary({
          brandName: 'FlexPro Meals',
          programName: 'FlexPro Meals',
          operatorSuppliedMasterList: true,
          sourceScreen: 'lookup',
        })
      ).programId,
    ))!;
    assert.equal(flex.verificationLabel, 'Operator supplied');
    assert.notEqual(flex.verificationLabel, 'Verified official');
  });

  it('activate creates one linked partnership and repeated activate reuses it', async () => {
    const saved = await saveProgramToLibrary({
      brandName: `Activation Flow Brand ${Date.now()}`,
      programName: `Activation Flow Brand ${Date.now()}`,
      operatorSupplied: true,
      sourceScreen: 'program_library',
    });

    let researchAttempts = 0;
    const first = await activateProgramLibraryRecord(saved.programId, {
      skipResearch: true,
    });
    assert.equal(first.reusedExistingActive, false);
    assert.equal(first.partnershipId, saved.programId);

    const second = await activateProgramLibraryRecord(saved.programId, { skipResearch: true });
    assert.equal(second.reusedExistingActive, true);

    await deactivateProgramLibraryRecord(saved.programId);
    const quiet = await getProgramLibraryRecord(saved.programId);
    assert.equal(quiet?.mode, 'saved');

    await runPartnershipResearch(saved.programId);
    const afterQuiet = await getProgramLibraryRecord(saved.programId);
    assert.equal(afterQuiet?.mode, 'saved');
  });

  it('repeat save updates canonical record without duplicate', async () => {
    const a = await saveProgramToLibrary({
      brandName: 'Dedupe Repeat Brand',
      programName: 'Dedupe Repeat Brand',
      commissionBenefit: '5%',
      operatorSupplied: true,
      sourceScreen: 'test',
    });
    const b = await saveProgramToLibrary({
      brandName: 'Dedupe Repeat Brand',
      programName: 'Dedupe Repeat Brand',
      commissionBenefit: '5%',
      notes: 'Updated note',
      operatorSupplied: true,
      sourceScreen: 'test',
    });
    assert.equal(a.programId, b.programId);
    assert.equal(b.created, false);
    assert.ok(b.changes.some((c) => c.includes('notes') || c.includes('Reused')));
  });
});

describe('program library partnership pipeline quietness', () => {
  before(() => {
    assertSafeTestDatabase();
  });
  it('saved library records are excluded from active partnership list until activated', async () => {
    const { listCreatorPartnerships } = await import('../creator-partnership/pipeline.js');
    const saved = await saveProgramToLibrary({
      brandName: 'Pipeline Quiet Brand',
      programName: 'Pipeline Quiet Brand',
      operatorSupplied: true,
      sourceScreen: 'program_library_test',
    });

    const beforeActivate = await listCreatorPartnerships(100);
    assert.ok(!beforeActivate.some((p) => p.id === saved.programId));

    await activateProgramLibraryRecord(saved.programId, { skipResearch: true });
    const afterActivate = await listCreatorPartnerships(100);
    assert.ok(afterActivate.some((p) => p.id === saved.programId));

    await deactivateProgramLibraryRecord(saved.programId);
    const afterDeactivate = await listCreatorPartnerships(100);
    assert.ok(!afterDeactivate.some((p) => p.id === saved.programId));
  });
});

describe('program library test artifact list exclusion', () => {
  before(() => {
    assertSafeTestDatabase();
  });
  it('hides confirmed test fixtures from list results', async () => {
    const saved = await saveProgramToLibrary({
      brandName: 'AutoEnrich List Exclude Test',
      programName: 'AutoEnrich List Exclude Test',
      operatorSupplied: true,
      sourceScreen: 'auto_enrichment_test',
    });
    const rows = await listProgramLibrary({ limit: 200 });
    assert.ok(!rows.some((r) => r.id === saved.programId));
  });
});

describe('program library Ask Benson intake', () => {
  before(() => {
    assertSafeTestDatabase();
  });
  it('text intake persists program library and returns delta-first answer', async () => {
    const result = await tryProgramLibraryIntake({
      message: 'Save FlexPro Meals affiliate program for the library',
      conversationId: 'test-conv',
    });
    assert.equal(result.handled, true);
    if (!result.handled) return;
    assert.match(result.response.answer, /Affiliate & Creator Programs/i);
    assert.ok(
      /Saved|Reused|WHAT I DID|changed/i.test(result.response.answer),
      `unexpected answer: ${result.response.answer}`,
    );
    assert.ok(result.response.usedData?.includes('program_library'));
  });
});
