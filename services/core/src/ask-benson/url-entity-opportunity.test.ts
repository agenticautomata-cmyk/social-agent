import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEntityExternalId,
  buildEntityOpportunityRow,
  inferBusinessName,
  inferEntityLocation,
  inferOpportunityType,
  qualifyEntityFromUrl,
  resolveIntakeOutcome,
} from './url-entity-opportunity.js';
import { resolveEntityFromUrl } from './qualify-url-opportunity.js';
import { buildEvidenceFirstUrlAnswer } from './url-intake-answer.js';

describe('url-entity-opportunity', () => {
  it('creates stable entity external ids for dedup', () => {
    const a = buildEntityExternalId('halfofhalf.com', 'Lenexa');
    const b = buildEntityExternalId('halfofhalf.com', 'Lenexa');
    assert.equal(a, b);
    assert.match(a, /^ask-benson-entity-/);
  });

  it('infers Half of Half from domain and page text', () => {
    assert.equal(
      inferBusinessName({
        pageTitle: 'Home',
        pageText: 'Welcome to ½ of ½ Name Brand Clothing in Lenexa',
        domain: 'halfofhalf.com',
      }),
      'Half of Half',
    );
  });

  it('accepts user-submitted entity with Lenexa scope', () => {
    const entity = resolveEntityFromUrl('https://www.halfofhalf.com', 'Home');
    const result = qualifyEntityFromUrl({
      pageUrl: 'https://www.halfofhalf.com',
      pageText: 'Lenexa store hours and weekly markdowns',
      entity,
      locationScope: 'Lenexa',
      needsLocationConfirmation: false,
      businessName: 'Half of Half',
    });
    assert.equal(result.accepted, true);
  });

  it('requires branch selection for multi-location without scope', () => {
    const entity = resolveEntityFromUrl('https://www.halfofhalf.com', 'Home');
    const result = qualifyEntityFromUrl({
      pageUrl: 'https://www.halfofhalf.com',
      pageText: 'Lenexa and Tulsa stores',
      entity: { ...entity, multiLocation: true, locations: ['Lenexa', 'Tulsa'] },
      needsLocationConfirmation: true,
      businessName: 'Half of Half',
    });
    assert.equal(result.accepted, false);
    assert.equal(result.pendingLocation, true);
  });

  it('builds entity row without event date', () => {
    const entity = resolveEntityFromUrl('https://www.halfofhalf.com', 'Home');
    const row = buildEntityOpportunityRow({
      campaignId: 'camp',
      sourceId: 'src',
      pageUrl: 'https://www.halfofhalf.com',
      businessName: 'Half of Half',
      locationName: 'Lenexa, Kansas',
      locationScope: 'Lenexa',
      opportunityType: 'shopping_bargain_discovery',
      entity,
      outcome: 'ENTITY_ACCEPTED_CLAIMS_QUARANTINED',
      externalId: 'ask-benson-entity-halfofhalf-com-lenexa',
    });
    assert.equal(row.eventStartsAt, null);
    assert.equal(row.creatorValueStatus, 'creator_candidate');
    assert.equal((row.metadata as Record<string, unknown>).opportunityLayer, 'entity');
    assert.equal((row.metadata as Record<string, unknown>).reviewStatus, 'unreviewed');
    assert.equal(
      ((row.metadata as Record<string, unknown>).userSubmission as Record<string, unknown>).submittedByUser,
      true,
    );
  });

  it('resolves intake outcomes separately from claims', () => {
    assert.equal(
      resolveIntakeOutcome({
        entityAccepted: true,
        pendingLocation: false,
        qualifiedClaimCount: 0,
        quarantinedClaimCount: 2,
        extractedClaimCount: 2,
      }),
      'ENTITY_ACCEPTED_CLAIMS_QUARANTINED',
    );
    assert.equal(
      resolveIntakeOutcome({
        entityAccepted: true,
        pendingLocation: false,
        qualifiedClaimCount: 0,
        quarantinedClaimCount: 0,
        extractedClaimCount: 0,
      }),
      'ENTITY_ACCEPTED_NO_CURRENT_CLAIMS',
    );
  });

  it('answer promotes entity opportunity without Tulsa or October event', () => {
    const entity = resolveEntityFromUrl('https://www.halfofhalf.com', 'Half of Half');
    const answer = buildEvidenceFirstUrlAnswer({
      pageUrl: 'https://www.halfofhalf.com',
      summary: {
        entity,
        locationScope: 'Lenexa',
        watchRuleSaved: true,
        qualifiedCount: 0,
        quarantinedCount: 2,
        quarantineReasons: [],
        needsLocationConfirmation: false,
        identifiedLocations: ['Lenexa'],
        savedTitles: ['Half of Half — Lenexa'],
        qualificationOutcome: 'ENTITY_ACCEPTED_CLAIMS_QUARANTINED',
        entityOpportunityId: '11111111-1111-1111-1111-111111111111',
        entityOpportunityTitle: 'Half of Half — Lenexa',
        entityOpportunityType: 'shopping_bargain_discovery',
        entityCreated: true,
      },
    });
    assert.match(answer.answer, /added .*Half of Half/i);
    assert.match(answer.answer, /shopping/i);
    assert.match(answer.answer, /Calendar/i);
    assert.doesNotMatch(answer.answer, /Tulsa/i);
    assert.doesNotMatch(answer.answer, /2023/i);
    assert.doesNotMatch(answer.answer, /frosty frogs/i);
    assert.ok(answer.suggestedActions.some((a) => a.includes('/review/inventory?id=')));
  });

  it('infers Lenexa location from scope', () => {
    assert.equal(
      inferEntityLocation({ locationScope: 'Lenexa', identifiedLocations: ['Lenexa', 'Tulsa'] }),
      'Lenexa, Kansas',
    );
  });

  it('infers shopping opportunity type for bargain businesses', () => {
    assert.equal(
      inferOpportunityType('Half off name brand clothing every week', 'Half of Half'),
      'shopping_bargain_discovery',
    );
  });
});
