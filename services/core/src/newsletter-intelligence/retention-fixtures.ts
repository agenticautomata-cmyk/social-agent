import { processTokenEfficientNewsletterEmail } from './pipeline-token-efficient.js';

export type RetentionFixtureLabel =
  | 'obvious_retail_junk'
  | 'discount_event_roundup'
  | 'complete_single_event'
  | 'image_only_flyer'
  | 'pdf_flyer'
  | 'true_freebie'
  | 'tiktok_worthy_event'
  | 'vague_promotion'
  | 'transactional_email';

export type RetentionFixture = {
  id: string;
  label: RetentionFixtureLabel;
  expectReject: boolean;
  expectCompleteEvent: boolean;
  expectFreebie: boolean;
  expectTikTok: boolean;
  gmailMessageId: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  senderEmail: string | null;
  senderName: string | null;
  urls: string[];
};

export const RETENTION_FIXTURES: RetentionFixture[] = [
  {
    id: 'urban-planet-flash-sale',
    label: 'obvious_retail_junk',
    expectReject: true,
    expectCompleteEvent: false,
    expectFreebie: false,
    expectTikTok: false,
    gmailMessageId: 'fixture-urban-planet-flash',
    subject: '⚡ 3 FOR 1 FLASH SALE',
    bodyText:
      'Shop now. 40% off everything sitewide. Free shipping on orders over $50. New arrivals inside.',
    bodyHtml: '',
    senderEmail: 'deals@urban-planet.com',
    senderName: 'Urban Planet',
    urls: ['https://www.urban-planet.com/sale'],
  },
  {
    id: 'do816-discount-roundup',
    label: 'discount_event_roundup',
    expectReject: false,
    expectCompleteEvent: true,
    expectFreebie: false,
    expectTikTok: false,
    gmailMessageId: 'fixture-do816-roundup',
    subject: 'Cheap thrills, fresh shows & free beer?',
    bodyText:
      'Friday October 20, 2026 8:00 PM — Live music at RecordBar, 1520 Grand Blvd, Kansas City MO. Saturday October 21, 2026 noon — Soul Market at 18th and Vine.',
    bodyHtml: '',
    senderEmail: 'newsletter@do816.com',
    senderName: 'do816',
    urls: ['https://do816.com/events'],
  },
  {
    id: 'complete-jazz-concert',
    label: 'complete_single_event',
    expectReject: false,
    expectCompleteEvent: true,
    expectFreebie: false,
    expectTikTok: false,
    gmailMessageId: 'fixture-complete-jazz-v2',
    subject: 'Jazz at the Blue Room — August 15, 2026',
    bodyText:
      'The Blue Room presents Kansas City jazz legends on Friday 2026-08-15 at 8:00 PM. 1600 E 18th St, Kansas City MO. Tickets $20.',
    bodyHtml: '',
    senderEmail: 'events@americanjazzmuseum.org',
    senderName: 'Blue Room',
    urls: [],
  },
  {
    id: 'image-flyer-html',
    label: 'image_only_flyer',
    expectReject: false,
    expectCompleteEvent: true,
    expectFreebie: false,
    expectTikTok: false,
    gmailMessageId: 'fixture-image-flyer',
    subject: 'Community block party flyer',
    bodyText: 'Block party August 20, 2026 at 6:00 PM — 12th and Oak, Kansas City MO. See flyer image.',
    bodyHtml:
      '<html><body><img src="https://example.com/flyer-block-party.jpg" alt="" /></body></html>',
    senderEmail: 'events@visitkc.com',
    senderName: 'Visit KC',
    urls: ['https://example.com/flyer-block-party.jpg'],
  },
  {
    id: 'pdf-flyer-link',
    label: 'pdf_flyer',
    expectReject: false,
    expectCompleteEvent: true,
    expectFreebie: false,
    expectTikTok: false,
    gmailMessageId: 'fixture-pdf-flyer-v2',
    subject: 'Summer festival PDF',
    bodyText:
      'KC Fringe Festival main day 2026-07-18 at 6pm in Kansas City. Summer festival July 18-20, 2026. Download the festival schedule PDF for venues and showtimes.',
    bodyHtml: '',
    senderEmail: 'info@kcfringe.org',
    senderName: 'KC Fringe',
    urls: ['https://kcfringe.org/schedule.pdf'],
  },
  {
    id: 'true-free-admission',
    label: 'true_freebie',
    expectReject: false,
    expectCompleteEvent: true,
    expectFreebie: true,
    expectTikTok: false,
    gmailMessageId: 'fixture-free-admission',
    subject: 'Free admission community day',
    bodyText:
      'Free admission community day on 2026-10-14 from 10am-4pm at the Nelson-Atkins Museum, 4525 Oak St, Kansas City MO.',
    bodyHtml: '',
    senderEmail: 'news@nelson-atkins.org',
    senderName: 'Nelson-Atkins',
    urls: [],
  },
  {
    id: 'tiktok-pop-up',
    label: 'tiktok_worthy_event',
    expectReject: false,
    expectCompleteEvent: true,
    expectFreebie: false,
    expectTikTok: true,
    gmailMessageId: 'fixture-tiktok-pop-up',
    subject: 'Secret rooftop pop-up tonight in Crossroads',
    bodyText:
      'Invite-only rooftop pop-up tonight October 6, 2026 9:00 PM at 1900 Baltimore Ave, Kansas City MO. Limited capacity. RSVP required.',
    bodyHtml: '',
    senderEmail: 'hello@crossroadskc.com',
    senderName: 'Crossroads KC',
    urls: [],
  },
  {
    id: 'vague-promo',
    label: 'vague_promotion',
    expectReject: true,
    expectCompleteEvent: false,
    expectFreebie: false,
    expectTikTok: false,
    gmailMessageId: 'fixture-vague-promo',
    subject: 'Something exciting is coming soon',
    bodyText: 'Stay tuned for big news. You do not want to miss this.',
    bodyHtml: '',
    senderEmail: 'promo@randombrand.com',
    senderName: 'Random Brand',
    urls: [],
  },
  {
    id: 'order-confirmation',
    label: 'transactional_email',
    expectReject: true,
    expectCompleteEvent: false,
    expectFreebie: false,
    expectTikTok: false,
    gmailMessageId: 'fixture-order-confirmation',
    subject: 'Your order confirmation #8821',
    bodyText: 'Thank you for your purchase. Track your package with the link below.',
    bodyHtml: '',
    senderEmail: 'orders@target.com',
    senderName: 'Target',
    urls: [],
  },
];

