import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildUserOpportunityExternalId,
  extractEventbriteEventId,
  normalizeCanonicalEventUrl,
  normalizeOpportunityTitle,
} from './url-intake-dedupe.js';
import { isExplicitUserAddOpportunityRequest } from './intake-intents.js';
import { buildEvidenceFirstUrlAnswer } from './url-intake-answer.js';
import { qualifyUrlOpportunity, resolveEntityFromUrl } from './qualify-url-opportunity.js';
import type { ExtractedOpportunity } from './listing-extract.js';

describe('explicit user opportunity add', () => {
  it('detects explicit save/add commands', () => {
    assert.equal(isExplicitUserAddOpportunityRequest('Add this to Opportunities please'), true);
    assert.equal(isExplicitUserAddOpportunityRequest('save this event to opportunities'), true);
    assert.equal(isExplicitUserAddOpportunityRequest('track this event'), true);
    assert.equal(isExplicitUserAddOpportunityRequest('look up this event'), false);
  });

  it('extracts stable Eventbrite ids and canonical urls', () => {
    const url =
      'https://www.eventbrite.com/e/rock-the-bridge-old-school-funk-night-tickets-123456789?utm_campaign=social';
    assert.equal(extractEventbriteEventId(url), '123456789');
    assert.equal(
      normalizeCanonicalEventUrl(url),
      'https://eventbrite.com/e/rock-the-bridge-old-school-funk-night-tickets-123456789',
    );
    assert.equal(
      buildUserOpportunityExternalId({ eventbriteEventId: '123456789' }),
      'ask-benson-user-event-eb-123456789',
    );
  });

  it('hashes the full https identity key so unrelated URLs do not collide', () => {
    const neighborhoods = buildUserOpportunityExternalId({
      canonicalUrl:
        'https://www.inkansascity.com/home-design/neighborhoods/where-to-eat-shop-play-and-spend-a-day-in-20-kc-metro-neighborhoods/',
      title: 'Where to Eat, Shop, Play, and Spend a Day in 20 KC Metro Neighborhoods',
    });
    const parkville = buildUserOpportunityExternalId({
      canonicalUrl:
        'https://www.inkansascity.com/innovators-influencers/local-news/spend-a-day-in-parkville-where-to-eat-shop-and-explore/',
      title: 'Spend a Day in Parkville: Where to Eat, Shop, and Explore',
    });
    const reunion = buildUserOpportunityExternalId({
      canonicalUrl: 'https://theosc.co/events',
      title: 'The Reunion Hosted By DJ DOT WAV',
      eventDateIso: '2026-08-29T15:00:00.000Z',
      venue: 'Outsiders Social Club',
    });

    assert.match(neighborhoods, /^ask-benson-user-event-[0-9a-f]{32}$/);
    assert.match(parkville, /^ask-benson-user-event-[0-9a-f]{32}$/);
    assert.notEqual(neighborhoods, parkville);
    assert.notEqual(neighborhoods, reunion);
    assert.notEqual(parkville, reunion);
    assert.notEqual(neighborhoods, 'ask-benson-user-event-68747470733a2f2f');
    assert.notEqual(parkville, 'ask-benson-user-event-68747470733a2f2f');
    assert.notEqual(reunion, 'ask-benson-user-event-68747470733a2f2f');
  });

  it('is deterministic for the same url/title/date/venue', () => {
    const input = {
      canonicalUrl: 'https://www.example.com/events/spring-market',
      title: 'Spring Market',
      eventDateIso: '2026-09-12T17:00:00.000Z',
      venue: 'Clock Tower Plaza',
    };
    assert.equal(buildUserOpportunityExternalId(input), buildUserOpportunityExternalId(input));
    assert.equal(
      buildUserOpportunityExternalId(input),
      buildUserOpportunityExternalId({
        ...input,
        canonicalUrl: 'https://example.com/events/spring-market/',
      }),
    );
  });

  it('changes when title, date, or venue changes on the same url', () => {
    const url = 'https://www.downtownop.org/events';
    const base = buildUserOpportunityExternalId({
      canonicalUrl: url,
      title: 'Movie Night',
      eventDateIso: '2026-09-12T18:00:00.000Z',
      venue: 'Clock Tower Plaza',
    });
    assert.notEqual(
      base,
      buildUserOpportunityExternalId({
        canonicalUrl: url,
        title: 'Third Fridays',
        eventDateIso: '2026-09-12T18:00:00.000Z',
        venue: 'Clock Tower Plaza',
      }),
    );
    assert.notEqual(
      base,
      buildUserOpportunityExternalId({
        canonicalUrl: url,
        title: 'Movie Night',
        eventDateIso: '2026-10-09T18:00:00.000Z',
        venue: 'Clock Tower Plaza',
      }),
    );
    assert.notEqual(
      base,
      buildUserOpportunityExternalId({
        canonicalUrl: url,
        title: 'Movie Night',
        eventDateIso: '2026-09-12T18:00:00.000Z',
        venue: 'Downtown Overland Park',
      }),
    );
  });

  it('does not raw-encode the URL in the external id', () => {
    const url =
      'https://www.inkansascity.com/home-design/neighborhoods/where-to-eat-shop-play-and-spend-a-day-in-20-kc-metro-neighborhoods/';
    const id = buildUserOpportunityExternalId({
      canonicalUrl: url,
      title: 'Where to Eat, Shop, Play, and Spend a Day in 20 KC Metro Neighborhoods',
    });
    assert.doesNotMatch(id, /https?/i);
    assert.doesNotMatch(id, /inkansascity/i);
    assert.doesNotMatch(id, /neighborhoods/i);
    assert.doesNotMatch(id, /68747470733a2f2f/);
    assert.notEqual(id, `ask-benson-user-event-${Buffer.from(url).toString('hex').slice(0, 32)}`);
  });

  it('normalizes near-duplicate titles', () => {
    assert.equal(
      normalizeOpportunityTitle('Conversations, Karaoke, & Cocktails'),
      normalizeOpportunityTitle('Conversations Karaoke & Cocktails'),
    );
  });

  it('still rejects automated qualification for weak extractions', () => {
    const entity = resolveEntityFromUrl(
      'https://www.eventbrite.com/e/sample-tickets-123',
      'Sample Event',
    );
    const opp: ExtractedOpportunity = {
      title: 'New Event Starts',
      location: 'Tulsa, OK',
      venue: null,
      eventDate: '2023-10-04',
      eventEndDate: null,
      businessName: 'Sample',
      category: 'local_event',
      summary: null,
      sourceUrl: 'https://www.eventbrite.com/e/sample-tickets-123',
      tags: [],
      confidence: 0.2,
    };
    const result = qualifyUrlOpportunity({
      opp,
      pageUrl: 'https://www.eventbrite.com/e/sample-tickets-123',
      sourceUrl: opp.sourceUrl!,
      entity,
    });
    assert.equal(result.qualified, false);
  });

  it('answers with saved confirmation for user-confirmed intake', () => {
    const answer = buildEvidenceFirstUrlAnswer({
      pageUrl: 'https://www.eventbrite.com/e/rock-the-bridge-tickets-123',
      summary: {
        entity: resolveEntityFromUrl('https://www.eventbrite.com/e/rock-the-bridge-tickets-123', 'ROCK THE BRIDGE'),
        locationScope: 'Kansas City',
        watchRuleSaved: false,
        qualifiedCount: 1,
        quarantinedCount: 1,
        quarantineReasons: ['missing_entity_match'],
        needsLocationConfirmation: false,
        identifiedLocations: [],
        savedTitles: ['ROCK THE BRIDGE - Old School Funk Night'],
        userConfirmedSave: true,
        enrichmentFailures: 1,
        primaryOpportunityId: '11111111-1111-1111-1111-111111111111',
      },
    });
    assert.match(answer.answer, /Added .*ROCK THE BRIDGE/i);
    assert.match(answer.answer, /Opportunities/i);
    assert.doesNotMatch(answer.answer, /did \*\*not\*\* save/i);
    assert.match(answer.answer, /enrichment fields yet/i);
  });
});
