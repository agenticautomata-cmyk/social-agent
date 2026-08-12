import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../db.js';
import { creatorPartnershipActivities, creatorPartnerships, creatorPlatformActivities } from '../schema.js';
import { pickBestPartnershipMatch } from './email-match.js';
import { inferEmailActivity, sanitizeSuggestedStatus } from './infer-email-activity.js';
import { parseFollowUpFromEmail } from './parse-follow-up.js';
import { shouldSuppressDuplicateActivity } from './activities.js';
import { tryCreatePlatformActivityFromEmail } from './platform-activities.js';
import type { PartnershipFingerprints } from './types.js';

const REKLAIM_FINGERPRINTS: PartnershipFingerprints = {
  brandName: 'REKLAIM',
  retailerNames: ['Jared'],
  programNames: ['Conscious Collective'],
  domains: ['reklaim.com', 'jared.com'],
  keywordPhrases: ['reklaim', 'authenticated pre-owned', 'conscious collective'],
  sharedPlatforms: ['shopmy'],
  updatedAt: new Date().toISOString(),
};

const FIXTURE_GMAIL_PREFIX = 'test_platform_match_';

describe('platform email match hardening', () => {
  it('generic ShopMy application receipt becomes platform activity inference', () => {
    const inferred = inferEmailActivity({
      subject: 'Thank you for your ShopMy application',
      bodyText: 'We received your application. Our team review takes 1-3 business days.',
      senderDomain: 'shopmy.us',
    });
    assert.equal(inferred.entityType, 'platform');
    assert.equal(inferred.entityName, 'ShopMy');
    assert.equal(inferred.activityType, 'platform_application_received');
    assert.equal(sanitizeSuggestedStatus(inferred), null);
    assert.match(inferred.suggestedAction ?? '', /wait for shopmy review/i);
  });

  it('generic ShopMy approval becomes platform activity and not REKLAIM accepted', () => {
    const inferred = inferEmailActivity({
      subject: 'Your ShopMy application has been approved',
      bodyText: 'Congratulations! Your ShopMy creator account is approved.',
      senderDomain: 'shopmy.us',
    });
    assert.equal(inferred.activityType, 'platform_approved');
    assert.equal(sanitizeSuggestedStatus(inferred), null);

    const match = pickBestPartnershipMatch(
      {
        subject: 'Your ShopMy application has been approved',
        bodyText: 'Congratulations! Your ShopMy creator account is approved.',
        senderEmail: 'hello@shopmy.us',
        senderDomain: 'shopmy.us',
        gmailThreadId: 'thread-shopmy-approval',
      },
      [{ partnershipId: 'reklaim-id', fingerprints: REKLAIM_FINGERPRINTS }],
    );
    assert.equal(match, null);
  });

  it('neither ShopMy application nor approval marks REKLAIM accepted', () => {
    for (const subject of [
      'Thank you for your ShopMy application',
      'Your ShopMy application has been approved',
    ]) {
      const inferred = inferEmailActivity({
        subject,
        bodyText: subject,
        senderDomain: 'shopmy.us',
        knownBrandNames: ['REKLAIM'],
      });
      assert.equal(sanitizeSuggestedStatus(inferred), null);
    }
  });

  it('ShopMy + explicit REKLAIM reference may link to REKLAIM', () => {
    const match = pickBestPartnershipMatch(
      {
        subject: 'ShopMy update for REKLAIM creators',
        bodyText: 'Your REKLAIM storefront on ShopMy is ready.',
        senderEmail: 'hello@shopmy.us',
        senderDomain: 'shopmy.us',
        gmailThreadId: 'thread-shopmy-reklaim',
      },
      [{ partnershipId: 'reklaim-id', fingerprints: REKLAIM_FINGERPRINTS }],
    );
    assert.ok(match);
    assert.equal(match!.partnershipId, 'reklaim-id');
  });

  it('explicit email timing beats default follow-up timing', () => {
    const receivedAt = new Date('2026-08-09T12:00:00.000Z');
    const explicit = parseFollowUpFromEmail(
      'Thank you for your ShopMy application. Our team review takes 1-3 business days.',
      receivedAt,
    );
    const fallback = parseFollowUpFromEmail('Thank you for applying.', receivedAt);
    assert.ok(explicit.getTime() > receivedAt.getTime());
    assert.ok(explicit.getTime() < fallback.getTime());
  });

  it('rejected match stays rejected on later sync', () => {
    assert.equal(shouldSuppressDuplicateActivity({ confirmationStatus: 'rejected' }), true);
    assert.equal(shouldSuppressDuplicateActivity({ confirmationStatus: 'confirmed' }), true);
    assert.equal(shouldSuppressDuplicateActivity({ confirmationStatus: 'pending' }), false);
  });
});