export type RetentionMetrics = {
  completeEventRecall: number | null;
  trueFreebieRecall: number | null;
  tikTokRecall: number | null;
  junkPrecision: number | null;
  falseNegatives: string[];
  falsePositives: string[];
  blocked: boolean;
};

export async function runRetentionFixtureSet(options?: {
  skipSelectiveOcr?: boolean;
  skipExtractCache?: boolean;
}): Promise<{ metrics: RetentionMetrics; results: Awaited<ReturnType<typeof processTokenEfficientNewsletterEmail>>[] }> {
  const results = [];
  for (const fixture of RETENTION_FIXTURES) {
    results.push(
      await processTokenEfficientNewsletterEmail({
        gmailMessageId: fixture.gmailMessageId,
        subject: fixture.subject,
        bodyText: fixture.bodyText,
        bodyHtml: fixture.bodyHtml,
        senderEmail: fixture.senderEmail,
        senderName: fixture.senderName,
        urls: fixture.urls,
        fromActiveSubscription: true,
        recordSpend: false,
        emailSentAt: '2026-07-01T12:00:00Z',
        skipSelectiveOcr: options?.skipSelectiveOcr,
        skipExtractCache: options?.skipExtractCache ?? true,
      }),
    );
  }

  const blocked = results.some((r) => r.primaryOutcome === 'provider_blocked');
  const falseNegatives: string[] = [];
  const falsePositives: string[] = [];

  let completeExpected = 0;
  let completeRetained = 0;
  let freebieExpected = 0;
  let freebieRetained = 0;
  let tiktokExpected = 0;
  let tiktokRetained = 0;
  let junkExpected = 0;
  let junkRejected = 0;

  for (let i = 0; i < RETENTION_FIXTURES.length; i += 1) {
    const fixture = RETENTION_FIXTURES[i]!;
    const result = results[i]!;
    const rejected = result.primaryOutcome === 'rejected_pre_llm';
    const hasComplete =
      result.acceptedItems.some((item) => item.startDate && (item.venue || item.city)) ||
      (result.qualifyingEvents > 0 &&
        result.items.some((item) => item.startDate && (item.venue || item.city)));

    if (fixture.expectReject) {
      junkExpected += 1;
      if (rejected) junkRejected += 1;
      if (!rejected && result.acceptedItems.length > 0) {
        falsePositives.push(`${fixture.id}: expected reject, got ${result.primaryOutcome}`);
      }
    } else if (fixture.expectCompleteEvent) {
      completeExpected += 1;
      if (hasComplete) completeRetained += 1;
      else if (!blocked) falseNegatives.push(`${fixture.id}: complete event not retained (${result.primaryOutcome})`);
    }

    if (fixture.expectFreebie) {
      freebieExpected += 1;
      if (result.acceptedItems.some((item) => item.isFree)) freebieRetained += 1;
    }

    if (fixture.expectTikTok) {
      tiktokExpected += 1;
      if (result.acceptedItems.length > 0) tiktokRetained += 1;
    }

    if (!fixture.expectReject && rejected) {
      falseNegatives.push(`${fixture.id}: wrongly rejected (${result.skipReason})`);
    }
  }

  return {
    results,
    metrics: {
      completeEventRecall: blocked ? null : completeExpected ? completeRetained / completeExpected : null,
      trueFreebieRecall: blocked ? null : freebieExpected ? freebieRetained / freebieExpected : null,
      tikTokRecall: blocked ? null : tiktokExpected ? tiktokRetained / tiktokExpected : null,
      junkPrecision: junkExpected ? junkRejected / junkExpected : null,
      falseNegatives,
      falsePositives,
      blocked,
    },
  };
}
