import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dedupeRecommendationsByBusiness } from './top-candidates.js';
import type { SponsorRecommendation } from './recommendations.js';

function fixtureRec(
  contentItemId: string,
  businessName: string,
  contactFirst: number,
): SponsorRecommendation {
  return {
    contentItemId,
    sponsorContactId: null,
    sponsorContactStatus: null,
    title: `${businessName} post ${contentItemId}`,
    businessName,
    category: 'test',
    sourceName: 'test-source',
    sourceUrl: `https://example.com/${contentItemId}`,
    scores: {
      sponsorFit: 50,
      audienceFit: 50,
      revenuePotential: 50,
      confidence: 50,
      contactFirst,
    },
    recommendedPitchAngle: 'test angle',
    whyBensonRecommends: 'test reason',
    expectedAudienceFit: 'good',
    suggestedContentAngle: 'test',
    suggestedSponsorshipAngle: 'test',
  };
}

describe('dedupeRecommendationsByBusiness — P10 duplicate business pitch prevention', () => {
  it('collapses multiple content items for the same business into the single highest-scoring one', () => {
    const recs = [
      fixtureRec('item-1', 'Crossroads Hotel', 87),
      fixtureRec('item-2', 'Crossroads Hotel', 91),
      fixtureRec('item-3', 'Price Chopper', 60),
    ];
    const deduped = dedupeRecommendationsByBusiness(recs);
    assert.equal(deduped.length, 2, 'expected Crossroads Hotel duplicates collapsed to one');
    const crossroads = deduped.find((r) => r.businessName === 'Crossroads Hotel');
    assert.ok(crossroads);
    assert.equal(crossroads!.contentItemId, 'item-2', 'expected the higher-scoring duplicate to win');
  });

  it('treats case/punctuation/suffix variants of a business name as the same business', () => {
    const recs = [
      fixtureRec('item-1', '21c Museum Hotels', 70),
      fixtureRec('item-2', '21c Museum Hotels, Inc.', 95),
      fixtureRec('item-3', '21C MUSEUM HOTELS', 40),
    ];
    const deduped = dedupeRecommendationsByBusiness(recs);
    assert.equal(deduped.length, 1);
    assert.equal(deduped[0]!.contentItemId, 'item-2');
  });

  it('keeps genuinely distinct businesses separate and sorted by score descending', () => {
    const recs = [
      fixtureRec('item-1', 'Alpha Bakery', 40),
      fixtureRec('item-2', 'Beta Boutique', 95),
      fixtureRec('item-3', 'Gamma Gym', 60),
    ];
    const deduped = dedupeRecommendationsByBusiness(recs);
    assert.equal(deduped.length, 3);
    assert.deepEqual(
      deduped.map((r) => r.businessName),
      ['Beta Boutique', 'Gamma Gym', 'Alpha Bakery'],
    );
  });
});