describe('platform activity idempotency (db)', () => {
  const gmailMessageId = `${FIXTURE_GMAIL_PREFIX}${Date.now()}`;

  after(async () => {
    await db
      .delete(creatorPlatformActivities)
      .where(inArray(creatorPlatformActivities.gmailMessageId, [gmailMessageId]));
  });

  it('same Gmail message processed twice creates one platform activity', async () => {
    const input = {
      gmailMessageId,
      gmailThreadId: 'thread-idempotent',
      senderEmail: 'hello@shopmy.us',
      senderDomain: 'shopmy.us',
      subject: 'Thank you for your ShopMy application',
      bodyText: 'We received your application. Review takes 1-3 business days.',
      snippet: 'We received your application.',
      receivedAt: new Date('2026-08-08T10:00:00.000Z'),
    };

    const first = await tryCreatePlatformActivityFromEmail(input);
    const second = await tryCreatePlatformActivityFromEmail(input);

    assert.equal(first.created, true);
    assert.ok(first.activity);
    assert.equal(second.created, false);
    assert.equal(second.reason, 'duplicate');

    const rows = await db
      .select()
      .from(creatorPlatformActivities)
      .where(eq(creatorPlatformActivities.gmailMessageId, gmailMessageId));
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.activityType, 'platform_application_received');
  });

  it('bounded replay is idempotent for platform activity', async () => {
    const boundedId = `${FIXTURE_GMAIL_PREFIX}bounded_${Date.now()}`;
    const input = {
      gmailMessageId: boundedId,
      gmailThreadId: 'thread-bounded',
      senderEmail: 'hello@shopmy.us',
      senderDomain: 'shopmy.us',
      subject: 'Thank you for your ShopMy application',
      bodyText: 'Review takes 1-3 business days.',
      snippet: 'Review takes 1-3 business days.',
      receivedAt: new Date('2026-08-08T10:00:00.000Z'),
    };

    const first = await tryCreatePlatformActivityFromEmail(input);
    const second = await tryCreatePlatformActivityFromEmail(input);
    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(second.reason, 'duplicate');

    await db.delete(creatorPlatformActivities).where(eq(creatorPlatformActivities.gmailMessageId, boundedId));
  });
});

describe('partnership activity idempotency (db)', () => {
  const gmailMessageId = `${FIXTURE_GMAIL_PREFIX}partnership_${Date.now()}`;

  after(async () => {
    await db
      .delete(creatorPartnershipActivities)
      .where(eq(creatorPartnershipActivities.gmailMessageId, gmailMessageId));
  });

  it('same Gmail message processed twice creates one partnership activity', async () => {
    const [partnership] = await db.select({ id: creatorPartnerships.id }).from(creatorPartnerships).limit(1);
    assert.ok(partnership, 'expected an existing creator partnership row for idempotency test');

    const values = {
      creatorPartnershipId: partnership!.id,
      activityType: 'program_approved',
      entityType: 'program',
      entityName: 'Conscious Collective',
      gmailMessageId,
      gmailThreadId: 'thread-partnership',
      senderEmail: 'partnerships@reklaim.com',
      senderDomain: 'reklaim.com',
      subject: 'Welcome to Conscious Collective',
      snippet: 'You are accepted.',
      matchConfidence: '0.8500',
      matchedOn: 'program name',
      suggestedStatus: 'accepted',
      suggestedAction: 'Review terms',
      requiresConfirmation: true,
      confirmationStatus: 'pending',
    };

    const first = await db.insert(creatorPartnershipActivities).values(values).onConflictDoNothing().returning();
    const second = await db.insert(creatorPartnershipActivities).values(values).onConflictDoNothing().returning();

    assert.equal(first.length, 1);
    assert.equal(second.length, 0);

    const rows = await db
      .select()
      .from(creatorPartnershipActivities)
      .where(eq(creatorPartnershipActivities.gmailMessageId, gmailMessageId));
    assert.equal(rows.length, 1);
  });
});
