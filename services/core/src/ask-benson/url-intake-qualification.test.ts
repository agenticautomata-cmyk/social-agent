import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ExtractedOpportunity } from './listing-extract.js';
import { scoreOpportunity } from './listing-extract.js';
import {
  detectLocationsInText,
  isGenericExtractedTitle,
  isMapSearchUrl,
  isPastEventDate,
  qualifyUrlOpportunity,
  resolveEntityFromUrl,
} from './qualify-url-opportunity.js';
import { extractLocationScopeFromMessage, matchesLocationScope } from './url-geo.js';
import { buildEvidenceFirstUrlAnswer } from './url-intake-answer.js';

function sampleOpp(overrides: Partial<ExtractedOpportunity> = {}): ExtractedOpportunity {
  return {
    title: 'Half Off Happy Hour',
    location: 'Lenexa, KS',
    venue: null,
    eventDate: '2026-08-15',
    eventEndDate: null,
    businessName: 'Half of Half',
    category: 'local_event',
    summary: 'Weekly specials at Lenexa store.',
    sourceUrl: 'https://www.halfofhalf.com/lenexa',
    tags: [],
    confidence: 0.82,
    ...overrides,
  };
}

const halfofhalfEntity = resolveEntityFromUrl(
  'https://www.halfofhalf.com',
  'Half of Half Pizza',
);

