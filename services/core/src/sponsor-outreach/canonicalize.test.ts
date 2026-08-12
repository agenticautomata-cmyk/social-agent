import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalGroupKey,
  groupByCanonicalKey,
  normalizeBusinessNameKey,
  normalizeDomainKey,
  pickPrimaryContact,
} from './canonicalize.js';

describe('normalizeDomainKey', () => {
  it('extracts and lowercases the hostname, stripping www', () => {
    assert.equal(
      normalizeDomainKey('https://www.21cmuseumhotels.com/bentonville/offers/crystal-bridges/?utm_source=openai'),
      '21cmuseumhotels.com',
    );
    assert.equal(normalizeDomainKey('https://21cmuseumhotels.com/offers/'), '21cmuseumhotels.com');
  });

  it('returns null for missing or unparsable website', () => {
    assert.equal(normalizeDomainKey(null), null);
    assert.equal(normalizeDomainKey(''), null);
  });

  it('collapses subdomains to the apex domain so chains group together', () => {
    assert.equal(normalizeDomainKey('https://takeoutmeals.pricechopper.com/order'), 'pricechopper.com');
    assert.equal(normalizeDomainKey('https://pricechopper.com/'), 'pricechopper.com');
    assert.equal(normalizeDomainKey('https://stores.savers.com/us/mo/kc'), 'savers.com');
  });

  it('returns null for aggregator/redirect/media domains that host many unrelated businesses', () => {
    // Regression test: production data had Adidas, Hy-Vee, Savers, and Crossroads Hotel all
    // sharing a "website" value that was actually a Google search-result link — grouping by
    // raw domain incorrectly merged these completely unrelated businesses into one contact.
    assert.equal(normalizeDomainKey('https://www.google.com/search?q=adidas+legends+outlets'), null);
    assert.equal(normalizeDomainKey('https://www.eventbrite.com/e/some-event-12345'), null);
    assert.equal(normalizeDomainKey('https://www.estatesales.net/MO/Kansas-City/64111/123456'), null);
    assert.equal(normalizeDomainKey('https://www.thepitchkc.com/some-article'), null);
    assert.equal(normalizeDomainKey('https://www.inkansascity.com/some-article'), null);
  });
});

describe('normalizeBusinessNameKey', () => {
  it('strips the Savoy-at-21c prefix so it groups with 21c Museum Hotels', () => {
    assert.equal(normalizeBusinessNameKey('The Savoy at 21c'), '21c');
  });

  it('lowercases and collapses punctuation/whitespace', () => {
    assert.equal(normalizeBusinessNameKey('  Flower Child! '), 'flower child');
  });
});

describe('canonicalGroupKey', () => {
  it('prefers domain over business name when a website is present', () => {
    const a = canonicalGroupKey({ businessName: '21c Museum Hotels', website: 'https://21cmuseumhotels.com/a' });
    const b = canonicalGroupKey({ businessName: '21c Museum Hotels', website: 'https://www.21cmuseumhotels.com/b' });
    assert.equal(a, b);
  });

  it('falls back to normalized business name when there is no website', () => {
    assert.equal(
      canonicalGroupKey({ businessName: 'Flower Child', website: null }),
      canonicalGroupKey({ businessName: 'flower child!!', website: null }),
    );
  });

  it('does not merge distinct businesses that share a Google search-result link', () => {
    const adidas = canonicalGroupKey({
      businessName: 'Adidas',
      website: 'https://www.google.com/search?q=adidas+legends+outlets',
    });
    const hyvee = canonicalGroupKey({
      businessName: 'Hy-Vee',
      website: 'https://www.google.com/search?q=hy-vee+kc',
    });
    assert.notEqual(adidas, hyvee);
  });
});

describe('groupByCanonicalKey', () => {
  it('groups the 14 real production 21c rows into a single duplicate group', () => {
    const contacts = [
      { businessName: 'The Savoy at 21c', website: 'https://www.21cmuseumhotels.com/kansas-city/restaurant#chef-tasting-menu' },
      { businessName: '21c Museum Hotels', website: 'https://21cmuseumhotels.com/bentonville/offers/crystal-bridges/?utm_source=openai' },
      { businessName: '21c Museum Hotels', website: 'https://21cmuseumhotels.com/lexington/offers/sip_and_stay/?utm_source=openai' },
    ];
    const groups = groupByCanonicalKey(contacts);
    assert.equal(groups.size, 1);
    assert.equal([...groups.values()][0]!.length, 3);
  });
});

describe('pickPrimaryContact', () => {
  it('prefers the contact furthest along the real pipeline (follow_up_needed over ready_to_contact)', () => {
    const now = new Date();
    const candidates = [
      {
        id: 'a',
        businessName: '21c Museum Hotels',
        website: 'https://21cmuseumhotels.com/x',
        status: 'ready_to_contact' as const,
        contactVerificationStatus: 'found_unverified',
        updatedAt: now,
      },
      {
        id: 'b',
        businessName: '21c Museum Hotels',
        website: 'https://21cmuseumhotels.com/y',
        status: 'follow_up_needed' as const,
        contactVerificationStatus: 'found_unverified',
        updatedAt: now,
      },
    ];
    assert.equal(pickPrimaryContact(candidates).id, 'b');
  });

  it('breaks status ties on contact verification quality, then recency', () => {
    const older = new Date('2026-01-01T00:00:00Z');
    const newer = new Date('2026-02-01T00:00:00Z');
    const candidates = [
      {
        id: 'a',
        businessName: 'X',
        website: null,
        status: 'ready_to_contact' as const,
        contactVerificationStatus: 'missing',
        updatedAt: newer,
      },
      {
        id: 'b',
        businessName: 'X',
        website: null,
        status: 'ready_to_contact' as const,
        contactVerificationStatus: 'found_unverified',
        updatedAt: older,
      },
    ];
    assert.equal(pickPrimaryContact(candidates).id, 'b');
  });
});
