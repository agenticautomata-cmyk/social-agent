import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { InventoryItem } from './normalize.js';
import {
  evaluateHomeEligibility,
  filterHomeEligibleItems,
  hasValidHomeCtaTarget,
  isHomeEligible,
} from './home-eligibility.js';
import { isEmploymentOpportunity } from '../creator-agent/employment-intent.js';
import { computeCommandCenter } from './command-center.js';

function baseItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    title: 'Plato Closet Overland Park thrift haul',
    summary: 'Local consignment restock',
    sourceName: 'Ask Benson',
    sourceType: 'manual',
    category: 'local_business',
    state: 'planned',
    eventDate: null,
    eventEndDate: null,
    discoveredAt: '2026-08-10T12:00:00.000Z',
    createdAt: '2026-08-10T12:00:00.000Z',
    updatedAt: '2026-08-10T12:00:00.000Z',
    venue: null,
    businessName: "Plato's Closet",
    neighborhood: 'Overland Park',
    address: null,
    locationName: 'Overland Park',
    locationStatus: 'resolved',
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
    sourceUrl: 'https://stores.platoscloset.com/op',
    ingest: 'ask_benson_link',
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
      shopping: true,
      retail: true,
      vendorMarket: false,
      collector: false,
    },
    badges: [],
    audienceScore: 6,
    whyItMatters: 'Named local business — spotlight or sponsorship outreach potential.',
    metadata: { opportunityCategory: 'local_business', ingest: 'ask_benson_link' },
    relevanceScore: '0.7',
    urgencyScore: '0.4',
    coverageFormat: null,
    suggestedCoverageFormat: null,
    firsthandVisited: false,
    creatorValueStatus: 'creator_candidate',
    lifecycleStatus: 'active',
    ...overrides,
  } as InventoryItem;
}

describe('employment intent', () => {
  it('rejects structured Employment category and jobs URL', () => {
    assert.equal(
      isEmploymentOpportunity({
        title: 'Job Opportunities',
        category: 'Employment',
        sourceUrl: 'https://style-encore.com/locations/overland-park-ks/jobs',
      }),
      true,
    );
    assert.equal(
      isEmploymentOpportunity({
        title: 'Career Opportunities',
        category: 'Employment',
        sourceUrl: 'https://overlandparkks.clothesmentor.com/pages/careers',
      }),
      true,
    );
  });

  it('does not reject creator prose that merely mentions career/opportunity', () => {
    assert.equal(
      isEmploymentOpportunity({
        title: 'Fashion career tips for thrift creators',
        category: 'local_event',
        sourceUrl: 'https://example.com/events/thrift-night',
        summary: 'An opportunity to film creator content',
      }),
      false,
    );
  });
});

