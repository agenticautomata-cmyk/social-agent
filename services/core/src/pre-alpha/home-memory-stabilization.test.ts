import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import type { InventoryItem } from '../inventory/normalize.js';
import type { SponsorIntelligenceResponse, SponsorRecommendation } from '../sponsor-intelligence/recommendations.js';
import {
  rankedSponsorRecommendationsFromIntel,
  topSponsorCandidatesFromIntel,
} from '../sponsor-intelligence/top-candidates.js';
import {
  getHomeComputationMetrics,
  recordHomeInventoryLoad,
  recordHomeSponsorIntelCompute,
  resetHomeComputationMetricsForTests,
} from './home-computation-metrics.js';
import {
  computePreAlphaHome,
  computePreAlphaHomeInternal,
  resetHomeSingleflightForTests,
  __setHomeComputationInFlightForTests,
} from './home.js';
import { computeStudioPulse } from './studio-pulse.js';
import { collectActionCenterItems } from '../action-center/collect.js';

const sampleItem = {
  id: 'item-1',
  title: 'Sample Event',
  summary: null,
  sourceName: 'Test Source',
  sourceType: 'scrape',
  category: 'local_event',
  state: 'planned',
  eventDate: null,
  eventEndDate: null,
  discoveredAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  venue: null,
  businessName: 'Sample Biz',
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
  sourceUrl: 'https://example.com',
  ingest: 'scrape_listing',
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
  audienceScore: 5,
  whyItMatters: 'Test',
  metadata: {},
  relevanceScore: null,
  urgencyScore: null,
  coverageFormat: null,
  suggestedCoverageFormat: null,
  firsthandVisited: false,
  creatorValueStatus: 'actionable',
  lifecycleStatus: 'upcoming',
} satisfies InventoryItem;

const sampleRec: SponsorRecommendation = {
  contentItemId: 'item-1',
  sponsorContactId: null,
  sponsorContactStatus: null,
  title: 'Sample Event',
  businessName: 'Sample Biz',
  category: 'local_event',
  sourceName: 'Test Source',
  sourceUrl: 'https://example.com',
  scores: {
    sponsorFit: 80,
    audienceFit: 70,
    revenuePotential: 60,
    confidence: 75,
    contactFirst: 72,
  },
  recommendedPitchAngle: 'Angle',
  whyBensonRecommends: 'Why',
  expectedAudienceFit: 'High',
  suggestedContentAngle: 'Content',
  suggestedSponsorshipAngle: 'Sponsor',
};

const sampleIntel: SponsorIntelligenceResponse = {
  demoMode: false,
  generatedAt: new Date().toISOString(),
  analyticsAvailable: false,
  counts: { totalEligible: 1, dismissed: 0, withLeads: 0 },
  sections: [
    {
      id: 'contactFirst',
      title: 'Contact First',
      description: 'd',
      items: [sampleRec],
    },
  ],
};

