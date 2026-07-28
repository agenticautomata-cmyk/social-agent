import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateNewsletterItem, calendarEligible } from './quality-gates.js';
import { classifyVerificationStatus } from './verification.js';
import { collapseProductNoise, isOrdinaryCatalogProduct } from './product-collapse.js';
import { buildNewsletterOccurrenceFingerprint, titlesLikelySameEvent, normalizeTitleTokens } from './dedupe.js';
import { isNewsWeatherAlertContent, shouldRejectAsNewsSignal } from './news-exclusions.js';
import { resolveNewsletterLocation } from './location-resolve.js';
import { createSyntheticScannedPdfFixture, extractPdfBuffer } from './pdf-parse.js';
import { evaluateAgainstLabeledSet, LABELED_EVAL_SET, sampleItemFromEval, buildLabeledFixturePredictions } from './evaluation-set.js';
import type { ExtractedNewsletterItem } from './types.js';

function sampleItem(overrides: Partial<ExtractedNewsletterItem> = {}): ExtractedNewsletterItem {
  return sampleItemFromEval({
    entityName: "Joe's Kansas City BBQ",
    entityType: 'restaurant',
    occurrenceType: 'general_event',
    title: "Live music at Joe's Kansas City BBQ",
    description: 'Bluegrass night on the patio',
    startDate: '2026-08-15',
    startTime: '19:00',
    venue: "Joe's Kansas City BBQ",
    streetAddress: '3002 West 47th Ave',
    city: 'Kansas City',
    state: 'KS',
    zipCode: '66103',
    officialWebsite: 'https://joeskc.com',
    sourceUrl: 'https://example.com/event',
    confidence: 0.82,
    layer: 'occurrence',
    ...overrides,
  });
}

describe('news/weather exclusions', () => {
  it('rejects KCUR heat-advisory false positive', () => {
    const item = sampleItem({
      title: 'Heat advisory for the Kansas City metro',
      entityName: 'KCUR',
      description: 'Excessive heat warning through Friday',
      city: 'Kansas City',
      venue: null,
      streetAddress: null,
    });
    assert.equal(isNewsWeatherAlertContent({ subject: 'Heat advisory', item }), true);
    const reject = shouldRejectAsNewsSignal({
      subject: 'Heat advisory for Kansas City',
      item,
      senderDomain: 'kcur.org',
    });
    assert.ok(reject);
    assert.equal(reject!.reason, 'news_weather_alert');

    const gate = evaluateNewsletterItem(item, {
      subject: 'Heat advisory for Kansas City',
      bodyText: 'National Weather Service issued a heat advisory',
      senderDomain: 'kcur.org',
    });
    assert.equal(gate.accept, false);
    if (!gate.accept) assert.equal(gate.reason, 'news_weather_alert');
  });

  it('rejects traffic and crime alerts', () => {
    for (const title of ['I-70 traffic alert', 'Crime report downtown']) {
      const item = sampleItem({ title, entityName: 'News Desk' });
      assert.equal(isNewsWeatherAlertContent({ item }), true);
    }
  });
});

describe('product catalog collapse', () => {
  it('collapses Five Below erasers and mini staplers', () => {
    const items = [
      sampleItem({
        title: 'Cute erasers just dropped',
        entityName: 'Five Below',
        entityType: 'retailer',
        layer: 'occurrence',
        occurrenceType: 'product_release',
        city: null,
        venue: null,
        streetAddress: null,
      }),
      sampleItem({
        title: 'Mini staplers on sale',
        entityName: 'Five Below',
        entityType: 'retailer',
        layer: 'occurrence',
        occurrenceType: 'sale',
        city: null,
        venue: null,
        streetAddress: null,
      }),
      sampleItem({
        title: 'Pajamas',
        entityName: 'Urban Planet',
        entityType: 'retailer',
        layer: 'entity',
        city: null,
      }),
    ];
    assert.ok(isOrdinaryCatalogProduct(items[0]!));
    const result = collapseProductNoise(items, 'e.fivebelow.com');
    assert.ok(result.collapsedCount >= 2);
    assert.ok(result.kept.every((i) => !/eraser|stapler|pajamas/i.test(i.title) || i.layer === 'entity'));
  });

  it('keeps meaningful grand opening with local proof', () => {
    const items = [
      sampleItem({
        title: 'Grand opening Overland Park store',
        entityName: 'Five Below',
        entityType: 'retailer',
        occurrenceType: 'grand_opening',
        city: 'Overland Park',
        state: 'KS',
        layer: 'occurrence',
      }),
    ];
    const result = collapseProductNoise(items, 'e.fivebelow.com');
    assert.equal(result.collapsedCount, 0);
    assert.equal(result.kept.length, 1);
  });
});

