import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isEmploymentOpportunity } from './employment-intent.js';
import {
  canPromoteToCreatorFacing,
  clampCreatorFacingStatus,
  evaluateCreatorFacingPromotion,
} from './creator-facing-eligibility.js';
import { evaluateHomeEligibility } from '../inventory/home-eligibility.js';
import type { InventoryItem } from '../inventory/normalize.js';

function baseItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: '00000000-0000-4000-8000-000000000099',
    title: 'Local thrift restock',
    summary: 'Shopping event',
    sourceName: 'Discount Watch',
    sourceType: 'scrape',
    category: 'local_event',
    state: 'planned',
    eventDate: '2026-08-20T00:00:00.000Z',
    eventEndDate: null,
    discoveredAt: '2026-08-10T12:00:00.000Z',
    createdAt: '2026-08-10T12:00:00.000Z',
    updatedAt: '2026-08-10T12:00:00.000Z',
    venue: null,
    businessName: "Plato's Closet",
    neighborhood: null,
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
    sourceUrl: 'https://example.com/events/restock',
    ingest: 'discount_watch',
    flags: {
      sponsorFriendly: true,
      luxury: false,
      dining: false,
      dateNight: false,
      estateSale: false,
      businessOpening: false,
      freeEvent: true,
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
    whyItMatters: 'Local shopping event — creator content fit.',
    metadata: { opportunityCategory: 'local_event', ingest: 'discount_watch' },
    relevanceScore: '0.7',
    urgencyScore: '0.4',
    coverageFormat: null,
    suggestedCoverageFormat: null,
    firsthandVisited: false,
    creatorValueStatus: 'creator_candidate',
    lifecycleStatus: 'upcoming',
    ...overrides,
  } as InventoryItem;
}

describe('employment intent — hiring event residual', () => {
  it('Open Interviews for Multiple Positions → employment (wrong category ok)', () => {
    assert.equal(
      isEmploymentOpportunity({
        title: 'Open Interviews for Multiple Positions',
        category: 'luxury_resale',
        sourceUrl: 'https://www.google.com/maps/search/Style+Encore+Overland+Park+KS',
        summary:
          'Style Encore is currently hiring for full and part-time positions, including Sales Associates. Apply: https://style-encore.com/locations/overland-park-ks/jobs',
        metadata: { opportunityCategory: 'luxury_resale', tags: ['deal', 'shopping_event'] },
      }),
      true,
    );
  });

  it('Hiring Event → employment', () => {
    assert.equal(
      isEmploymentOpportunity({
        title: 'Hiring Event',
        category: 'local_event',
        sourceUrl: 'https://example.com/events/hiring-day',
      }),
      true,
    );
  });

  it('Walk-in Interviews for Sales Associates → employment', () => {
    assert.equal(
      isEmploymentOpportunity({
        title: 'Walk-in Interviews for Sales Associates',
        category: 'retail',
        sourceUrl: 'https://example.com/store',
      }),
      true,
    );
  });

  it('Job Fair → employment', () => {
    assert.equal(
      isEmploymentOpportunity({
        title: 'Job Fair',
        category: 'community',
        sourceUrl: 'https://example.com/events/job-fair',
      }),
      true,
    );
  });

  it('Designer Interview → NOT employment', () => {
    assert.equal(
      isEmploymentOpportunity({
        title: 'Designer Interview',
        category: 'local_event',
        sourceUrl: 'https://example.com/stories/designer-interview',
        summary: 'An interview with a designer about thrift styling.',
      }),
      false,
    );
  });

  it('Creator Interview Opportunity → NOT employment', () => {
    assert.equal(
      isEmploymentOpportunity({
        title: 'Creator Interview Opportunity',
        category: 'media',
        sourceUrl: 'https://example.com/press/creator-interview',
        summary: 'Media interview opportunity for local creators.',
      }),
      false,
    );
  });

  it('existing jobs/careers fixtures remain blocked', () => {
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

  it('legitimate retail event remains Home eligible', () => {
    const item = baseItem({
      title: 'Style Encore weekend restock event',
      category: 'luxury_resale',
      summary: 'New arrivals and consignment drop this weekend.',
      metadata: { opportunityCategory: 'luxury_resale', tags: ['shopping_event'] },
    });
    assert.equal(
      isEmploymentOpportunity({
        title: item.title,
        category: item.category,
        sourceUrl: item.sourceUrl,
        summary: item.summary,
        metadata: item.metadata,
      }),
      false,
    );
    assert.equal(evaluateHomeEligibility(item).eligible, true);
  });

  it('incidental employment-opportunities prose is not a job listing', () => {
    assert.equal(
      isEmploymentOpportunity({
        title: 'halal restaurants for job seekers in kc!',
        category: 'restaurant_opening',
        sourceUrl: 'https://www.reddit.com/r/kansascity/comments/example',
        summary:
          'My friend is apartment hunting in KC because it has a lot of employment opportunities. She has restaurant experience.',
      }),
      false,
    );
  });

  it('grand opening news is not employment', () => {
    assert.equal(
      isEmploymentOpportunity({
        title: "New World Fresh Market opens second location in Kansas City's Northland",
        category: 'grand_opening',
        sourceUrl: 'https://www.kshb.com/news/local-news/example',
        summary: 'A new grocery store is opening its doors in Kansas City Northland.',
      }),
      false,
    );
  });

  it('Open Interviews fixture is Home ineligible and cannot be creator-facing promoted', () => {
    const input = {
      title: 'Open Interviews for Multiple Positions',
      category: 'luxury_resale',
      sourceUrl: 'https://www.google.com/maps/search/Style+Encore',
      summary: 'Currently hiring Sales Associates. Open interviews this week.',
      metadata: {
        opportunityCategory: 'luxury_resale',
        tags: ['deal', 'shopping_event'],
        ingest: 'discount_watch',
      },
    };
    assert.equal(canPromoteToCreatorFacing(input), false);
    assert.ok(
      evaluateCreatorFacingPromotion(input).reasons.includes('employment_jobs_careers'),
    );
    const first = clampCreatorFacingStatus('creator_candidate', input);
    const second = clampCreatorFacingStatus('creator_candidate', input);
    assert.deepEqual(first, second);
    assert.equal(first.status, 'hidden_raw_signal');

    const home = evaluateHomeEligibility(
      baseItem({
        id: 'ff3c79b5-77e2-4aff-9991-d7874ec5e9c5',
        title: input.title,
        summary: input.summary,
        category: 'luxury_resale',
        sourceUrl: input.sourceUrl,
        metadata: input.metadata,
        creatorValueStatus: 'creator_candidate',
        businessName: 'Style Encore',
      }),
    );
    assert.equal(home.eligible, false);
    assert.ok(home.reasons.includes('employment_jobs_careers'));
  });
});
