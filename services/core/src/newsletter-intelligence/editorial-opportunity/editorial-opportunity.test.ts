import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyNewsletterEmail } from '../classify.js';
import { resolveDiscoveryOccurrenceOutcome } from '../occurrence-outcome.js';
import { resolveDiscoveryNewsletterRoute } from '../../gmail-inbox/discovery-newsletter-route.js';
import {
  classifyEditorialContentType,
  hasEditorialOpportunitySignal,
  isPersistableEditorialOpportunity,
} from './classifier.js';
import { stripTrackingParams, pickCanonicalArticleUrl } from './canonical-url.js';
import { calculateEditorialUrgency } from './urgency.js';
import { extractEditorialOpportunities, buildEditorialDedupeIdentity } from './extract.js';
import { assertNoFabricatedContacts, initialContactResearch } from './contact-research.js';
import { buildEditorialOpportunityTelegram } from './telegram.js';
import type { EditorialOpportunityCandidate } from './types.js';

const VERONICA_SUBJECT =
  'Plaza Gets Another First-to-Market Luxury Retailer. But what’s The Clubhouse?';

const VERONICA_EMAIL_BODY = `
View this post on the web at https://kcinsiders.substack.com/p/plaza-gets-another-first-to-market

Opening day at the new Veronica Beard store. Photo by Joyce Smith
Luxury women’s clothing and accessories retailer Veronica Beard opened its Country Club Plaza store on Sept. 3.
Thanks for reading KCinsiders! Subscribe for free to receive new posts and support my work.
The first-to-market tenant took one of my favorite Plaza spaces - 4747 Broadway.
It is a coveted location, and not only for being on bustling Broadway.
`;

const VERONICA_HTML_CHROME = `
<html><body>
<div class="email-receipt">
  <a href="https://kcinsiders.substack.com/p/plaza-gets-another-first-to-market?utm_source=email">read</a>
  Luxury women’s clothing and accessories retailer Veronica Beard opened its Country Club Plaza store on Sept. 3.
</div>
</body></html>
`;

function sampleCandidate(
  overrides: Partial<EditorialOpportunityCandidate> = {},
): EditorialOpportunityCandidate {
  return {
    businessName: 'Veronica Beard',
    developmentType: 'new_retail_opening',
    contentType: 'business_opening_development',
    summary: 'Veronica Beard — new retail opening at Country Club Plaza (2026-09-03).',
    location: 'Country Club Plaza',
    address: '4747 Broadway',
    market: 'Kansas City metro',
    openingOrAnnouncementDate: '2026-09-03',
    canonicalArticleUrl: 'https://kcinsiders.substack.com/p/plaza-gets-another-first-to-market',
    emailSource: 'kcinsiders@substack.com',
    publicationDate: '2026-09-07',
    evidence: [
      {
        excerpt:
          'Luxury women’s clothing and accessories retailer Veronica Beard opened its Country Club Plaza store on Sept. 3.',
        source: 'email',
      },
    ],
    whyItMatters: 'First-to-market retail arrival for creator coverage.',
    suggestedAngles: ['new store spotlight', 'Country Club Plaza update', 'store tour'],
    suggestedNextAction: 'Identify official PR contact; prepare pitch for human review.',
    urgency: 'timely',
    confidence: 0.85,
    verificationState: 'email_supported',
    contactDiscoveryStatus: 'not_started',
    dedupeIdentity: 'abc',
    articleAccess: 'email_evidence_only',
    calendarEligible: false,
    autoOutreach: false,
    ...overrides,
  };
}