describe('home memory stabilization', () => {
  beforeEach(() => {
    resetHomeSingleflightForTests();
    resetHomeComputationMetricsForTests();
  });

  it('reuses ranked recommendations from precomputed intel', () => {
    const ranked = rankedSponsorRecommendationsFromIntel(sampleIntel);
    assert.equal(ranked.length, 1);
    const top = topSponsorCandidatesFromIntel(sampleIntel, { limit: 3 });
    assert.equal(top.items.length, 1);
    assert.equal(top.items[0]!.contentItemId, 'item-1');
  });

  it('metrics track inventory and sponsor intel counts', () => {
    recordHomeInventoryLoad();
    recordHomeSponsorIntelCompute();
    const m = getHomeComputationMetrics();
    assert.equal(m.inventoryLoadCount, 1);
    assert.equal(m.sponsorIntelComputeCount, 1);
  });

  it('studio pulse uses injected inventory and shared sponsor ranked without reloading inventory', async () => {
    const pulse = await computeStudioPulse({
      inventory: [sampleItem],
      sharedSponsorRanked: [sampleRec],
      sharedSponsorIntel: sampleIntel,
    });
    assert.ok(typeof pulse.outreachMode === 'string');
    assert.ok(typeof pulse.pendingEmailApprovals === 'number');
  });

  it('action center collect accepts injected inventory and shared sponsor ranked', async () => {
    const items = await collectActionCenterItems(new Date(), {
      inventory: [sampleItem],
      sharedSponsorRanked: [sampleRec],
      sharedSponsorIntel: sampleIntel,
    });
    assert.ok(Array.isArray(items));
  });

  it('one Home computation loads inventory once and computes sponsor intel once', async () => {
    const home = await computePreAlphaHomeInternal({ demoMode: true });
    const metrics = getHomeComputationMetrics();
    assert.equal(metrics.inventoryLoadCount, 1);
    assert.equal(metrics.sponsorIntelComputeCount, 1);
    assert.ok(home.generatedAt);
    assert.ok(Array.isArray(home.priorities));
    assert.ok(home.metrics);
  });

  it('concurrent Home calls join single underlying computation', async () => {
    const [a, b] = await Promise.all([computePreAlphaHome({ demoMode: true }), computePreAlphaHome()]);
    const metrics = getHomeComputationMetrics();
    assert.equal(metrics.inventoryLoadCount, 1);
    assert.equal(metrics.sponsorIntelComputeCount, 1);
    assert.equal(a.generatedAt, b.generatedAt);
  });

  it('singleflight clears after success', async () => {
    await computePreAlphaHome({ demoMode: true });
    resetHomeComputationMetricsForTests();
    await computePreAlphaHome({ demoMode: true });
    const metrics = getHomeComputationMetrics();
    assert.equal(metrics.inventoryLoadCount, 1);
  });

  it('singleflight clears after failure', async () => {
    resetHomeSingleflightForTests();
    __setHomeComputationInFlightForTests(
      Promise.reject(new Error('simulated home failure')).finally(() => {
        __setHomeComputationInFlightForTests(null);
      }) as Promise<import('./home.js').PreAlphaHomeResponse>,
    );
    await assert.rejects(() => computePreAlphaHome());
    resetHomeComputationMetricsForTests();
    await computePreAlphaHome({ demoMode: true });
    assert.equal(getHomeComputationMetrics().inventoryLoadCount, 1);
  });

  it('standalone studio pulse still accepts optional inventory-only path', async () => {
    const pulse = await computeStudioPulse({ inventory: [sampleItem] });
    assert.ok(typeof pulse.pendingEmailApprovals === 'number');
  });

  it('Home response includes expected top-level contract fields', async () => {
    const home = await computePreAlphaHome({ demoMode: true });
    assert.ok('greeting' in home);
    assert.ok('dailyBriefing' in home);
    assert.ok('studioPulse' in home);
    assert.ok('metrics' in home);
    assert.ok('topSponsorCandidates' in home);
    assert.ok(Array.isArray(home.quickLinks));
    assert.ok(home.showroom);
    assert.ok(home.showroom.hero);
    assert.ok(home.showroom.needsYou.length <= 3);
    assert.ok(home.showroom.bestMove === null || Boolean(home.showroom.bestMove.id));
    assert.ok(Array.isArray(home.showroom.businessSummary));
    assert.ok(home.showroom.businessSummary.length <= 5);
    assert.ok(home.showroom.sinceLastSync);
    assert.match(home.showroom.sinceLastSync.headline, /Since your last sync/i);
    assert.ok(home.showroom.sinceLastSync.points.length >= 1);
    assert.ok(home.showroom.sinceLastSync.points.length <= 5);
    assert.ok(home.showroom.creatorAnalytics);
    assert.ok(Array.isArray(home.showroom.creatorAnalytics.tiles));
  });
});
