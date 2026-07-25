import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractOpportunityFacts,
  validateOpportunityFacts,
} from './validate-facts.js';
import { buildFallbackGreenScreenPackage } from './fallback-package.js';

describe('buildFallbackGreenScreenPackage', () => {
  it('generates announcement language for a complete opportunity', () => {
    const facts = extractOpportunityFacts({
      topic: 'Brookside coffee shop grand opening announced',
      hook: 'Press release confirms August opening date.',
      script: null,
      eventStartsAt: new Date('2026-08-01'),
      eventEndsAt: null,
      locationName: 'Brookside, Kansas City',
      sourceUrl: 'https://example.com/press',
      metadata: { price: '$5 off opening week' },
      firsthandVisited: false,
    });
    const validation = validateOpportunityFacts(facts, new Date('2026-06-01'));
    const pkg = buildFallbackGreenScreenPackage(facts, validation, 'green_screen');

    assert.match(pkg.openingHook, /Here's what was announced/i);
    assert.match(pkg.spokenScript, /According to the announcement/i);
    assert.match(pkg.spokenScript, /have not verified this in person/i);
    assert.equal(pkg.sourceAttribution, 'https://example.com/press');
    assert.equal(pkg.verificationStatus, 'partial');
  });

  it('includes visit-later notes for green_screen_then_visit', () => {
    const facts = extractOpportunityFacts({
      topic: 'New boutique opening soon in Crossroads',
      hook: 'Opens next month according to the business.',
      script: null,
      eventStartsAt: new Date('2026-09-01'),
      eventEndsAt: null,
      locationName: 'Crossroads KC',
      sourceUrl: 'https://example.com/opening',
      metadata: {},
      firsthandVisited: false,
    });
    const validation = validateOpportunityFacts(facts, new Date('2026-06-01'));
    const pkg = buildFallbackGreenScreenPackage(facts, validation, 'green_screen_then_visit');

    assert.match(pkg.spokenScript, /haven't visited yet/i);
    assert.match(pkg.spokenScript, /follow up after it opens/i);
    assert.ok(pkg.visitLaterNotes?.includes('in-person visit'));
  });

  it('flags missing and unverified facts without inventing details', () => {
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
    const pkg = buildFallbackGreenScreenPackage(facts, validation, 'green_screen');

    assert.ok(pkg.verificationFlags.some((f) => f.includes('Missing: event date')));
    assert.ok(pkg.verificationFlags.some((f) => f.includes('Missing: location')));
    assert.equal(pkg.location, null);
    assert.equal(pkg.priceOrOffer, null);
  });
});
