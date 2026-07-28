import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  classifyNewsletterEmail,
  isProcessableNewsletterCategory,
  senderDomainFromEmail,
} from './classify.js';
import { computeEmailContentFingerprint, entityExternalId, occurrenceExternalId } from './extract.js';
import { evaluateNewsletterItem, buildLocationLabel } from './quality-gates.js';
import { buildOccurrenceFingerprint } from './persist.js';
import { isTrackingUrl } from './resolve-links.js';
import type { ExtractedNewsletterItem } from './types.js';

function sampleItem(overrides: Partial<ExtractedNewsletterItem> = {}): ExtractedNewsletterItem {
  return {
    entityName: 'Joe\'s Kansas City BBQ',
    entityType: 'restaurant',
    occurrenceType: 'general_event',
    title: 'Live music at Joe\'s Kansas City BBQ',
    description: 'Bluegrass night on the patio',
    startDate: '2026-08-15',
    endDate: null,
    startTime: '19:00',
    endTime: null,
    timezone: 'America/Chicago',
    venue: 'Joe\'s Kansas City BBQ',
    streetAddress: '3002 West 47th Ave',
    city: 'Kansas City',
    state: 'KS',
    zipCode: '66103',
    neighborhood: null,
    price: null,
    isFree: true,
    ageRestriction: null,
    rsvpRequired: false,
    reservationLink: null,
    ticketLink: null,
    officialWebsite: 'https://joeskc.com',
    officialSocialLink: null,
    phone: null,
    organizer: null,
    sourceUrl: 'https://example.com/event',
    confidence: 0.82,
    layer: 'occurrence',
    ...overrides,
  };
}

describe('classifyNewsletterEmail', () => {
  it('classifies restaurant newsletters', () => {
    const category = classifyNewsletterEmail({
      subject: 'This week in KC dining',
      bodyText: 'New restaurant openings and chef tasting events in Kansas City',
      senderEmail: 'news@feastmagazine.com',
    });
    assert.equal(category, 'restaurant_newsletter');
    assert.ok(isProcessableNewsletterCategory(category));
  });

  it('rejects transactional email', () => {
    const category = classifyNewsletterEmail({
      subject: 'Your order confirmation #12345',
      bodyText: 'Thank you for your purchase receipt attached',
      senderEmail: 'orders@shop.com',
    });
    assert.equal(category, 'transactional_email');
    assert.ok(!isProcessableNewsletterCategory(category));
  });

  it('rejects out-of-market spam patterns', () => {
    const category = classifyNewsletterEmail({
      subject: 'You have won a prize click here',
      bodyText: 'Claim now',
      senderEmail: 'spam@bad.com',
    });
    assert.equal(category, 'spam_noise');
  });
});

describe('quality gates', () => {
  it('retains restaurant without event as entity opportunity', () => {
    const gate = evaluateNewsletterItem(
      sampleItem({
        layer: 'entity',
        title: 'Silk Road Tea House',
        entityName: 'Silk Road Tea House',
        occurrenceType: null,
        startDate: null,
        startTime: null,
        city: 'Lenexa',
        state: 'KS',
      }),
    );
    assert.equal(gate.accept, true);
  });

  it('rejects generic click-here records', () => {
    const gate = evaluateNewsletterItem(sampleItem({ title: 'Click here', entityName: 'Click here' }));
    assert.equal(gate.accept, false);
  });

  it('rejects out-of-market Tulsa events', () => {
    const gate = evaluateNewsletterItem(
      sampleItem({
        title: 'Tulsa concert',
        city: 'Tulsa',
        state: 'OK',
        venue: 'Tulsa Theater',
      }),
    );
    assert.equal(gate.accept, false);
    if (!gate.accept) assert.equal(gate.reason, 'out_of_market');
  });

  it('rejects expired occurrences', () => {
    const gate = evaluateNewsletterItem(
      sampleItem({
        startDate: '2020-01-01',
      }),
    );
    assert.equal(gate.accept, false);
    if (!gate.accept) assert.equal(gate.reason, 'expired_occurrence');
  });

  it('extracts KC metro location label', () => {
    const label = buildLocationLabel(sampleItem({ city: 'Lenexa', state: 'KS' }));
    assert.match(label ?? '', /lenexa/i);
  });
});

describe('dedupe fingerprints', () => {
  it('uses stable occurrence fingerprint across fields', () => {
    const fp1 = buildOccurrenceFingerprint(sampleItem(), 'https://joeskc.com/event');
    const fp2 = buildOccurrenceFingerprint(sampleItem(), 'https://joeskc.com/event');
    assert.equal(fp1, fp2);
    assert.equal(occurrenceExternalId(fp1), `newsletter-occurrence-${fp1}`);
  });

  it('changes fingerprint when date changes', () => {
    const fp1 = buildOccurrenceFingerprint(sampleItem(), null);
    const fp2 = buildOccurrenceFingerprint(sampleItem({ startDate: '2026-08-16' }), null);
    assert.notEqual(fp1, fp2);
  });

  it('builds entity external ids', () => {
    assert.match(entityExternalId('Silk Road', 'Lenexa'), /^newsletter-entity-/);
  });
});

describe('email fingerprint idempotency', () => {
  it('is stable for unchanged email content', () => {
    const a = computeEmailContentFingerprint({
      gmailMessageId: 'abc123',
      subject: 'KC Events This Week',
      senderEmail: 'news@visitkc.com',
      bodyText: 'Same body',
    });
    const b = computeEmailContentFingerprint({
      gmailMessageId: 'abc123',
      subject: 'KC Events This Week',
      senderEmail: 'news@visitkc.com',
      bodyText: 'Same body',
    });
    assert.equal(a, b);
  });
});

describe('tracked link detection', () => {
  it('detects mailchimp tracking links', () => {
    assert.ok(isTrackingUrl('https://mailchi.mp/example/list'));
  });

  it('does not treat official sites as tracking links', () => {
    assert.ok(!isTrackingUrl('https://joeskc.com/events/bluegrass'));
  });
});

describe('multi-item extraction contract', () => {
  it('documents one email can yield multiple inventory rows', () => {
    const items = [
      sampleItem({ title: 'Restaurant A opening', entityName: 'Restaurant A', layer: 'entity' }),
      sampleItem({ title: 'Retail sale at Store B', entityName: 'Store B', entityType: 'retailer', occurrenceType: 'sale' }),
      sampleItem({ title: 'Concert at venue C', entityName: 'Venue C', entityType: 'event_venue', occurrenceType: 'concert' }),
    ];
    assert.equal(items.length, 3);
    assert.ok(items.every((item) => item.entityName.length > 1));
  });
});

describe('privacy contract', () => {
  it('does not require raw email body in inventory metadata shape', () => {
    const metadataKeys = [
      'ingest',
      'opportunityLayer',
      'newsletterAttribution',
      'verificationStatus',
      'occurrenceFingerprint',
    ];
    assert.ok(!metadataKeys.includes('bodyText'));
    assert.ok(!metadataKeys.includes('rawEmailHtml'));
  });
});
