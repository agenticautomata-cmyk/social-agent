import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyDiscoveryIntent } from './email-category.js';
import { resolveDiscoveryNewsletterRoute } from './discovery-newsletter-route.js';
import { newsletterSourceMatchesSender } from '../newsletter-intelligence/sources.js';
import { prefilterNewsletterEmail } from '../newsletter-intelligence/prefilter.js';
import { evaluateNewsletterItem } from '../newsletter-intelligence/quality-gates.js';
import {
  buildOccurrenceFingerprint,
  eventBoundsFromNewsletterItem,
} from '../newsletter-intelligence/persist.js';
import { recoverDatesNearTitle } from '../newsletter-intelligence/date-normalize.js';
import type { ExtractedNewsletterItem } from '../newsletter-intelligence/types.js';

function occurrence(overrides: Partial<ExtractedNewsletterItem> = {}): ExtractedNewsletterItem {
  return {
    entityName: 'Kansas City Zoo',
    entityType: 'attraction',
    occurrenceType: 'general_event',
    title: 'Melon Summer Smash',
    description: 'Watch animals enjoy melon enrichment',
    startDate: '2026-08-15',
    endDate: null,
    startTime: '09:30',
    endTime: '17:00',
    timezone: 'America/Chicago',
    venue: 'Kansas City Zoo',
    streetAddress: '6800 Zoo Drive',
    city: 'Kansas City',
    state: 'MO',
    zipCode: '64132',
    neighborhood: null,
    price: null,
    isFree: false,
    ageRestriction: null,
    rsvpRequired: false,
    reservationLink: null,
    ticketLink: null,
    officialWebsite: 'https://www.fotzkc.org',
    officialSocialLink: null,
    phone: null,
    organizer: null,
    sourceUrl: 'https://www.fotzkc.org/melon-smash',
    confidence: 0.8,
    layer: 'occurrence',
    ...overrides,
  };
}

