import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOpportunityFingerprint,
  inferBrandSlugFromIntel,
  normalizeSourceUrl,
  parsePartnershipUrl,
} from './url-intelligence.js';
import {
  classifyUrlIntakeRoute,
  shouldOpenCreatorOpportunityPipeline,
  shouldRouteToCreatorPartnership,
} from './url-intake-route.js';
import { sanitizeStoryAngles } from './story-angles.js';
import { rankPartnershipNextActions } from './next-actions.js';
import { attachPartnershipSource, listPartnershipSources } from './partnership-sources.js';
import { buildProvisionalDecisionBrief } from './decision-brief.js';
import type { PartnershipResearch } from './types.js';

const SCHEELS_WGACA_URL =
  'https://www.scheels.com/c/all/b/what%20goes%20around%20comes%20around?r=storeAvailability%3A88';

function emptyField() {
  return { value: null, status: 'unavailable' as const, source: null };
}

describe('sync path performance (network-free)', () => {
  it('parse + classify + provisional brief stays well under 1–3s budget', () => {
    const url = SCHEELS_WGACA_URL;
    const msg = `Research this creator partnership opportunity ${url}`;
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) {
      const intel = parsePartnershipUrl(url);
      classifyUrlIntakeRoute({ url, message: msg });
      buildProvisionalDecisionBrief({
        partnershipId: 'perf',
        brandName: 'Brand',
        retailerName: 'Retailer',
        title: 'Brand at Retailer',
        urlIntel: intel,
        researchStatus: 'queued',
      });
    }
    const elapsed = performance.now() - t0;
    assert.ok(elapsed < 500, `20 iterations took ${elapsed}ms (expected <500ms CPU)`);
  });
});

describe('url-intelligence normalize + parse', () => {
  it('normalizes host, strips tracking, keeps semantic query params', () => {
    const normalized = normalizeSourceUrl(
      'https://WWW.Example.com/path/?utm_source=x&r=storeAvailability%3A88&fbclid=abc',
    );
    assert.match(normalized, /^https:\/\/example\.com\/path\?r=/);
    assert.doesNotMatch(normalized, /utm_source|fbclid/);
  });

  it('decodes storeAvailability filter without asserting inventory (SCHEELS fixture behaviors)', () => {
    const intel = parsePartnershipUrl(SCHEELS_WGACA_URL);
    assert.equal(intel.registrableDomain, 'scheels.com');
    assert.ok(intel.storeFilterTokens.some((t) => t.storeId === '88'));
    assert.ok(intel.heuristics.some((h) => h.label === 'likely_store_filter'));
    assert.ok(intel.heuristics.some((h) => h.label === 'likely_category_path'));
    const brandSlug = inferBrandSlugFromIntel(intel);
    assert.ok(brandSlug);
    assert.match(brandSlug!.toLowerCase(), /what goes around comes around/);
    // Must not encode retailer-specific store city/name as product logic — only decode structure.
    assert.equal(intel.storeFilterTokens[0]?.storeId, '88');
  });

  it('builds stable opportunity fingerprints', () => {
    const a = buildOpportunityFingerprint({
      registrableDomain: 'scheels.com',
      brandSlug: 'what goes around comes around',
      retailerSlug: 'scheels',
      collectionSlug: 'what goes around comes around',
    });
    const b = buildOpportunityFingerprint({
      registrableDomain: 'scheels.com',
      brandSlug: 'what goes around comes around',
      retailerSlug: 'scheels',
      collectionSlug: 'what goes around comes around',
    });
    assert.equal(a, b);
    assert.equal(a.length, 32);
  });
});

describe('route arbitration regressions', () => {
  it('initially classifies plain commerce URL as local_discovery but opens opportunity pipeline', () => {
    const result = classifyUrlIntakeRoute({ url: SCHEELS_WGACA_URL, message: SCHEELS_WGACA_URL });
    assert.notEqual(result.route, 'creator_partnership');
    assert.equal(result.route, 'local_discovery');
    const gate = shouldOpenCreatorOpportunityPipeline(SCHEELS_WGACA_URL);
    assert.equal(gate.open, true);
    assert.equal(gate.initialRoute, 'local_discovery');
    assert.equal(gate.reason, 'commerce_opportunity_candidate');
  });

  it('routes creator-program language + commerce URL to partnership', () => {
    const msg = `Research this creator partnership opportunity ${SCHEELS_WGACA_URL}`;
    assert.equal(shouldRouteToCreatorPartnership(msg), true);
    assert.equal(classifyUrlIntakeRoute({ url: SCHEELS_WGACA_URL, message: msg }).route, 'creator_partnership');
  });

  it('routes Eventbrite to event_opportunity', () => {
    const url = 'https://www.eventbrite.com/e/some-concert-tickets-123';
    assert.equal(classifyUrlIntakeRoute({ url, message: url }).route, 'event_opportunity');
  });

  it('routes restaurant menu path to local_discovery, not partnership', () => {
    const url = 'https://example-bistro.com/menu';
    const result = classifyUrlIntakeRoute({ url, message: url });
    assert.equal(result.route, 'local_discovery');
    assert.notEqual(result.route, 'creator_partnership');
    assert.equal(shouldOpenCreatorOpportunityPipeline(url).open, false);
    assert.equal(shouldOpenCreatorOpportunityPipeline(url).reason, 'local_business_path_block');
  });

  it('blocks plural /menus restaurant paths from creator-opportunity pipeline', () => {
    const cases = [
      'https://example-bistro.com/menus',
      'https://example-bistro.com/menus/',
      'https://example-bistro.com/menus?foo=bar',
      'https://www.thefarmhousekc.com/menus',
    ];
    for (const url of cases) {
      const result = classifyUrlIntakeRoute({ url, message: url });
      assert.equal(result.route, 'local_discovery', url);
      assert.notEqual(result.route, 'creator_partnership', url);
      const gate = shouldOpenCreatorOpportunityPipeline(url);
      assert.equal(gate.open, false, url);
      assert.equal(gate.reason, 'local_business_path_block', url);
    }
  });

  it('keeps ordinary product/category commerce URL as opportunity candidate', () => {
    const url = 'https://www.jared.com/jewelry/handbags/c/7000001712?icid=MM:J:ReklaimHandbags';
    const result = classifyUrlIntakeRoute({ url, message: url });
    assert.notEqual(result.route, 'creator_partnership');
    const gate = shouldOpenCreatorOpportunityPipeline(url);
    assert.equal(gate.open, true);
    assert.equal(gate.reason, 'commerce_opportunity_candidate');
  });

  it('routes program path with affiliate language to partnership', () => {
    const url = 'https://brand.example.com/pages/creator-program';
    const msg = `Check this affiliate program ${url}`;
    assert.equal(classifyUrlIntakeRoute({ url, message: msg }).route, 'creator_partnership');
    assert.equal(shouldOpenCreatorOpportunityPipeline(msg).open, true);
  });
});

