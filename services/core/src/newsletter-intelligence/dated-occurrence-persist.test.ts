import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { eq, like } from 'drizzle-orm';
import { assertSafeTestDatabase, db } from '../test-db.js';
import { campaigns, contentItems, sources } from '../schema.js';
import { persistNewsletterInventoryItem } from './persist.js';
import { extractDatedOccurrencesFromPlainText } from './dated-occurrence-extract.js';
import { evaluateNewsletterItem } from './quality-gates.js';
import { resolveDiscoveryOccurrenceOutcome } from './occurrence-outcome.js';
import type { NewsletterParseContext } from './types.js';

const PREFIX = 'ZZZ_TEST_FIXTURE_dated_occ_';

let campaignId = '';
let sourceId = '';
const insertedIds: string[] = [];

describe('dated occurrence persist idempotency', () => {
  before(async () => {
    assertSafeTestDatabase();
    const [campaign] = await db.select({ id: campaigns.id }).from(campaigns).limit(1);
    assert.ok(campaign, 'expected a campaign in social_agent_test');
    campaignId = campaign.id;
    const [source] = await db
      .insert(sources)
      .values({
        campaignId,
        type: 'manual',
        name: `${PREFIX}source`,
        config: { ingest: 'newsletter_intelligence' },
        active: false,
      })
      .returning({ id: sources.id });
    assert.ok(source);
    sourceId = source.id;
  });

  after(async () => {
    if (insertedIds.length) {
      await db.delete(contentItems).where(like(contentItems.topic, `${PREFIX}%`));
    }
    if (sourceId) {
      await db.delete(contentItems).where(eq(contentItems.sourceId, sourceId));
      await db.delete(sources).where(eq(sources.id, sourceId));
    }
  });

  it('second persist of the same dated occurrence does not insert a duplicate row', async () => {
    const extracted = extractDatedOccurrencesFromPlainText({
      subject: 'This week at The Ship',
      bodyText: `${PREFIX}Summer Jazz Night at The Ship, Aug 15.`,
      emailSentAt: '2026-08-13T15:00:00Z',
    }).filter((item) => evaluateNewsletterItem(item).accept);
    assert.equal(extracted.length, 1);
    const item = { ...extracted[0]!, title: `${PREFIX}Summer Jazz Night`, entityName: `${PREFIX}The Ship` };

    const ctx: NewsletterParseContext = {
      gmailMessageId: `gmail-${randomUUID()}`,
      gmailThreadId: `thread-${randomUUID()}`,
      senderEmail: 'editor@example.test',
      senderName: 'Test Editor',
      senderDomain: 'example.test',
      subject: 'This week at The Ship',
      receivedAt: new Date('2026-08-13T15:00:00Z'),
      bodyText: item.description ?? '',
      bodyHtml: '',
      urls: [],
      newsletterSourceId: null,
      newsletterSourceName: 'Test Editor',
      newsletterCategory: 'venue_event_newsletter',
      discoveryEmailMessageId: randomUUID(),
      discoverySubscriptionId: null,
      isOfficialSender: false,
    };

    const first = await persistNewsletterInventoryItem({
      ctx,
      item,
      sourceId,
      campaignId,
      resolvedLinks: new Map(),
    });
    assert.ok(first);
    assert.equal(first.created, true);
    insertedIds.push(first.contentItemId);

    const second = await persistNewsletterInventoryItem({
      ctx,
      item,
      sourceId,
      campaignId,
      resolvedLinks: new Map(),
    });
    assert.ok(second);
    assert.equal(second.created, false);
    assert.equal(second.duplicateMerged, true);
    assert.equal(second.contentItemId, first.contentItemId);

    const rows = await db
      .select({ id: contentItems.id })
      .from(contentItems)
      .where(like(contentItems.topic, `${PREFIX}%`));
    assert.equal(rows.length, 1);

    const outcome = resolveDiscoveryOccurrenceOutcome({
      datedOccurrencesCreated: second.created ? 1 : 0,
      datedOccurrenceDuplicates: second.duplicateMerged ? 1 : 0,
      extractedItemCount: 1,
      datedCandidateCount: 1,
    });
    assert.equal(outcome.reason, 'duplicate_only');
    assert.equal(outcome.processingStatus, 'duplicate');
  });
});