describe('verification labels', () => {
  it('labels Do816 as trusted secondary, not official', () => {
    const status = classifyVerificationStatus({
      senderDomain: 'do816.com',
      senderEmail: 'hello@do816.com',
      officialUrl: 'https://do816.com/events/digable',
      item: sampleItem({ entityName: 'Digable Planets', entityType: 'event_venue' }),
    });
    assert.equal(status, 'trusted_secondary_source');
  });

  it('labels matching sender domain as official_business for retailers', () => {
    const status = classifyVerificationStatus({
      senderDomain: 'joeskc.com',
      senderEmail: 'hi@joeskc.com',
      officialUrl: 'https://joeskc.com/events',
      item: sampleItem({ entityType: 'restaurant' }),
    });
    assert.equal(status, 'official_business');
  });
});

describe('deduplication', () => {
  it('merges Digable Planets Blowout Comb title variants', () => {
    const a = sampleItem({
      entityName: 'Digable Planets',
      title: 'Digable Planets — 30 Years of Blow Out Comb',
      startDate: '2026-09-26',
      venue: 'CrossroadsKC',
      city: 'Kansas City',
    });
    const b = sampleItem({
      entityName: 'Digable Planets',
      title: 'Digable Planets — Blowout Comb',
      startDate: '2026-09-26',
      venue: 'CrossroadsKC',
      city: 'Kansas City',
    });
    assert.ok(titlesLikelySameEvent(a.title, b.title));
    assert.equal(
      buildNewsletterOccurrenceFingerprint(a, 'https://do816.com/a'),
      buildNewsletterOccurrenceFingerprint(b, 'https://do816.com/b'),
    );
    assert.match(normalizeTitleTokens(a.title), /blowout/);
  });
});

describe('location resolution outcomes', () => {
  it('marks national chain without local proof', () => {
    const result = resolveNewsletterLocation(
      sampleItem({
        entityName: 'Five Below',
        title: 'New erasers',
        city: null,
        venue: null,
        streetAddress: null,
      }),
    );
    assert.equal(result.outcome, 'national_no_local_proof');
  });

  it('rejects Urban Planet catalog SKUs without local proof at the gate', () => {
    const item = sampleItem({
      entityName: 'Urban Planet',
      title: 'Pajamas and graphic tees',
      occurrenceType: 'product_release',
      city: null,
      venue: null,
      streetAddress: null,
      layer: 'entity',
    });
    const gate = evaluateNewsletterItem(item, { senderDomain: 'urban-planet.com' });
    assert.equal(gate.accept, false);
    if (!gate.accept) {
      assert.equal(gate.reason, 'national_retail_no_local_proof');
      assert.equal(gate.locationOutcome, 'national_no_local_proof');
    }
  });

  it('accepts Life of the Party from Vine Street Brewing as exact KC metro', () => {
    const item = sampleItem({
      entityName: 'Life of the Party',
      title: 'Life of the Party',
      venue: 'Vine Street Brewing',
      city: null,
      streetAddress: null,
      state: null,
      neighborhood: null,
      zipCode: null,
    });
    const location = resolveNewsletterLocation(item, { senderDomain: 'vinestbrewing.com' });
    assert.equal(location.outcome, 'exact_kc_metro');
    assert.match(location.city ?? '', /kansas city/i);
    const gate = evaluateNewsletterItem(item, {
      senderDomain: 'vinestbrewing.com',
      locationResolution: location,
    });
    assert.equal(gate.accept, true);
    if (gate.accept) {
      assert.equal(gate.locationOutcome, 'exact_kc_metro');
      assert.notEqual(gate.locationOutcome, 'out_of_market');
    }
  });

  it('does not treat venue-only unknown names as out_of_market', () => {
    const result = resolveNewsletterLocation(
      sampleItem({
        entityName: 'Mystery Local Band',
        title: 'Saturday night set',
        venue: 'Some Unknown Room',
        city: null,
        streetAddress: null,
        state: null,
      }),
      { senderDomain: 'mysteryvenue.example' },
    );
    assert.equal(result.outcome, 'location_unknown');
  });

  it('marks exact KC metro when city present', () => {
    const result = resolveNewsletterLocation(sampleItem());
    assert.equal(result.outcome, 'exact_kc_metro');
  });
});

describe('calendar eligibility', () => {
  it('blocks physical events without location', () => {
    const item = sampleItem({
      entityName: 'Unknown Act',
      title: 'Mystery Show Tonight',
      description: null,
      city: null,
      venue: null,
      streetAddress: null,
      neighborhood: null,
      zipCode: null,
      state: null,
    });
    const gate = evaluateNewsletterItem(item, { senderDomain: 'mysterytour.com' });
    assert.equal(gate.accept, true);
    if (gate.accept) {
      assert.equal(calendarEligible(item, gate, 'trusted_secondary_source'), false);
    }
  });

  it('allows virtual events without physical location', () => {
    const item = sampleItem({
      title: 'Virtual online workshop livestream',
      city: null,
      venue: 'Virtual',
      streetAddress: null,
    });
    const gate = evaluateNewsletterItem(item, { senderDomain: 'boostkc.org' });
    assert.equal(gate.accept, true);
    if (gate.accept) {
      assert.equal(calendarEligible(item, gate, 'trusted_secondary_source'), true);
    }
  });
});

