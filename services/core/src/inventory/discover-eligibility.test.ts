import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  evaluateDiscoverEligibility,
  opaqueSubjectFromTitle,
} from './discover-eligibility.js';

describe('discover eligibility — live garbage regressions', () => {
  it('A: opaque Instagram post ID is never Discover-eligible', () => {
    const result = evaluateDiscoverEligibility({
      title: 'Dbtacojzn1r at Instagram',
      category: 'creator_partnership',
      sourceUrl: 'https://www.instagram.com/p/DbtacOJzN1R/',
      metadata: { entityOpportunityType: 'creator_partnership', ingest: 'ask_benson_link' },
    });
    assert.equal(result.eligible, false);
    assert.ok(
      result.reasons.includes('opaque_content_id') || result.reasons.includes('social_post_without_entity'),
      `expected opaque/social-post gate, got ${result.reasons.join(',')}`,
    );
  });

  it('A: opaqueSubjectFromTitle catches Instagram shortcode titles', () => {
    assert.equal(opaqueSubjectFromTitle('Dbtacojzn1r at Instagram'), 'Dbtacojzn1r');
    assert.equal(opaqueSubjectFromTitle('Outsiders Social Club'), null);
  });

  it('B: Tez Carter link-hub is not restaurant/food Discover', () => {
    const result = evaluateDiscoverEligibility({
      title: 'Tez Carter Events Official: TikTok, Instagram, Facebook — KANSAS CITY',
      category: 'restaurant_food_discovery',
      locationName: 'Kansas City',
      sourceUrl: 'https://linktr.ee/tezcarterevents',
      metadata: {
        entityOpportunityType: 'restaurant_food_discovery',
        opportunityCategory: 'restaurant_food_discovery',
        ingest: 'ask_benson_link',
      },
    });
    assert.equal(result.eligible, false);
    assert.ok(
      result.reasons.includes('unsupported_food_classification') ||
        result.reasons.includes('link_hub_without_opportunity'),
      `expected food/link-hub gate, got ${result.reasons.join(',')}`,
    );
  });

  it('C: Bronx / NYC book events are not Discover-eligible', () => {
    const result = evaluateDiscoverEligibility({
      title: 'Events & Tickets — Reading Rhythms | Reading Rhythms',
      summary: 'Book events in the Bronx',
      locationName: 'The Bronx, New York',
      category: 'Event',
      sourceUrl: 'https://www.readingrhythms.co/events',
      eventStartsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      metadata: { opportunityCategory: 'Event', ingest: 'ask_benson_link' },
    });
    assert.equal(result.eligible, false);
    assert.ok(result.reasons.includes('out_of_market'), `expected out_of_market, got ${result.reasons.join(',')}`);
  });

  it('C: Japanese-language Bronx content fails geo', () => {
    const result = evaluateDiscoverEligibility({
      title: 'リーディングリズム ブロンクス',
      summary: 'ニューヨーク・ブロンクスの読書イベント',
      locationName: 'Bronx',
      category: 'Event',
      sourceUrl: 'https://example.com/reading-rhythms-ja',
      eventStartsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    });
    assert.equal(result.eligible, false);
    assert.ok(result.reasons.includes('out_of_market'));
  });

  it('historical OSC LA workers artifact is not Discover-eligible', () => {
    const result = evaluateDiscoverEligibility({
      title: 'Los Angeles Welcomes Workers with Open Arms as it Unveils a New — Kansas City',
      locationName: 'Kansas City',
      sourceUrl: 'https://www.theosc.co/events',
      metadata: { opportunityCategory: 'local_business', ingest: 'ask_benson_link' },
    });
    assert.equal(result.eligible, false);
    assert.ok(
      result.reasons.includes('known_bad_extraction') || result.reasons.includes('employment_jobs_careers'),
      `expected known_bad_extraction or employment, got ${result.reasons.join(',')}`,
    );
  });

  it('model score cannot make an out-of-market event eligible', () => {
    const result = evaluateDiscoverEligibility({
      title: 'Bronx poetry night',
      locationName: 'Bronx, NYC',
      category: 'Event',
      sourceUrl: 'https://example.com/bronx-poetry',
      eventStartsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      metadata: { opportunityCategory: 'Event', bensonScore: { composite: 99 } },
    });
    assert.equal(result.eligible, false);
    assert.ok(result.reasons.includes('out_of_market'));
  });

  it('KC nightlife event with provenance is eligible', () => {
    const result = evaluateDiscoverEligibility({
      title: 'The Reunion hosted by DJ DOT WAV',
      summary: 'DJ-led night at Outsiders Social Club in Kansas City.',
      locationName: 'Kansas City',
      category: 'Nightlife / Music',
      sourceUrl: 'https://www.theosc.co/events/reunion',
      eventStartsAt: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000),
      metadata: { opportunityCategory: 'Nightlife / Music', ingest: 'ask_benson_link' },
    });
    assert.equal(result.eligible, true, result.reasons.join(','));
  });

  it('national creator program may skip local geo', () => {
    const result = evaluateDiscoverEligibility({
      title: 'Amazon Influencer Program',
      summary: 'National creator affiliate program.',
      category: 'creator_partnership',
      sourceUrl: 'https://affiliate-program.amazon.com/',
      metadata: { opportunityCategory: 'creator_partnership', ingest: 'ask_benson_link' },
    });
    assert.equal(result.eligible, true, result.reasons.join(','));
  });

  it('national is not an excuse for an unrelated out-of-market event', () => {
    const result = evaluateDiscoverEligibility({
      title: 'National Book Festival reading in the Bronx',
      locationName: 'Bronx',
      category: 'creator_partnership',
      sourceUrl: 'https://example.com/national-book-fest',
      eventStartsAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      metadata: { opportunityCategory: 'creator_partnership' },
    });
    assert.equal(result.eligible, false);
    assert.ok(result.reasons.includes('out_of_market'));
  });
});
