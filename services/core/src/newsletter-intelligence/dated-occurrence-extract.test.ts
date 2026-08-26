import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateNewsletterItem } from './quality-gates.js';
import { eventBoundsFromNewsletterItem, buildOccurrenceFingerprint } from './persist.js';
import { extractDatedOccurrencesFromPlainText } from './dated-occurrence-extract.js';
import { resolveDiscoveryOccurrenceOutcome } from './occurrence-outcome.js';
import { shouldRunNewsletterOccurrenceExtraction } from '../gmail-inbox/discovery-newsletter-route.js';
import { resolveDiscoveryNewsletterRoute } from '../gmail-inbox/discovery-newsletter-route.js';
import { prefilterNewsletterEmail } from './prefilter.js';
import { classifyNewsletterEmail } from './classify.js';

const SENT = '2026-08-15T19:46:57.000Z';

function acceptedDated(body: string, subject: string) {
  const items = extractDatedOccurrencesFromPlainText({
    subject,
    bodyText: body,
    emailSentAt: SENT,
  });
  return items.filter((item) => evaluateNewsletterItem(item).accept && item.startDate);
}

describe('Discoveries dated occurrence extraction', () => {
  it('1. one explicit event with title, Aug 15, and venue yields 1 occurrence', () => {
    const items = acceptedDated(
      'Summer Jazz Night at The Ship, Aug 15.',
      'This week at The Ship',
    );
    assert.equal(items.length, 1);
    assert.match(items[0]!.title, /jazz night/i);
    assert.equal(items[0]!.startDate, '2026-08-15');
    assert.equal(items[0]!.venue, 'The Ship');
    assert.equal(items[0]!.startTime, null);
    const bounds = eventBoundsFromNewsletterItem(items[0]!);
    assert.ok(bounds.eventStartsAt);
    assert.equal(bounds.eventStartsAt!.toISOString(), '2026-08-15T00:00:00.000Z');
  });

  it('2. three event cards yield 3 logical occurrences', () => {
    const body = `
Melon Summer Smash
Saturday, August 15, 9:30 am at Kansas City Zoo.

Brew at the Zoo
Saturday, October 10 from 4 to 8 pm at Kansas City Zoo.

A Pirate's Feast at GloWild
September 12 through October 24 at Kansas City Zoo.
`;
    const items = acceptedDated(body, 'Melon Summer Smash Coming Saturday!');
    assert.equal(items.length, 3);
    const titles = items.map((item) => item.title);
    assert.ok(titles.some((title) => /melon/i.test(title)));
    assert.ok(titles.some((title) => /brew/i.test(title)));
    assert.ok(titles.some((title) => /pirate/i.test(title)));
    assert.equal(new Set(items.map((item) => item.startDate)).size, 3);
  });

  it('3. date-only event without a clock is preserved', () => {
    const items = acceptedDated(
      'Garden Walk at Loose Park, Aug 28. Bring comfortable shoes.',
      'Weekend in the park',
    );
    assert.equal(items.length, 1);
    assert.equal(items[0]!.startDate, '2026-08-28');
    assert.equal(items[0]!.startTime, null);
    const bounds = eventBoundsFromNewsletterItem(items[0]!);
    assert.ok(bounds.eventStartsAt);
    assert.equal(bounds.eventStartsAt!.toISOString(), '2026-08-28T00:00:00.000Z');
  });

  it('4. multi-day Sep 2–6 is one occurrence with start and end', () => {
    const items = acceptedDated(
      'Heritage Festival runs Sep 2–6 at Crown Center.',
      'Heritage Festival this September',
    );
    assert.equal(items.length, 1);
    assert.equal(items[0]!.startDate, '2026-09-02');
    assert.equal(items[0]!.endDate, '2026-09-06');
    const bounds = eventBoundsFromNewsletterItem(items[0]!);
    assert.ok(bounds.eventStartsAt);
    assert.ok(bounds.eventEndsAt);
  });

  it('5. retail sales email yields zero occurrences', () => {
    const subject = 'BEST SELLERS: Just for you';
    const body = 'Shop now. Add to cart. New arrivals from our catalog. Free shipping on merch.';
    const items = extractDatedOccurrencesFromPlainText({
      subject,
      bodyText: body,
      emailSentAt: SENT,
    });
    assert.equal(items.length, 0);
    const prefilter = prefilterNewsletterEmail({
      gmailMessageId: 'msg-best-sellers',
      subject,
      bodyText: body,
      bodyHtml: '',
      senderEmail: 'deals@example.com',
      urls: ['https://shop.example.com'],
      newsletterCategory: 'retail_newsletter',
      persistReject: false,
    });
    assert.equal(prefilter.pass, false);
    const outcome = resolveDiscoveryOccurrenceOutcome({
      skipReason: prefilter.pass ? null : prefilter.reason,
      datedOccurrencesCreated: 0,
      datedOccurrenceDuplicates: 0,
      extractedItemCount: 0,
    });
    assert.equal(outcome.processingStatus, 'skipped');
    assert.notEqual(outcome.reason, 'dated_occurrences');
  });

  it('6. security/account email yields zero occurrences', () => {
    const subject = 'Email address verification';
    const body = 'Verify your email to continue. This is an account security message.';
    const items = extractDatedOccurrencesFromPlainText({
      subject,
      bodyText: body,
      emailSentAt: SENT,
    });
    assert.equal(items.length, 0);
    const prefilter = prefilterNewsletterEmail({
      gmailMessageId: 'msg-verify-email',
      subject,
      bodyText: body,
      bodyHtml: '',
      senderEmail: 'noreply@accounts.example.com',
      urls: [],
      newsletterCategory: 'transactional_email',
      persistReject: false,
    });
    assert.equal(prefilter.pass, false);
  });

  it('7. newsletter article copy with no explicit event date is informational-only', () => {
    const body =
      'Kansas City restaurants keep evolving. Chefs talk about heritage stores, spices, and community. No calendar listing appears in this essay.';
    const items = acceptedDated(body, 'Spotlight on KC’s Oldest Retailers');
    assert.equal(items.length, 0);
    const outcome = resolveDiscoveryOccurrenceOutcome({
      datedOccurrencesCreated: 0,
      datedOccurrenceDuplicates: 0,
      extractedItemCount: 0,
    });
    assert.equal(outcome.processingStatus, 'skipped');
    assert.equal(outcome.reason, 'informational_only');
  });

  it('8. duplicate identity is duplicate_only rather than ambiguous processed+0', () => {
    const item = acceptedDated(
      'Summer Jazz Night at The Ship, Aug 15.',
      'This week at The Ship',
    )[0]!;
    const first = buildOccurrenceFingerprint(item, null);
    const second = buildOccurrenceFingerprint(item, null);
    assert.equal(first, second);
    const outcome = resolveDiscoveryOccurrenceOutcome({
      datedOccurrencesCreated: 0,
      datedOccurrenceDuplicates: 1,
      extractedItemCount: 1,
      datedCandidateCount: 1,
    });
    assert.equal(outcome.processingStatus, 'duplicate');
    assert.equal(outcome.reason, 'duplicate_only');
    assert.notEqual(outcome.processingStatus, 'processed');
  });

  it('9. Aug. 15 KC restaurant/retail list structure extracts at least one dated occurrence', () => {
    const subject = 'Your Aug. 15 List of KC Area Restaurant and Retail openings, closings';
    const body = `
Spotlight on KC’s Oldest Retailers: Planters Seed & Spice
Brad and Anna Perrin purchased the store in June.

Now Open
Black Friday Outlet, 6495 Quivira Road, Shawnee.
Z’s Kitchen, 204 Westport Road.

Opening soon
Fareway Meat Market remains open at 1307 W. 79th St., but it has been putting up a new building next door. Now it will have a ribbon cutting Aug. 24th and then open the new building to the public Aug. 25th. Hours: 8 a.m. to 8 p.m. Mondays through Saturdays.
Meddys, a Wichita-based Mediterranean restaurant chain, plans a mid-to-late September opening at 460 NW Chipman Road, Lee’s Summit.
PHỞ & BOIL is opening at 7702 Shawnee Mission Parkway, Overland Park. No ETA on the opening.

Closings
Beer Kitchen closed Sunday after 16 years at 435 Westport Road.
`;
    const items = acceptedDated(body, subject);
    assert.ok(items.length >= 1, `expected dated openings, got ${items.map((i) => i.title).join(', ') || 'none'}`);
    assert.ok(items.some((item) => /fareway/i.test(item.title)));
    assert.ok(items.some((item) => item.startDate === '2026-08-24' || item.startDate === '2026-08-25'));
    assert.equal(items.find((item) => /fareway/i.test(item.title))?.startTime ?? null, null);
    assert.equal(
      items.some((item) => /^your aug/i.test(item.title) || /list of kc area/i.test(item.title)),
      false,
    );
  });

  it('does not turn a news vote date into an occurrence', () => {
    const items = acceptedDated(
      'The Overland Park Planning Commission voted 8-0 on Aug. 10 to keep a housing project moving.',
      'New KC Housing',
    );
    assert.equal(items.length, 0);
  });

  it('10. existing zoo newsletter shape still extracts dated events', () => {
    const body = `
Melon Summer Smash Coming Saturday! Watch the animals enjoy melon enrichment on Saturday, August 15 from 9:30 am to 5 pm at Kansas City Zoo.
Brew at the Zoo returns Saturday, October 10 from 4 to 8 pm at Kansas City Zoo.
`;
    const items = acceptedDated(body, 'Melon Summer Smash Coming Saturday!');
    assert.ok(items.length >= 2);
    const bounds = items.map((item) => eventBoundsFromNewsletterItem(item));
    assert.ok(bounds.every((b) => b.eventStartsAt));
  });
});