describe('scanned PDF OCR pipeline', () => {
  it('renders synthetic scanned PDF and requires OCR page provenance', async () => {
    const fixture = await createSyntheticScannedPdfFixture();
    const result = await extractPdfBuffer({
      buffer: fixture.buffer,
      filename: fixture.filename,
      forceScannedOcr: true,
      ocrPage: async (pageNumber, imageBuffer) => {
        assert.ok(pageNumber >= 1);
        assert.ok(imageBuffer.length > 100, 'rendered page image should not be empty');
        return {
          text: 'KC Live Music Night — Aug 15 2026 — Crossroads — $20 — doors 7pm',
          confidence: 0.88,
        };
      },
    });
    assert.equal(result.error === 'pdf_too_large', false);
    assert.ok(result.scannedPagesOcr > 0, `expected scanned OCR pages, got ${result.scannedPagesOcr}`);
    assert.ok(result.pages.some((p) => /KC Live Music/i.test(p.text)));
    assert.ok(result.pages.every((p) => p.provenance === 'ocr_page_image'));
    assert.equal(
      result.pages.some((p) => p.provenance === 'embedded_text'),
      false,
      'forceScannedOcr must not fall back to embedded_text',
    );
  });
});

describe('labeled evaluation metrics', () => {
  it('returns metrics in [0,1] and includes KCUR labeled email', () => {
    assert.ok(LABELED_EVAL_SET.length >= 25);
    const senders = new Set(LABELED_EVAL_SET.map((e) => e.senderDomain));
    assert.ok(senders.size >= 5);
    assert.ok(LABELED_EVAL_SET.some((e) => e.id === 'kcur-heat-advisory'));

    const metrics = evaluateAgainstLabeledSet([
      {
        senderDomain: 'kcur.org',
        gmailMessageId: '19f98ef8909a5e7b',
        subject: 'Heat advisory for Kansas City',
        layer: 'occurrence',
        entityName: 'KCUR',
        title: 'Heat advisory',
        date: null,
        time: null,
        location: null,
        destination: 'quarantine',
        rejected: true,
        rejectReason: 'news_weather_alert',
      },
      {
        senderDomain: 'do816.com',
        subject: 'Digable Planets at CrossroadsKC',
        layer: 'occurrence',
        entityName: 'Digable Planets',
        title: 'Digable Planets — Blowout Comb',
        date: '2026-09-26',
        time: null,
        location: 'CrossroadsKC, Kansas City, MO',
        destination: 'calendar_suggestion',
      },
    ]);

    assert.ok(metrics.denominators.emailsScored >= 1);
    assert.ok(metrics.denominators.emailsExcludedNoMatch >= 1);
    // Sparse corpus predictions must not invent vacuous 1.0 from 0/0.
    // Full GT inventory may still meet min denominators; then report real ratios or null.
    if (metrics.denominators.dateTotal === 0) {
      assert.equal(metrics.dateAccuracy, null);
    } else if (metrics.dateAccuracy != null) {
      assert.ok(metrics.dateAccuracy >= 0 && metrics.dateAccuracy <= 1);
    }
    if (metrics.denominators.timeTotal === 0) {
      assert.equal(metrics.timeAccuracy, null);
    }
    if (metrics.denominators.locationTotal === 0) {
      assert.equal(metrics.locationAccuracy, null);
    } else if (metrics.locationAccuracy != null) {
      assert.ok(metrics.locationAccuracy >= 0 && metrics.locationAccuracy <= 1);
    }

    for (const key of [
      'entityPrecision',
      'entityRecall',
      'occurrencePrecision',
      'occurrenceRecall',
      'dateAccuracy',
      'timeAccuracy',
      'locationAccuracy',
      'duplicateRate',
      'falseCalendarRate',
    ] as const) {
      const v = metrics[key];
      if (v == null) continue;
      assert.ok(v >= 0 && v <= 1, `${key}=${v}`);
    }

    const fixtures = evaluateAgainstLabeledSet(buildLabeledFixturePredictions());
    assert.equal(fixtures.denominators.emailsScored, LABELED_EVAL_SET.length);
    assert.equal(fixtures.denominators.emailsExcludedNoMatch, 0);
    assert.ok(fixtures.groundTruthInventory.datedOccurrences >= 10);
    assert.ok(fixtures.groundTruthInventory.timedOccurrences >= 5);
    assert.ok(fixtures.groundTruthInventory.locatedOccurrences >= 10);
    assert.ok(fixtures.dateAccuracy != null);
    assert.ok(fixtures.timeAccuracy != null);
    assert.ok(fixtures.locationAccuracy != null);
  });
});