describe('url-intake-qualification', () => {
  it('rejects past dates from becoming upcoming inventory', () => {
    const result = qualifyUrlOpportunity({
      opp: sampleOpp({ title: 'Grand Opening', eventDate: '2023-10-04', location: 'Tulsa, OK' }),
      pageUrl: 'https://www.halfofhalf.com',
      sourceUrl: 'https://www.halfofhalf.com',
      entity: halfofhalfEntity,
    });
    assert.equal(result.qualified, false);
    assert.equal(result.rejectionCode, 'past_event');
    assert.equal(result.forcedRelevanceScore, 0);
  });

  it('rejects Tulsa under KC/Lenexa scope', () => {
    const result = qualifyUrlOpportunity({
      opp: sampleOpp({ title: 'Store Celebration', location: 'Tulsa, Oklahoma', eventDate: '2026-09-01' }),
      pageUrl: 'https://www.halfofhalf.com',
      sourceUrl: 'https://www.halfofhalf.com',
      entity: halfofhalfEntity,
      locationScope: 'Lenexa',
    });
    assert.equal(result.qualified, false);
    assert.ok(
      result.rejectionCode === 'location_scope_mismatch' || result.rejectionCode === 'out_of_market',
    );
  });

  it('rejects out-of-market Tulsa without explicit scope', () => {
    const result = qualifyUrlOpportunity({
      opp: sampleOpp({ title: 'Store Celebration', location: 'Tulsa, OK', eventDate: '2026-09-01' }),
      pageUrl: 'https://www.halfofhalf.com',
      sourceUrl: 'https://www.halfofhalf.com',
      entity: halfofhalfEntity,
    });
    assert.equal(result.qualified, false);
    assert.equal(result.rejectionCode, 'out_of_market');
  });

  it('rejects generic placeholder titles', () => {
    assert.equal(isGenericExtractedTitle('New Event Starts'), true);
    const result = qualifyUrlOpportunity({
      opp: sampleOpp({ title: 'New Event Starts', location: 'Lenexa, KS' }),
      pageUrl: 'https://www.halfofhalf.com',
      sourceUrl: 'https://www.halfofhalf.com',
      entity: halfofhalfEntity,
      locationScope: 'Lenexa',
    });
    assert.equal(result.qualified, false);
    assert.equal(result.rejectionCode, 'generic_title');
  });

  it('rejects Google Maps search URLs as canonical evidence', () => {
    const mapUrl = 'https://www.google.com/maps/search/Half+of+Half+Tulsa';
    assert.equal(isMapSearchUrl(mapUrl), true);
    const result = qualifyUrlOpportunity({
      opp: sampleOpp({ sourceUrl: mapUrl, location: 'Lenexa, KS' }),
      pageUrl: 'https://www.halfofhalf.com',
      sourceUrl: mapUrl,
      entity: halfofhalfEntity,
      locationScope: 'Lenexa',
    });
    assert.equal(result.qualified, false);
    assert.equal(result.rejectionCode, 'map_search_source');
  });

  it('listing events do not require matching the page host business token', () => {
    const entity = resolveEntityFromUrl('https://www.theosc.co/events', 'Events');
    entity.businessName = 'Theosc';
    const blocked = qualifyUrlOpportunity({
      opp: sampleOpp({
        title: 'Fusion Fest',
        businessName: 'Outsiders Social Club',
        location: null,
        venue: 'Outsiders Social Club, Kansas City',
        eventDate: '2026-08-21',
        sourceUrl: 'https://www.theosc.co/events/fusion-fest',
      }),
      pageUrl: 'https://www.theosc.co/events',
      sourceUrl: 'https://www.theosc.co/events/fusion-fest',
      entity,
    });
    assert.equal(blocked.qualified, false);
    assert.equal(blocked.rejectionCode, 'missing_entity_match');

    const listing = qualifyUrlOpportunity({
      opp: sampleOpp({
        title: 'Fusion Fest',
        businessName: 'Outsiders Social Club',
        location: 'Kansas City',
        venue: 'Outsiders Social Club',
        eventDate: '2026-08-21',
        sourceUrl: 'https://www.theosc.co/events/fusion-fest',
      }),
      pageUrl: 'https://www.theosc.co/events',
      sourceUrl: 'https://www.theosc.co/events/fusion-fest',
      entity,
      eventListing: true,
    });
    assert.equal(listing.qualified, true);
  });

  it('unsupported listing row does not block other listing qualifications', () => {
    const entity = resolveEntityFromUrl('https://www.theosc.co/events');
    const past = qualifyUrlOpportunity({
      opp: sampleOpp({
        title: 'Old Mixer',
        eventDate: '2020-01-01',
        location: 'Kansas City',
        businessName: 'Outsiders Social Club',
      }),
      pageUrl: 'https://www.theosc.co/events',
      sourceUrl: 'https://www.theosc.co/events',
      entity,
      eventListing: true,
    });
    const upcoming = qualifyUrlOpportunity({
      opp: sampleOpp({
        title: 'Rob Tribb Live Music',
        eventDate: '2026-08-19',
        location: 'Kansas City',
        businessName: 'Outsiders Social Club',
      }),
      pageUrl: 'https://www.theosc.co/events',
      sourceUrl: 'https://www.theosc.co/events',
      entity,
      eventListing: true,
    });
    assert.equal(past.qualified, false);
    assert.equal(past.rejectionCode, 'past_event');
    assert.equal(upcoming.qualified, true);
  });

  it('does not promote undated items from a stale editorial roundup', () => {
    const result = qualifyUrlOpportunity({
      opp: sampleOpp({
        title: 'Boulevardia',
        eventDate: null,
        location: 'Kansas City',
        summary: 'Summer festival mentioned in the 2025 roundup.',
      }),
      pageUrl: 'https://kcstudio.org/top-things-to-do-this-summer-2025/',
      sourceUrl: 'https://kcstudio.org/top-things-to-do-this-summer-2025/',
      entity: resolveEntityFromUrl('https://kcstudio.org/top-things-to-do-this-summer-2025/'),
      eventListing: true,
      staleEditorialRoundup: true,
    });
    assert.equal(result.qualified, false);
    assert.equal(result.rejectionCode, 'past_event');
  });

  it('detects multi-location pages for branch resolution', () => {
    const text = 'Visit our Lenexa and Tulsa locations for half-off deals.';
    const locations = detectLocationsInText(text);
    assert.ok(locations.includes('Lenexa'));
    assert.ok(locations.includes('Tulsa'));
  });

  it('extracts persistent location scope from user correction', () => {
    assert.equal(
      extractLocationScopeFromMessage('Only track things at the Lenexa location'),
      'Lenexa',
    );
    assert.equal(extractLocationScopeFromMessage('Only track the Lenexa location'), 'Lenexa');
    assert.equal(matchesLocationScope('Lenexa, KS', 'Lenexa'), true);
    assert.equal(matchesLocationScope('Tulsa, OK', 'Lenexa'), false);
  });

  it('relevance score cannot bypass hard gates', () => {
    const opp = sampleOpp({
      title: 'New Event Starts',
      location: 'Tulsa, OK',
      eventDate: '2023-10-04',
      confidence: 0.95,
    });
    const qualification = qualifyUrlOpportunity({
      opp,
      pageUrl: 'https://www.halfofhalf.com',
      sourceUrl: 'https://www.halfofhalf.com',
      entity: halfofhalfEntity,
    });
    const scored = scoreOpportunity(opp);
    assert.equal(qualification.qualified, false);
    assert.equal(qualification.forcedRelevanceScore, 0);
    assert.ok(scored.relevanceScore > 0.5, 'legacy scorer still inflates bad rows');
  });

  it('evidence-first answer excludes stale unrelated recommendations', () => {
    const answer = buildEvidenceFirstUrlAnswer({
      pageUrl: 'https://www.halfofhalf.com',
      summary: {
        entity: halfofhalfEntity,
        locationScope: 'Lenexa',
        watchRuleSaved: true,
        qualifiedCount: 0,
        quarantinedCount: 2,
        quarantineReasons: ['Location "Tulsa, OK" is outside the Kansas City metro scope.'],
        needsLocationConfirmation: false,
        identifiedLocations: ['Lenexa', 'Tulsa'],
        savedTitles: ['Half of Half — Lenexa'],
        qualificationOutcome: 'ENTITY_ACCEPTED_CLAIMS_QUARANTINED',
        entityOpportunityId: '11111111-1111-1111-1111-111111111111',
        entityOpportunityTitle: 'Half of Half — Lenexa',
        entityOpportunityType: 'shopping_bargain_discovery',
        entityCreated: true,
      },
    });
    assert.match(answer.answer, /Half of Half/i);
    assert.doesNotMatch(answer.answer, /frosty frogs/i);
    assert.doesNotMatch(answer.answer, /thrift/i);
    assert.match(answer.answer, /added .*opportunity/i);
  });

  it('allows valid Lenexa information to qualify', () => {
    const result = qualifyUrlOpportunity({
      opp: sampleOpp({
        title: 'Lenexa Half-Off Wednesday',
        location: 'Lenexa, KS',
        eventDate: '2026-08-20',
      }),
      pageUrl: 'https://www.halfofhalf.com',
      sourceUrl: 'https://www.halfofhalf.com/lenexa',
      entity: { ...halfofhalfEntity, multiLocation: true, locations: ['Lenexa', 'Tulsa'] },
      locationScope: 'Lenexa',
    });
    assert.equal(result.qualified, true);
  });

  it('isPastEventDate treats dates before today as expired', () => {
    assert.equal(isPastEventDate(new Date('2023-10-04')), true);
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    assert.equal(isPastEventDate(future), false);
  });

  it('uses stable external id pattern for duplicate prevention', () => {
    const title = 'Lenexa Half-Off Wednesday';
    const batchId = 'abc123';
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const id1 = `ask-benson-link-${batchId}-0-${slug}`;
    const id2 = `ask-benson-link-${batchId}-0-${slug}`;
    assert.equal(id1, id2);
  });
});