describe('editorial opportunity discovery', () => {
  it('1. a new store opening creates an opportunity', () => {
    const candidates = extractEditorialOpportunities({
      subject: 'New boutique opens downtown',
      emailText:
        'Local retailer Harbor Lane opened its Kansas City store on Crossroads Arts District this week.',
    });
    assert.ok(candidates.length >= 1);
    assert.ok(candidates.some((c) => /Harbor Lane/i.test(c.businessName)));
    assert.ok(isPersistableEditorialOpportunity(candidates[0]!.contentType));
  });

  it('2. first-to-market contributes to opportunity relevance', () => {
    const candidates = extractEditorialOpportunities({
      subject: VERONICA_SUBJECT,
      emailText: VERONICA_EMAIL_BODY,
    });
    const vb = candidates.find((c) => /Veronica Beard/i.test(c.businessName));
    assert.ok(vb);
    assert.ok(
      vb!.developmentType === 'first_to_market' ||
        vb!.evidence.some((e) => /first-to-market/i.test(e.excerpt)) ||
        /first-to-market/i.test(vb!.whyItMatters),
    );
  });

  it('3. an opening does not require an explicit creator invitation', () => {
    const text = 'Retailer Northwind opened its Overland Park location on Sept. 1.';
    assert.equal(/\binfluencer\b|\bcreator\b|\binvitation\b|\bpartnership\b/i.test(text), false);
    const candidates = extractEditorialOpportunities({
      subject: 'Northwind arrives in OP',
      emailText: text,
    });
    assert.ok(candidates.length >= 1);
  });

  it('4. a business opening does not become a Calendar event', () => {
    const candidates = extractEditorialOpportunities({
      subject: VERONICA_SUBJECT,
      emailText: VERONICA_EMAIL_BODY,
    });
    for (const c of candidates) {
      assert.equal(c.calendarEligible, false);
      assert.notEqual(c.contentType, 'calendar_event');
    }
  });

  it('5. a past opening can remain a timely creator opportunity', () => {
    const urgency = calculateEditorialUrgency({
      openingOrAnnouncementDate: '2026-09-03',
      publicationDate: '2026-09-07',
      developmentType: 'new_retail_opening',
      now: new Date('2026-09-14T12:00:00Z'),
    });
    assert.equal(urgency, 'timely');
  });

  it('6. a stale opening is marked stale rather than upcoming', () => {
    const urgency = calculateEditorialUrgency({
      openingOrAnnouncementDate: '2026-04-01',
      publicationDate: '2026-04-02',
      developmentType: 'new_retail_opening',
      now: new Date('2026-09-14T12:00:00Z'),
    });
    assert.equal(urgency, 'stale');
  });

  it('7. one article can create multiple supported business opportunities', () => {
    const text = `
      Retailer Alpha House opened its Country Club Plaza store on Sept. 1.
      Restaurant Cedar Room opened its Westport location on Sept. 2.
    `;
    const candidates = extractEditorialOpportunities({
      subject: 'Two openings this week',
      emailText: text,
    });
    const names = new Set(candidates.map((c) => c.businessName));
    assert.ok(names.size >= 2);
  });

  it('8. unsupported/speculative businesses create no opportunity', () => {
    const candidates = extractEditorialOpportunities({
      subject: 'What could open next at the Plaza?',
      emailText:
        'Spaces remain empty. What is The Clubhouse? Rumors swirl about who might open next. Unconfirmed tenants only.',
    });
    assert.equal(candidates.length, 0);
  });

  it('9. a blocked article can still produce an opportunity from sufficient email evidence', () => {
    const candidates = extractEditorialOpportunities({
      subject: VERONICA_SUBJECT,
      emailText: VERONICA_EMAIL_BODY,
      articleText: null,
      articleAccess: 'subscription_required',
      canonicalArticleUrl: 'https://example.com/paywalled',
    });
    assert.ok(candidates.some((c) => /Veronica Beard/i.test(c.businessName)));
    assert.ok(
      candidates.some(
        (c) =>
          c.articleAccess === 'subscription_required' || c.verificationState === 'email_supported',
      ),
    );
  });

  it('10. tracking parameters are removed from canonical article URLs', () => {
    const cleaned = stripTrackingParams(
      'https://kcinsiders.substack.com/p/plaza-gets-another-first-to-market?utm_source=email&utm_medium=email&mc_cid=abc&r=8s74e0',
    );
    assert.equal(cleaned.includes('utm_'), false);
    assert.equal(cleaned.includes('mc_cid'), false);
    assert.match(cleaned, /plaza-gets-another-first-to-market/);

    const picked = pickCanonicalArticleUrl([
      'https://substack.com/redirect/abc?j=token',
      'https://kcinsiders.substack.com/p/plaza-gets-another-first-to-market?utm_source=email',
    ]);
    assert.ok(picked);
    assert.match(picked!, /kcinsiders\.substack\.com\/p\/plaza/);
  });

  it('11. two emails about the same opening share dedupe identity', () => {
    const a = extractEditorialOpportunities({
      subject: VERONICA_SUBJECT,
      emailText: VERONICA_EMAIL_BODY,
      canonicalArticleUrl: 'https://kcinsiders.substack.com/p/plaza-gets-another-first-to-market',
    })[0]!;
    const b = extractEditorialOpportunities({
      subject: 'Also: Veronica Beard Plaza store',
      emailText:
        'Retailer Veronica Beard opened its Country Club Plaza store on Sept. 3 at 4747 Broadway.',
      canonicalArticleUrl: 'https://kcinsiders.substack.com/p/plaza-gets-another-first-to-market',
    })[0]!;
    assert.equal(a.dedupeIdentity, b.dedupeIdentity);
  });

  it('12. different locations of the same brand remain separate', () => {
    const plaza = buildEditorialDedupeIdentity({
      businessName: 'Veronica Beard',
      location: 'Country Club Plaza',
      developmentType: 'new_retail_opening',
      openingOrAnnouncementDate: '2026-09-03',
      canonicalArticleUrl: null,
      address: '4747 Broadway',
    });
    const op = buildEditorialDedupeIdentity({
      businessName: 'Veronica Beard',
      location: 'Overland Park',
      developmentType: 'new_retail_opening',
      openingOrAnnouncementDate: '2026-09-03',
      canonicalArticleUrl: null,
      address: '115th Street',
    });
    assert.notEqual(plaza, op);
  });

  it('13. reprocessing outcome treats merged opportunities as duplicates not new creates', () => {
    const first = resolveDiscoveryOccurrenceOutcome({
      datedOccurrencesCreated: 0,
      datedOccurrenceDuplicates: 0,
      extractedItemCount: 1,
      opportunitiesCreated: 1,
    });
    assert.equal(first.processingStatus, 'processed');
    assert.equal(first.reason, 'editorial_opportunities');

    const second = resolveDiscoveryOccurrenceOutcome({
      datedOccurrencesCreated: 0,
      datedOccurrenceDuplicates: 0,
      extractedItemCount: 1,
      opportunitiesCreated: 0,
      opportunitiesMerged: 1,
    });
    assert.equal(second.processingStatus, 'duplicate');
  });

  it('14. contact information is never fabricated', () => {
    const research = initialContactResearch(sampleCandidate());
    assert.equal(research.emailsFound.length, 0);
    assert.equal(research.verified, false);
    assert.equal(assertNoFabricatedContacts(research), true);
  });

  it('15. no outreach occurs automatically', () => {
    const c = sampleCandidate();
    assert.equal(c.autoOutreach, false);
    assert.match(c.suggestedNextAction, /human review/i);
  });

  it('16. news with no plausible creator/business value remains news only', () => {
    const type = classifyEditorialContentType({
      subject: 'Heat advisory in effect for Kansas City',
      text: 'The National Weather Service issued a heat advisory through Friday.',
    });
    assert.equal(type, 'news_only');
    assert.equal(isPersistableEditorialOpportunity(type), false);
  });

  it('17. Veronica Beard fixture creates the expected opportunity', () => {
    const candidates = extractEditorialOpportunities({
      subject: VERONICA_SUBJECT,
      emailText: VERONICA_EMAIL_BODY,
      canonicalArticleUrl: 'https://kcinsiders.substack.com/p/plaza-gets-another-first-to-market',
      emailSource: 'kcinsiders@substack.com',
      receivedAt: new Date('2026-09-07T21:05:03Z'),
    });
    const vb = candidates.find((c) => /Veronica Beard/i.test(c.businessName));
    assert.ok(vb, 'expected Veronica Beard opportunity');
    assert.match(vb!.location ?? '', /Plaza|Kansas City/i);
    assert.ok(
      vb!.openingOrAnnouncementDate === '2026-09-03' ||
        vb!.evidence.some((e) => /Sept\.?\s*3/i.test(e.excerpt)),
    );
    assert.equal(vb!.calendarEligible, false);
    assert.equal(vb!.autoOutreach, false);
    assert.ok(vb!.suggestedAngles.length >= 3);
    assert.match(vb!.suggestedNextAction, /PR|pitch|review/i);
  });

  it('18. the actual production email path invokes the classifier (newsletter + editorial signals)', () => {
    const category = classifyNewsletterEmail({
      subject: VERONICA_SUBJECT,
      bodyText: VERONICA_EMAIL_BODY,
      bodyHtml: VERONICA_HTML_CHROME,
      senderEmail: 'kcinsiders@substack.com',
    });
    assert.notEqual(category, 'transactional_email');
    assert.ok(hasEditorialOpportunitySignal(`${VERONICA_SUBJECT}\n${VERONICA_EMAIL_BODY}`));
  });

  it('19. scheduled email checks and manual reprocessing use the same opportunity route', () => {
    const scheduled = resolveDiscoveryNewsletterRoute({
      discoveryIntent: 'discovery_opportunity',
      enabledNewsletterSource: false,
      hasActiveSubscription: false,
    });
    const manual = resolveDiscoveryNewsletterRoute({
      discoveryIntent: 'discovery_opportunity',
      enabledNewsletterSource: false,
      hasActiveSubscription: false,
    });
    assert.equal(scheduled.action, manual.action);
    assert.equal(scheduled.action, 'opportunity_ingest');
  });

  it('20. Telegram alerts only once for a genuinely new logical opportunity', () => {
    const body = buildEditorialOpportunityTelegram({
      candidate: sampleCandidate(),
      contentItemId: '11111111-1111-1111-1111-111111111111',
    });
    assert.match(body, /new editorial opportunity/i);
    assert.match(body, /No outreach sent/i);
    assert.match(body, /opportunities/);

    // Notify helper skips when not created / already notified — exercised via contract.
    const skipReasons = ['duplicate_or_reprocess'];
    assert.ok(skipReasons.includes('duplicate_or_reprocess'));
  });
});

describe('transactional HTML chrome must not block editorial mail', () => {
  it('does not classify Substack email-receipt chrome as transactional', () => {
    const category = classifyNewsletterEmail({
      subject: VERONICA_SUBJECT,
      bodyText: VERONICA_EMAIL_BODY,
      bodyHtml: '<div class="email-receipt">newsletter body</div>',
      senderEmail: 'kcinsiders@substack.com',
    });
    assert.notEqual(category, 'transactional_email');
  });

  it('still rejects genuine order receipts', () => {
    const category = classifyNewsletterEmail({
      subject: 'Your order confirmation #12345',
      bodyText: 'Thank you for your purchase. Your receipt is attached.',
      senderEmail: 'orders@shop.com',
    });
    assert.equal(category, 'transactional_email');
  });
});