describe('source attach abstraction', () => {
  it('dedupes same normalized URL and tracks lastObservedAt', () => {
    const intel = parsePartnershipUrl(SCHEELS_WGACA_URL);
    let meta = {};
    const first = attachPartnershipSource(meta, {
      originalUrl: intel.originalUrl,
      normalizedUrl: intel.normalizedUrl,
      role: 'discovery',
      parseSnapshot: intel,
    });
    assert.equal(first.attached, true);
    const second = attachPartnershipSource(first.metadata, {
      originalUrl: intel.originalUrl + '&utm_source=x',
      normalizedUrl: intel.normalizedUrl,
      role: 'discovery',
      parseSnapshot: intel,
    });
    assert.equal(second.attached, false);
    assert.equal(second.updated, true);
    assert.equal(listPartnershipSources(second.metadata).length, 1);
  });

  it('attaches multiple distinct source URLs to one opportunity metadata', () => {
    const a = parsePartnershipUrl(SCHEELS_WGACA_URL);
    const b = parsePartnershipUrl('https://www.scheels.com/pages/creator-program');
    let meta = {};
    meta = attachPartnershipSource(meta, {
      originalUrl: a.originalUrl,
      normalizedUrl: a.normalizedUrl,
      role: 'discovery',
    }).metadata;
    meta = attachPartnershipSource(meta, {
      originalUrl: b.originalUrl,
      normalizedUrl: b.normalizedUrl,
      role: 'program',
    }).metadata;
    assert.equal(listPartnershipSources(meta).length, 2);
  });
});

describe('SCHEELS provisional brief behaviors', () => {
  it('provisional brief marks store filter as provisional, not confirmed inventory', () => {
    const intel = parsePartnershipUrl(SCHEELS_WGACA_URL);
    const brief = buildProvisionalDecisionBrief({
      partnershipId: 'test-id',
      brandName: 'What Goes Around Comes Around',
      retailerName: 'Scheels',
      title: 'What Goes Around Comes Around at Scheels',
      urlIntel: intel,
      researchStatus: 'queued',
    });
    assert.equal(brief.phase, 'provisional');
    assert.ok(brief.provisionalSignals.some((s) => /filter|store/i.test(s)));
    assert.ok(!brief.provisionalSignals.some((s) => /confirmed (in[- ]store|stock)/i.test(s)));
    assert.ok(brief.knownGaps.some((g) => /inventory/i.test(g)));
  });
});

describe('story angles + next actions (deterministic)', () => {
  it('blocks in-store angles when inventory unresolved and ranks call_location first', () => {
    const research: PartnershipResearch = {
      companySummary: emptyField(),
      audienceFitRationale: emptyField(),
      creatorProgram: { value: 'Apply online', status: 'inferred', source: 'web' },
      programBenefits: emptyField(),
      programRequirements: emptyField(),
      socialAccounts: emptyField(),
      recentCollaborations: emptyField(),
      retailerRelationships: emptyField(),
      localFilmingPotential: {
        value: null,
        status: 'needs_verification',
        source: null,
      },
      creatorContactPath: emptyField(),
      productsPricingHooks: emptyField(),
      organicBeforeApproval: emptyField(),
      needsVerification: ['NEEDS VERIFICATION: Store inventory for filming'],
      citations: [],
      localLocations: [
        {
          name: 'Area store',
          address: null,
          availability: 'unknown_call_first',
          notes: null,
          source: null,
        },
      ],
      researchSummary: null,
      researchedAt: new Date().toISOString(),
      storyAngleCandidates: [
        {
          angle: 'Film an in-store haul showing pieces on the floor',
          premiseTags: ['inferred'],
        },
        {
          angle: 'Talk through the brand story from official pages',
          premiseTags: ['inferred'],
        },
      ],
      nextActionInputs: [
        { action: 'build_creator_play', rationale: 'Draft play' },
        { action: 'call_location', rationale: 'Verify stock' },
      ],
    };

    const angles = sanitizeStoryAngles(research.storyAngleCandidates, research);
    assert.ok(angles.some((a) => a.status === 'blocked' && /in-store/i.test(a.angle)));

    const actions = rankPartnershipNextActions({
      partnershipId: 'p1',
      research,
      nextActionInputs: research.nextActionInputs,
      storyAngles: angles,
      fitScore: 55,
    });
    assert.equal(actions[0]?.action, 'call_location');
  });
});