describe('resolveDiscoveryNewsletterRoute', () => {
  it('lets an enabled newsletter source bypass an inactive subscription', () => {
    const route = resolveDiscoveryNewsletterRoute({
      discoveryIntent: 'discovery_opportunity',
      enabledNewsletterSource: true,
      hasActiveSubscription: false,
    });
    assert.equal(route.action, 'newsletter');
    assert.equal(route.runNewsletterIntelligence, true);
  });

  it('does not grant newsletter authority to a random sender', () => {
    const other = resolveDiscoveryNewsletterRoute({
      discoveryIntent: 'discovery_other',
      enabledNewsletterSource: false,
      hasActiveSubscription: false,
    });
    assert.equal(other.action, 'skip_intent');

    const opportunity = resolveDiscoveryNewsletterRoute({
      discoveryIntent: 'discovery_opportunity',
      enabledNewsletterSource: false,
      hasActiveSubscription: false,
    });
    assert.equal(opportunity.action, 'opportunity_ingest');
    assert.equal(opportunity.runNewsletterIntelligence, false);
  });

  it('extracts useful events from an enabled-source welcome classification', () => {
    const intent = classifyDiscoveryIntent({
      subject: 'Laila turns one !!',
      bodyText:
        'Welcome to Laila Lounge. On Friday, August 14th, we invite you to celebrate one year.',
    });
    assert.equal(intent, 'discovery_subscription_welcome');

    const skipped = resolveDiscoveryNewsletterRoute({
      discoveryIntent: intent,
      enabledNewsletterSource: false,
      hasActiveSubscription: false,
    });
    assert.equal(skipped.action, 'skip_intent');

    const enabled = resolveDiscoveryNewsletterRoute({
      discoveryIntent: intent,
      enabledNewsletterSource: true,
      hasActiveSubscription: false,
    });
    assert.equal(enabled.action, 'newsletter');
    assert.equal(enabled.runNewsletterIntelligence, true);
  });

  it('lets enabled-source marketing reach newsletter quality gates instead of terminal skip', () => {
    const intent = classifyDiscoveryIntent({
      subject: 'The Liquid Speaks: Jazzman hits a 94',
      bodyText: 'This newsletter includes a limited-time promotion and 20% off merch.',
    });
    assert.equal(intent, 'discovery_marketing');

    const enabled = resolveDiscoveryNewsletterRoute({
      discoveryIntent: intent,
      enabledNewsletterSource: true,
      hasActiveSubscription: false,
    });
    assert.equal(enabled.runNewsletterIntelligence, true);

    const promo = prefilterNewsletterEmail({
      gmailMessageId: 'msg-vine-promo',
      subject: '20% off this weekend',
      bodyText: 'Sitewide sale. Free shipping on merch. Shop now.',
      bodyHtml: '',
      senderEmail: 'cheers@vinestbrewing.com',
      urls: ['https://vinestbrewing.com/shop'],
      newsletterCategory: 'retail_newsletter',
      persistReject: false,
    });
    assert.equal(promo.pass, false);
  });

  it('does not let footer confirm erase enabled-source newsletter inspection', () => {
    const intent = classifyDiscoveryIntent({
      subject: 'These Runway finds are so you',
      bodyText: 'Save 20-50% on labels. Confirm your email to manage preferences.',
    });
    assert.equal(intent, 'discovery_subscription_confirmation');

    const enabled = resolveDiscoveryNewsletterRoute({
      discoveryIntent: intent,
      enabledNewsletterSource: true,
      hasActiveSubscription: false,
    });
    assert.equal(enabled.action, 'confirmation_and_newsletter');
    assert.equal(enabled.runNewsletterIntelligence, true);
    assert.equal(enabled.runConfirmation, true);
  });

  it('keeps confirmation-only handling for non-enabled senders', () => {
    const route = resolveDiscoveryNewsletterRoute({
      discoveryIntent: 'discovery_subscription_confirmation',
      enabledNewsletterSource: false,
      hasActiveSubscription: false,
    });
    assert.equal(route.action, 'confirmation_only');
    assert.equal(route.runNewsletterIntelligence, false);
  });

  it('does not terminal-skip Weekend events wording from an enabled source', () => {
    const intent = classifyDiscoveryIntent({
      subject: 'Weekend events + where to score fresh kicks',
      bodyText: 'Twelve things to do in KC this weekend. View this email in your browser.',
    });
    assert.equal(intent, 'discovery_other');
    const route = resolveDiscoveryNewsletterRoute({
      discoveryIntent: intent,
      enabledNewsletterSource: true,
      hasActiveSubscription: false,
    });
    assert.equal(route.action, 'newsletter');
  });
});

describe('enabled newsletter source matching', () => {
  it('matches enabled domain or email and rejects suggested/paused/random senders', () => {
    const enabled = {
      status: 'enabled' as const,
      senderEmail: 'email@marketing.visitkc.com',
      senderDomain: 'visitkc.com',
    };
    assert.equal(newsletterSourceMatchesSender(enabled, 'email@marketing.visitkc.com'), true);
    assert.equal(newsletterSourceMatchesSender(enabled, 'hello@visitkc.com'), true);
    assert.equal(newsletterSourceMatchesSender({ ...enabled, status: 'suggested' }, 'hello@visitkc.com'), false);
    assert.equal(newsletterSourceMatchesSender(enabled, 'deals@marshalls.com'), false);
    assert.equal(
      newsletterSourceMatchesSender(
        { status: 'enabled', senderEmail: null, senderDomain: 'randombrand.com' },
        'hello@visitkc.com',
      ),
      false,
    );
  });
});

