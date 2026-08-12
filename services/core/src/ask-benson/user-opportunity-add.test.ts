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
