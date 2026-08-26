import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { eq, inArray } from 'drizzle-orm';
import { assertSafeTestDatabase, db } from '../test-db.js';
import { campaigns, contentItems, sponsorContacts, sponsorOpportunities } from '../schema.js';
import {
  decideSponsorInboxPersist,
  evaluateSponsorBusinessIdentity,
  selectSponsorIdentityForWrite,
  sponsorInboundAttachmentKeys,
  SponsorBusinessIdentityRejectedError,
} from './entity-identity.js';
import {
  createSponsorContact,
  createSponsorFromOpportunity,
  updateSponsorContact,
} from './contacts.js';
import { createSponsorOpportunity } from '../sponsor-pipeline/opportunities.js';

const SHOPMY_SUBJECT = 'Thank you for your ShopMy application';
const VERIFY_SUBJECT = 'Email address verification';
const PISTACHIO = 'Who has the best pistachio latte in KC?';
const NEWSLETTER = 'BEST SELLERS: Just for you';

describe('evaluateSponsorBusinessIdentity', () => {
  it('1. ShopMy application subject only is not a business name', () => {
    const decision = evaluateSponsorBusinessIdentity({ subject: SHOPMY_SUBJECT });
    assert.equal(decision.ok, false);
    if (!decision.ok) {
      assert.ok(
        decision.reason === 'transactional_subject' || decision.reason === 'no_entity_evidence',
      );
    }
  });

  it('2. ShopMy sender/domain resolves ShopMy and keeps transactional intent off the pipeline', () => {
    const identity = evaluateSponsorBusinessIdentity({
      subject: SHOPMY_SUBJECT,
      senderEmail: 'hello@shopmy.us',
      senderName: 'The ShopMy Team',
    });
    assert.equal(identity.ok, true);
    if (identity.ok) assert.equal(identity.businessName, 'ShopMy');

    const persist = decideSponsorInboxPersist({
      subject: SHOPMY_SUBJECT,
      fromEmail: 'hello@shopmy.us',
      fromName: 'The ShopMy Team',
      bodyText: 'We received your application.',
    });
    assert.equal(persist.emailIntent, 'platform_creator');
    assert.equal(persist.createContact, false);
    assert.equal(persist.createOpportunity, false);
    assert.equal(persist.identity.ok, true);
    if (persist.identity.ok) assert.equal(persist.identity.businessName, 'ShopMy');
  });

  it('3. Email address verification is not a sponsor opportunity/contact', () => {
    const persist = decideSponsorInboxPersist({
      subject: VERIFY_SUBJECT,
      fromEmail: 'noreply@myyshop.com',
    });
    assert.equal(persist.createContact, false);
    assert.equal(persist.createOpportunity, false);
    assert.ok(
      persist.emailIntent === 'security_auth' || persist.skipReason?.includes('identity'),
    );
    const identity = evaluateSponsorBusinessIdentity({ subject: VERIFY_SUBJECT });
    assert.equal(identity.ok, false);
  });

  it('4. Pistachio-latte headline only is not a sponsor business', () => {
    const decision = evaluateSponsorBusinessIdentity({
      pageTitle: PISTACHIO,
      businessName: PISTACHIO,
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) {
      assert.ok(
        decision.reason === 'interrogative_headline' || decision.reason === 'editorial_headline',
      );
    }
  });

  it('5. Newsletter campaign subject is not a sponsor business', () => {
    const decision = evaluateSponsorBusinessIdentity({
      subject: NEWSLETTER,
      businessName: NEWSLETTER,
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) {
      assert.ok(
        decision.reason === 'campaign_subject' ||
          decision.reason === 'transactional_subject' ||
          decision.reason === 'no_entity_evidence',
      );
    }
    const persist = decideSponsorInboxPersist({ subject: NEWSLETTER });
    assert.equal(persist.createContact, false);
    assert.equal(persist.createOpportunity, false);
  });

  it('6. partnerships@scheels.com / SCHEELS evidence is allowed', () => {
    const decision = evaluateSponsorBusinessIdentity({
      businessName: 'SCHEELS',
      senderEmail: 'partnerships@scheels.com',
      email: 'partnerships@scheels.com',
      website: 'https://www.scheels.com',
    });
    assert.equal(decision.ok, true);
    if (decision.ok) assert.equal(decision.businessName, 'SCHEELS');
  });

  it('7. Operator-provided business name is allowed', () => {
    const decision = evaluateSponsorBusinessIdentity({
      businessName: 'Northfield Supply Co',
      operatorProvided: true,
    });
    assert.equal(decision.ok, true);
    if (decision.ok) assert.equal(decision.businessName, 'Northfield Supply Co');
  });

  it('8. Valid existing identity is not overwritten by a later transactional subject', () => {
    const selected = selectSponsorIdentityForWrite({
      businessName: SHOPMY_SUBJECT,
      subject: SHOPMY_SUBJECT,
      existingBusinessName: 'SCHEELS',
      email: 'partnerships@scheels.com',
      website: 'https://www.scheels.com',
    });
    assert.equal(selected.writeBusinessName, false);
    assert.equal(selected.businessName, 'SCHEELS');
    assert.ok(selected.incomingRejected);
    assert.notEqual(selected.businessName, SHOPMY_SUBJECT);
  });

  it('9. Person name with no company does not invent business_name', () => {
    const decision = evaluateSponsorBusinessIdentity({
      contactName: 'Jane Smith',
      senderEmail: 'jane.smith@gmail.com',
      subject: 'Partnership opportunity for Kellie',
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) {
      assert.ok(
        decision.reason === 'person_without_company' || decision.reason === 'no_entity_evidence',
      );
      assert.notEqual(decision.businessName, 'Jane Smith');
    }
  });

  it('10. Inbound reply attachment keys are thread/message/email — never subject', () => {
    const keys = sponsorInboundAttachmentKeys({
      fromEmail: 'partnerships@scheels.com',
      gmailThreadId: 'thread-abc',
      gmailMessageId: 'msg-1',
      subject: SHOPMY_SUBJECT,
    });
    assert.equal(keys.fromEmail, 'partnerships@scheels.com');
    assert.equal(keys.gmailThreadId, 'thread-abc');
    assert.equal(keys.gmailMessageId, 'msg-1');
    assert.equal('subject' in keys, false);
  });

  it('11. Inbound with only a bad subject-derived identity stays unmatched', () => {
    const persist = decideSponsorInboxPersist({
      subject: PISTACHIO,
      fromEmail: null,
    });
    assert.equal(persist.createContact, false);
    assert.equal(persist.createOpportunity, false);
    assert.equal(persist.identity.ok, false);
  });

  it('ShopMy marketing mail may resolve ShopMy but does not create a pipeline contact', () => {
    const persist = decideSponsorInboxPersist({
      subject: 'Get paid for what you already recommend',
      fromEmail: 'hello@shopmy.us',
      fromName: 'The ShopMy Team',
    });
    assert.equal(persist.identity.ok, true);
    if (persist.identity.ok) assert.equal(persist.identity.businessName, 'ShopMy');
    assert.equal(persist.createContact, false);
    assert.equal(persist.createOpportunity, false);
  });
});

describe('sponsor identity gate — postgres', () => {
  const contactIds: string[] = [];
  const contentItemIds: string[] = [];
  let campaignId: string;

  before(async () => {
    assertSafeTestDatabase();
    const [campaign] = await db.select({ id: campaigns.id }).from(campaigns).limit(1);
    assert.ok(campaign, 'expected at least one campaign row in social_agent_test');
    campaignId = campaign.id;
  });

  after(async () => {
    if (contactIds.length > 0) {
      await db.delete(sponsorOpportunities).where(inArray(sponsorOpportunities.sponsorContactId, contactIds));
      await db.delete(sponsorContacts).where(inArray(sponsorContacts.id, contactIds));
    }
    if (contentItemIds.length > 0) {
      await db.delete(contentItems).where(inArray(contentItems.id, contentItemIds));
    }
  });

  async function countContactsNamed(name: string): Promise<number> {
    const rows = await db
      .select({ id: sponsorContacts.id })
      .from(sponsorContacts)
      .where(eq(sponsorContacts.businessName, name));
    return rows.length;
  }

  it('createSponsorFromOpportunity rejects pistachio headline and inserts zero contacts', async () => {
    const beforeCount = await countContactsNamed(PISTACHIO);
    const contentItemId = randomUUID();
    contentItemIds.push(contentItemId);
    const now = new Date();
    await db.insert(contentItems).values({
      id: contentItemId,
      campaignId,
      type: 'industry_insight',
      language: 'en',
      state: 'planned',
      topic: PISTACHIO,
      sourceExternalId: `test-pistachio-${contentItemId.slice(0, 8)}`,
      sourceUrl: 'https://www.inkansascity.com/pistachio-latte',
      discoveredAt: now,
      firstSeenAt: now,
      lastSeenAt: now,
      creatorValueStatus: 'creator_candidate',
      lifecycleStatus: 'active',
      metadata: { businessName: PISTACHIO, title: PISTACHIO },
    });

    await assert.rejects(
      () => createSponsorFromOpportunity(contentItemId),
      (err: unknown) => {
        assert.ok(err instanceof SponsorBusinessIdentityRejectedError);
        return true;
      },
    );
    assert.equal(await countContactsNamed(PISTACHIO), beforeCount);
  });

  it('createSponsorContact allows SCHEELS from partnerships@scheels.com', async () => {
    const contact = await createSponsorContact({
      businessName: 'SCHEELS',
      email: 'partnerships@scheels.com',
      senderEmail: 'partnerships@scheels.com',
      website: 'https://www.scheels.com',
      status: 'lead',
    });
    contactIds.push(contact.id);
    assert.equal(contact.businessName, 'SCHEELS');
  });

  it('operator-provided business name persists', async () => {
    const contact = await createSponsorContact({
      businessName: 'Northfield Supply Co',
      operatorProvided: true,
      status: 'lead',
    });
    contactIds.push(contact.id);
    assert.equal(contact.businessName, 'Northfield Supply Co');
  });

  it('later transactional subject does not overwrite a valid business name', async () => {
    const contact = await createSponsorContact({
      businessName: 'SCHEELS',
      email: 'partnerships@scheels.com',
      senderEmail: 'partnerships@scheels.com',
      website: 'https://www.scheels.com',
      status: 'lead',
    });
    contactIds.push(contact.id);
    const updated = await updateSponsorContact(contact.id, { businessName: SHOPMY_SUBJECT });
    assert.ok(updated);
    assert.equal(updated!.businessName, 'SCHEELS');
  });

  it('createSponsorOpportunity refuses a junk legacy contact name', async () => {
    const [row] = await db
      .insert(sponsorContacts)
      .values({
        businessName: VERIFY_SUBJECT,
        status: 'lead',
      })
      .returning({ id: sponsorContacts.id });
    contactIds.push(row!.id);
    await assert.rejects(
      () =>
        createSponsorOpportunity({
          sponsorContactId: row!.id,
          title: VERIFY_SUBJECT,
        }),
      (err: unknown) => {
        assert.ok(err instanceof SponsorBusinessIdentityRejectedError);
        return true;
      },
    );
  });

  it('createSponsorContact rejects ShopMy application subject as the business name', async () => {
    const beforeCount = await countContactsNamed(SHOPMY_SUBJECT);
    await assert.rejects(
      () =>
        createSponsorContact({
          businessName: SHOPMY_SUBJECT,
          subject: SHOPMY_SUBJECT,
          status: 'lead',
        }),
      (err: unknown) => {
        assert.ok(err instanceof SponsorBusinessIdentityRejectedError);
        return true;
      },
    );
    assert.equal(await countContactsNamed(SHOPMY_SUBJECT), beforeCount);
  });

  it('Loews homepage URL + business field is allowed (valid existing flow)', async () => {
    const contentItemId = randomUUID();
    contentItemIds.push(contentItemId);
    const now = new Date();
    await db.insert(contentItems).values({
      id: contentItemId,
      campaignId,
      type: 'industry_insight',
      language: 'en',
      state: 'planned',
      topic: 'Loews Kansas City Hotel',
      sourceExternalId: `test-loews-ident-${contentItemId.slice(0, 8)}`,
      sourceUrl: 'https://www.loewshotels.com/kansas-city',
      discoveredAt: now,
      firstSeenAt: now,
      lastSeenAt: now,
      creatorValueStatus: 'creator_candidate',
      lifecycleStatus: 'active',
      metadata: { businessName: 'Loews Kansas City Hotel' },
    });
    const { contact, created } = await createSponsorFromOpportunity(contentItemId);
    if (created) contactIds.push(contact.id);
    assert.match(contact.businessName, /Loews/i);
  });
});