describe('multi-event newsletter persist shape', () => {
  it('yields multiple independently dated occurrences instead of one undated blob', () => {
    const items = [
      occurrence({ title: 'Melon Summer Smash', startDate: '2026-08-15', startTime: '09:30' }),
      occurrence({
        title: 'Brew at the Zoo',
        startDate: '2026-10-10',
        startTime: '16:00',
        sourceUrl: 'https://www.fotzkc.org/brew',
      }),
      occurrence({
        title: "A Pirate's Feast at GloWild",
        startDate: '2026-09-12',
        endDate: '2026-10-24',
        sourceUrl: 'https://www.fotzkc.org/pirates-feast',
      }),
    ];

    const accepted = items.filter((item) => evaluateNewsletterItem(item).accept);
    assert.equal(accepted.length, 3);

    const bounds = accepted.map((item) => eventBoundsFromNewsletterItem(item));
    assert.ok(bounds[0]!.eventStartsAt);
    assert.equal(bounds[0]!.eventStartsAt!.toISOString().slice(0, 10), '2026-08-15');
    assert.ok(bounds[1]!.eventStartsAt);
    assert.equal(bounds[1]!.eventStartsAt!.toISOString().slice(0, 10), '2026-10-10');
    assert.ok(bounds[2]!.eventStartsAt);
    assert.ok(bounds[2]!.eventEndsAt);

    const fingerprints = accepted.map((item) => buildOccurrenceFingerprint(item, item.sourceUrl));
    assert.equal(new Set(fingerprints).size, 3);
    assert.notEqual(accepted[0]!.title, 'Upcoming Events at Kansas City Zoo');
  });

  it('recovers event_starts_at from stored newsletter body when extract omitted dates', () => {
    const body = `
      Melon Summer Smash Coming Saturday! Saturday, August 15, 9:30 am.
      Brew at the Zoo is Saturday, October 10.
    `;
    const melon = recoverDatesNearTitle({
      title: 'Melon Summer Smash',
      bodyText: body,
      emailSentAt: '2026-08-13T15:00:00Z',
    });
    const bounds = eventBoundsFromNewsletterItem({
      startDate: melon.startDate,
      startTime: '09:30',
      endDate: melon.endDate,
      endTime: null,
    });
    assert.ok(bounds.eventStartsAt);
    assert.equal(bounds.eventStartsAt!.toISOString().slice(0, 10), '2026-08-15');
  });

  it('repeat occurrence fingerprints stay idempotent', () => {
    const first = buildOccurrenceFingerprint(occurrence(), 'https://www.fotzkc.org/melon-smash');
    const second = buildOccurrenceFingerprint(occurrence(), 'https://www.fotzkc.org/melon-smash');
    assert.equal(first, second);
  });
});

describe('sale vs routine promo gates', () => {
  it('suppresses routine percent-off promo before extract', () => {
    const result = prefilterNewsletterEmail({
      gmailMessageId: 'msg-tjmaxx-1',
      subject: 'These Runway finds are so you',
      bodyText: 'Save 20-50% on all the coveted labels. Free shipping on $89+.',
      bodyHtml: '',
      senderEmail: 'tjmaxx@eml.tjmaxx.com',
      urls: ['https://tjmaxx.tjx.com/store/shop'],
      newsletterCategory: 'retail_newsletter',
      persistReject: false,
    });
    assert.equal(result.pass, false);
    if (result.pass) return;
    assert.match(result.reason, /percent_off_offer|free_shipping_promo|product_sales|product_catalog/);
  });

  it('lets a significant dated in-person sale survive structured extraction', () => {
    const prefilter = prefilterNewsletterEmail({
      gmailMessageId: 'msg-resale-1',
      subject: 'ESTATE JEWELRY DEBUT! CORRECTED DATES!',
      bodyText:
        'THE ReSALE SHOP is featuring estate jewelry Monday 8/10, 11 am - 2 pm through Saturday 8/15, 11 am - 2 pm in Kansas City.',
      bodyHtml: '',
      senderEmail: 'resaleshop@boostkc.org',
      urls: ['https://boostkc.org/resale'],
      newsletterCategory: 'retail_newsletter',
      persistReject: false,
    });
    assert.equal(prefilter.pass, true);

    const item = occurrence({
      entityName: 'THE ReSALE SHOP',
      entityType: 'retailer',
      occurrenceType: 'sale',
      title: 'Estate Jewelry Debut',
      startDate: '2026-08-10',
      endDate: '2026-08-15',
      startTime: '11:00',
      endTime: '14:00',
      venue: 'THE ReSALE SHOP',
      city: 'Kansas City',
      sourceUrl: 'https://boostkc.org/resale',
    });
    const gate = evaluateNewsletterItem(item);
    assert.equal(gate.accept, true);
    const bounds = eventBoundsFromNewsletterItem(item);
    assert.ok(bounds.eventStartsAt);
    assert.ok(bounds.eventEndsAt);
  });
});