describe('opportunity_ingest still runs occurrence extraction', () => {
  it('does not require an enabled newsletter source for discovery_opportunity', () => {
    const route = resolveDiscoveryNewsletterRoute({
      discoveryIntent: 'discovery_opportunity',
      enabledNewsletterSource: false,
      hasActiveSubscription: false,
    });
    assert.equal(route.action, 'opportunity_ingest');
    assert.equal(route.runNewsletterIntelligence, false);
    assert.equal(shouldRunNewsletterOccurrenceExtraction(route), true);
  });

  it('does not reopen skip_intent for marketing without authority', () => {
    const route = resolveDiscoveryNewsletterRoute({
      discoveryIntent: 'discovery_marketing',
      enabledNewsletterSource: false,
      hasActiveSubscription: false,
    });
    assert.equal(route.action, 'skip_intent');
    assert.equal(shouldRunNewsletterOccurrenceExtraction(route), false);
  });
});

describe('classify still treats restaurant list mail as processable', () => {
  it('labels the KCinsiders openings list as a processable newsletter', () => {
    const category = classifyNewsletterEmail({
      subject: 'Your Aug. 15 List of KC Area Restaurant and Retail openings, closings',
      bodyText: 'Opening soon. Fareway Meat Market ribbon cutting Aug. 24th in Kansas City.',
      senderEmail: 'kcinsiders@substack.com',
    });
    assert.ok(
      category === 'restaurant_newsletter' ||
        category === 'retail_newsletter' ||
        category === 'local_newsletter' ||
        category === 'venue_event_newsletter',
    );
  });
});
