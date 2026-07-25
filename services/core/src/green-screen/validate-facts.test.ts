import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractOpportunityFacts, validateOpportunityFacts } from './validate-facts.js';

describe('validateOpportunityFacts', () => {
  it('flags missing facts for incomplete opportunities', () => {
    const facts = extractOpportunityFacts({
      topic: 'Mystery opening',
      hook: null,
      script: null,
      eventStartsAt: null,
      eventEndsAt: null,
      locationName: null,
      sourceUrl: null,
      metadata: {},
      firsthandVisited: false,
    });
    const validation = validateOpportunityFacts(facts);
    assert.ok(validation.missingFields.includes('event date'));
    assert.ok(validation.missingFields.includes('location'));
    assert.ok(validation.missingFields.includes('source URL'));
    assert.equal(validation.verificationStatus, 'unverified');
  });

  it('detects expired announcements', () => {
    const facts = extractOpportunityFacts({
      topic: 'Past event',
      hook: 'summary',
      script: null,
      eventStartsAt: new Date('2020-01-01'),
      eventEndsAt: null,
      locationName: 'Kansas City',
      sourceUrl: 'https://example.com',
      metadata: { price: '$5' },
      firsthandVisited: false,
    });
    const validation = validateOpportunityFacts(facts, new Date('2026-07-19'));
    assert.equal(validation.isExpired, true);
    assert.equal(validation.verificationStatus, 'expired');
  });
});