describe('home eligibility gate', () => {
  it('rejects employment/job listing even when creator_candidate + active', () => {
    const item = baseItem({
      id: '2188d040-12de-45dc-a640-4f9b65811954',
      title: 'Job Opportunities',
      businessName: null,
      category: 'Employment',
      sourceUrl: 'https://style-encore.com/locations/overland-park-ks/jobs?utm_source=openai',
      sourceName: 'Share Intake',
      metadata: { opportunityCategory: 'Employment', ingest: 'ask_benson_link' },
      creatorValueStatus: 'creator_candidate',
      lifecycleStatus: 'active',
      flags: {
        ...baseItem().flags,
        sponsorFriendly: false,
        shopping: false,
        retail: true,
      },
      whyItMatters: 'Employment — retail — review for Kellie fit.',
    });
    const result = evaluateHomeEligibility(item);
    assert.equal(result.eligible, false);
    assert.ok(result.reasons.includes('employment_jobs_careers'));
  });

  it('creator_candidate alone is not sufficient', () => {
    const item = baseItem({
      title: 'Vague listing',
      businessName: null,
      category: null,
      sourceUrl: null,
      eventDate: null,
      venue: null,
      locationName: null,
      audienceScore: 1,
      flags: {
        ...baseItem().flags,
        sponsorFriendly: false,
        shopping: false,
        retail: false,
      },
      whyItMatters: 'General KC opportunity — review metadata for angle.',
      creatorValueStatus: 'creator_candidate',
    });
    // malformed (no identity) or generic_low_signal
    assert.equal(isHomeEligible(item), false);
  });

  it('accepts eligible creator/sponsor opportunity', () => {
    const item = baseItem();
    const result = evaluateHomeEligibility(item);
    assert.equal(result.eligible, true);
    assert.equal(result.executableCta, true);
  });

  it('rejects hidden/raw unqualified intake', () => {
    const item = baseItem({
      creatorValueStatus: 'hidden_raw_signal',
      ingest: 'share_intake',
      metadata: { ingest: 'share_intake' },
    });
    assert.equal(isHomeEligible(item), false);
  });

  it('rejects invalid CTA target', () => {
    const item = baseItem({
      sourceUrl: null,
      businessName: 'Local Cafe',
      googleMapsUrl: null,
      googlePlaceId: null,
      eventDate: null,
      // strip durable targets
    });
    // still has businessName → CTA valid. Build without business/url/event:
    const broken = baseItem({
      sourceUrl: null,
      businessName: null,
      eventDate: null,
      googleMapsUrl: null,
      googlePlaceId: null,
      category: 'local_event',
      title: 'Neighborhood popup market',
      flags: {
        ...baseItem().flags,
        sponsorFriendly: false,
        freeEvent: true,
      },
      whyItMatters: 'Free community event — high traffic, lower sponsor fit.',
    });
    assert.equal(hasValidHomeCtaTarget(broken), false);
    const result = evaluateHomeEligibility(broken);
    assert.equal(result.eligible, false);
    assert.ok(result.reasons.includes('invalid_cta_target') || result.ctaOnlyFailure);
  });

  it('eligibility is independent of metadata confidence score', () => {
    const highMetaEmployment = baseItem({
      title: 'Job Opportunities',
      category: 'Employment',
      sourceUrl: 'https://style-encore.com/jobs',
      metadata: { opportunityCategory: 'Employment' },
      relevanceScore: '0.99',
      businessName: 'Style Encore',
      flags: { ...baseItem().flags, reddit: false },
    });
    assert.equal(isHomeEligible(highMetaEmployment), false);

    const lowerMetaSponsor = baseItem({
      relevanceScore: '0.1',
      sourceUrl: 'https://platoscloset.example/store',
      businessName: "Plato's Closet",
    });
    assert.equal(isHomeEligible(lowerMetaSponsor), true);
  });

  it('skipped/excluded ids never enter command-center ranking', () => {
    const now = new Date('2026-08-12T17:00:00.000Z');
    const good = baseItem({
      id: '33333333-3333-4333-8333-333333333333',
      title: 'Plaza boutique grand opening',
      businessName: 'Luxe Collective',
      category: 'boutique_opening',
      eventDate: '2026-08-15T16:00:00.000Z',
      discoveredAt: '2026-08-12T10:00:00.000Z',
      createdAt: '2026-08-12T10:00:00.000Z',
      flags: {
        ...baseItem().flags,
        shopping: true,
        retail: true,
        businessOpening: true,
        sponsorFriendly: true,
        freeEvent: false,
      },
      whyItMatters: 'Grand opening — film this weekend.',
      audienceScore: 8,
      creatorValueStatus: 'actionable',
    });
    const skipped = baseItem({
      id: '44444444-4444-4444-8444-444444444444',
      title: 'Skipped thrift restock',
    });
    const cc = computeCommandCenter([good, skipped], {
      now,
      limit: 5,
      excludeIds: new Set([skipped.id]),
    });
    const ids = Object.values(cc.sections).flatMap((s) => s.items.map((c) => c.id));
    assert.ok(!ids.includes(skipped.id));
    assert.ok(ids.includes(good.id));
  });

  it('rejects expired lifecycle and soft-expired dated events (Batch 3)', () => {
    const expiredCol = baseItem({
      lifecycleStatus: 'expired',
      eventDate: '2026-08-08T00:00:00.000Z',
      eventEndDate: '2026-08-09T00:00:00.000Z',
    });
    assert.equal(isHomeEligible(expiredCol), false);
    assert.ok(evaluateHomeEligibility(expiredCol).reasons.includes('lifecycle_not_current'));

    const staleActiveCol = baseItem({
      id: 'd1101683-aaaa-4bbb-8ccc-dddddddddddd',
      title: 'Style Encore store happening',
      lifecycleStatus: 'active',
      eventDate: '2026-08-08T00:00:00.000Z',
      eventEndDate: '2026-08-09T00:00:00.000Z',
      summary:
        'The next event is scheduled for August 8th and 9th, 2026. No verified current event or sale was confirmed.',
      businessName: 'Style Encore',
      category: 'local_event',
      flags: { ...baseItem().flags, freeEvent: true },
    });
    // Soft gate: past-dated even when column still says active
    assert.equal(isHomeEligible(staleActiveCol), false);
    assert.ok(evaluateHomeEligibility(staleActiveCol).reasons.includes('lifecycle_not_current'));
  });

  it('rejects undated rows whose summary still claims a past next event', () => {
    const raw =
      'The next event is scheduled for August 8th and 9th, 2026. No verified current event or sale was confirmed.';
    const item = baseItem({
      id: '51738b24-5a79-4448-ae92-73f1217faaab',
      title: 'Style Encore Overland Park',
      eventDate: null,
      eventEndDate: null,
      lifecycleStatus: 'active',
      summaryRaw: raw,
      // Display summary may already be rewritten — soft gate must use summaryRaw.
      summary:
        'This business has run local promotions recently — worth watching for the next one.',
      businessName: 'Style Encore',
    });
    assert.equal(isHomeEligible(item), false);
  });

  it('keeps future dated events eligible when otherwise valid', () => {
    const item = baseItem({
      title: 'Future thrift event',
      eventDate: '2026-12-01T00:00:00.000Z',
      eventEndDate: '2026-12-01T00:00:00.000Z',
      lifecycleStatus: 'upcoming',
      summary: 'Upcoming consignment event on December 1, 2026.',
      flags: { ...baseItem().flags, freeEvent: true },
    });
    assert.equal(isHomeEligible(item), true);
  });

  it('ranking only runs on the eligible set', () => {
    const job = baseItem({
      id: '11111111-1111-4111-8111-111111111111',
      title: 'Job Opportunities',
      category: 'Employment',
      sourceUrl: 'https://style-encore.com/jobs',
      metadata: { opportunityCategory: 'Employment', ingest: 'ask_benson_link' },
      ingest: 'ask_benson_link',
      discoveredAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      businessName: null,
    });
    const good = baseItem({
      id: '22222222-2222-4222-8222-222222222222',
      title: 'Loews rooftop creator stay',
      businessName: 'Loews Kansas City',
      category: 'hotel_package',
      sourceUrl: 'https://www.loewshotels.com/kansas-city',
      discoveredAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });
    const cc = computeCommandCenter([job, good], { now: new Date(), limit: 5 });
    const mergedIds = [
      ...cc.sections.discoveredToday.items,
      ...cc.sections.postToday.items,
      ...cc.sections.highestConfidence.items,
      ...cc.sections.trending.items,
    ].map((c) => c.id);
    assert.ok(!mergedIds.includes(job.id));
    assert.ok(mergedIds.includes(good.id) || filterHomeEligibleItems([job, good]).some((i) => i.id === good.id));
    assert.deepEqual(
      filterHomeEligibleItems([job, good]).map((i) => i.id),
      [good.id],
    );
  });
});
