import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  extractBrandFromProgramUrl,
  extractProgramNameFromUrl,
  isProgramLibrarySaveIntent,
  isProgramLibraryVerifyIntent,
} from './canonical.js';
import { tryProgramLibraryIntake } from './intake.js';
import { getProgramLibraryRecord, listProgramLibrary } from './list.js';
import { extractBusinessNameCandidates } from '../ask-benson/evidence-orchestration/classify.js';
import { shouldExcludeProgramLibraryFromDiscover } from './eligibility.js';
import { evaluateHomeEligibility } from '../inventory/home-eligibility.js';
import type { InventoryItem } from '../inventory/normalize.js';

const ETSY_URL =
  'https://help.etsy.com/hc/en-us/articles/360000335987-The-Etsy-Affiliates-Program-and-Creator-Collective';
const ETSY_STORE_MESSAGE = `Store affiliate info\n${ETSY_URL}`;

describe('etsy affiliate routing regression', () => {
  it('recognizes Store as persistence intent with affiliate info + URL', () => {
    assert.equal(isProgramLibrarySaveIntent(ETSY_STORE_MESSAGE), true);
    assert.equal(isProgramLibrarySaveIntent('store affiliate info'), true);
    assert.equal(isProgramLibrarySaveIntent('save affiliate info'), true);
    assert.equal(isProgramLibraryVerifyIntent(ETSY_STORE_MESSAGE), false);
    assert.equal(
      isProgramLibraryVerifyIntent(`Store affiliate info and verify it\n${ETSY_URL}`),
      true,
    );
  });

  it('extracts brand Etsy from help.etsy.com — never Help', () => {
    assert.equal(extractBrandFromProgramUrl(ETSY_URL), 'Etsy');
    assert.notEqual(extractBrandFromProgramUrl(ETSY_URL), 'Help');
    assert.equal(extractBrandFromProgramUrl('https://app.revolve.com/affiliate'), 'Revolve');
    assert.equal(
      extractProgramNameFromUrl(ETSY_URL, 'Etsy'),
      'Etsy Creator Collective',
    );
  });

  it('evidence classifier never emits Help as a business name from help.etsy.com', () => {
    const names = extractBusinessNameCandidates(ETSY_STORE_MESSAGE);
    assert.ok(names.includes('Etsy') || names.some((n) => /etsy/i.test(n)));
    assert.ok(!names.some((n) => /^help$/i.test(n)));
  });

  it('routes Store affiliate info + Etsy URL to Affiliate & Creator Programs without paid search', async () => {
    const result = await tryProgramLibraryIntake({
      message: ETSY_STORE_MESSAGE,
      conversationId: 'etsy-routing-test-store',
      sourceScreen: 'ask_benson',
    });
    assert.equal(result.handled, true);
    if (!result.handled) return;

    assert.equal(result.response.ok, true);
    assert.match(result.response.answer, /Etsy/i);
    assert.match(result.response.answer, /Affiliate & Creator Programs/i);
    assert.ok(!/Did not mutate/i.test(result.response.answer));
    assert.ok(!/business_name:Help/i.test(result.response.answer));
    assert.ok(!/SCHEELS/i.test(result.response.answer));
    assert.equal((result.response as { programLibrary?: { searchCalls?: number } }).programLibrary?.searchCalls ?? 0, 0);

    const programId = (result.response as { programLibrary?: { programId?: string } }).programLibrary
      ?.programId;
    assert.ok(programId);
    const record = await getProgramLibraryRecord(programId!);
    assert.ok(record);
    assert.equal(record!.brandName, 'Etsy');
    assert.match(record!.programName, /Etsy/i);
    assert.equal(record!.mode, 'saved');
    assert.equal(record!.officialProgramUrl, ETSY_URL);
  });

  it('reuses canonical Etsy record on repeat and stays quiet', async () => {
    const first = await tryProgramLibraryIntake({
      message: ETSY_STORE_MESSAGE,
      conversationId: 'etsy-routing-test-dedupe-1',
      sourceScreen: 'ask_benson',
    });
    assert.equal(first.handled, true);
    if (!first.handled) return;
    const firstId = (first.response as { programLibrary?: { programId?: string } }).programLibrary
      ?.programId;

    const second = await tryProgramLibraryIntake({
      message: ETSY_STORE_MESSAGE,
      conversationId: 'etsy-routing-test-dedupe-2',
      sourceScreen: 'ask_benson',
    });
    assert.equal(second.handled, true);
    if (!second.handled) return;
    const secondId = (second.response as { programLibrary?: { programId?: string } }).programLibrary
      ?.programId;
    assert.equal(secondId, firstId);
    assert.equal(
      (second.response as { programLibrary?: { created?: boolean } }).programLibrary?.created,
      false,
    );

    const etsyRows = (await listProgramLibrary({ limit: 200 })).filter(
      (p) => p.brandName === 'Etsy' || /etsy/i.test(p.programName),
    );
    assert.equal(etsyRows.length, 1);

    const home = evaluateHomeEligibility({
      id: '00000000-0000-4000-8000-0000000000aa',
      title: 'Etsy Creator Collective',
      summary: '',
      sourceName: 'Program Library',
      sourceType: 'manual',
      category: 'creator_partnership',
      state: 'planned',
      eventDate: null,
      eventEndDate: null,
      discoveredAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      venue: null,
      businessName: 'Etsy',
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
      sourceUrl: ETSY_URL,
      ingest: 'program_library',
      flags: {} as never,
      badges: [],
      audienceScore: 4,
      whyItMatters: '',
      metadata: {
        programLibraryQuiet: true,
        quietLibraryOnly: true,
        programLibraryMode: 'saved',
        ingest: 'program_library',
      },
      relevanceScore: '0.4',
      urgencyScore: '0.1',
      coverageFormat: null,
      suggestedCoverageFormat: null,
      firsthandVisited: false,
      creatorValueStatus: 'hidden_raw_signal',
      lifecycleStatus: 'active',
    } as InventoryItem);
    assert.equal(home.eligible, false);
    assert.equal(
      shouldExcludeProgramLibraryFromDiscover({
        programLibraryQuiet: true,
        ingest: 'program_library',
      }),
      true,
    );
  });

  it('Store + verify chains verification; plain Store does not', async () => {
    const storeOnly = await tryProgramLibraryIntake({
      message: ETSY_STORE_MESSAGE,
      conversationId: 'etsy-routing-test-no-verify',
      sourceScreen: 'ask_benson',
    });
    assert.equal(storeOnly.handled, true);
    if (!storeOnly.handled) return;
    assert.equal(
      (storeOnly.response as { programLibrary?: { verified?: boolean; searchCalls?: number } })
        .programLibrary?.verified,
      false,
    );
    assert.equal(
      (storeOnly.response as { programLibrary?: { searchCalls?: number } }).programLibrary
        ?.searchCalls ?? 0,
      0,
    );

    let verifyCalls = 0;
    const chained = await tryProgramLibraryIntake({
      message: `Store affiliate info and verify it\n${ETSY_URL}`,
      conversationId: 'etsy-routing-test-with-verify',
      sourceScreen: 'ask_benson',
      testVerifyProgramMissingInfo: async (programId) => {
        verifyCalls += 1;
        return {
          programId,
          skipped: false,
          searchCalls: 1,
          changes: ['mock verify'],
          verificationDisplayState: 'needs_verification',
        };
      },
    });
    assert.equal(chained.handled, true);
    if (!chained.handled) return;
    assert.equal(verifyCalls, 1);
    assert.equal(
      (chained.response as { programLibrary?: { verified?: boolean; searchCalls?: number } })
        .programLibrary?.verified,
      true,
    );
    assert.equal(
      (chained.response as { programLibrary?: { searchCalls?: number } }).programLibrary
        ?.searchCalls,
      1,
    );
  });
});
