import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { eq, inArray, sql } from 'drizzle-orm';
import { assertSafeTestDatabase, db } from '../test-db.js';
import { campaigns, contentItems, creatorPartnerships } from '../schema.js';
import { evaluatePartnershipEntityIdentity, PartnershipIdentityRejectedError } from './entity-identity.js';
import { submitCreatorPartnership } from './pipeline.js';
import { listPartnershipSources, readPartnershipMetadata } from './partnership-sources.js';
import {
  buildLegacyOpportunityFingerprint,
  buildOpportunityFingerprint,
  canonicalizeOpportunityFingerprintTuple,
  existingRowAllowsFingerprintTouch,
  hashOpportunityFingerprintTuple,
  normalizeSourceUrl,
  OPPORTUNITY_FINGERPRINT_VERSION,
  tryBuildOpportunityFingerprint,
} from './url-intelligence.js';

const SCREEN = 'test_fingerprint_v2';
const WGACA_URL =
  'https://www.scheels.com/c/all/b/what%20goes%20around%20comes%20around?r=storeAvailability%3A88';
const WGACA_EQUIV_URL = 'https://www.scheels.com/c/all/b/what-goes-around-comes-around';
const NIKE_SCHEELS_URL = 'https://www.scheels.com/c/all/b/nike';
const LOEWS_KC_URL = 'https://www.loewshotels.com/kansas-city';
const LOEWS_INFLUENCER_URL = 'https://www.loewshotels.com/influencer-stay-request';
const SHOPMY_A_URL = 'https://shopmy.us/kellie';
const SHOPMY_B_URL = 'https://shopmy.us/programs/abc';
const IG_POST_A = 'https://www.instagram.com/p/Dbtacojzn1r/';
const IG_POST_B = 'https://www.instagram.com/p/AbCdEfGhIjK2/';
const EDITORIAL_URL = 'https://kcstudio.org/top-things-to-do-this-summer-2025/';
const EDITORIAL_TITLE = 'Top Things To Do This Summer 2025';

const LEGACY_SCHEELS = {
  registrableDomain: 'scheels.com',
  brandSlug: 'what goes around comes around',
  retailerSlug: 'scheels',
  collectionSlug: 'what goes around comes around',
} as const;

const LEGACY_NIKE = {
  registrableDomain: 'scheels.com',
  brandSlug: 'nike',
  retailerSlug: 'scheels',
  collectionSlug: 'nike',
} as const;

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

describe('opportunity fingerprint V2 — unit', () => {
  it('1. legacy Scheels formula collides WGACA with Nike', () => {
    const wgaca = buildLegacyOpportunityFingerprint(LEGACY_SCHEELS);
    const nike = buildLegacyOpportunityFingerprint(LEGACY_NIKE);
    assert.equal(wgaca, nike);
    assert.equal(wgaca.length, 32);
    assert.equal(Buffer.from(wgaca, 'hex').toString('utf8'), 'scheels.com|sche');
  });

  it('2. V2 Scheels WGACA !== Nike and uses SHA-256', () => {
    const tuple = canonicalizeOpportunityFingerprintTuple({
      registrableDomain: 'scheels.com',
      retailerName: 'Scheels',
      brandName: 'What Goes Around Comes Around',
    });
    assert.equal(tuple, 'v2|scheels.com|scheels|what-goes-around-comes-around|');
    const wgaca = buildOpportunityFingerprint({
      registrableDomain: 'scheels.com',
      retailerName: 'Scheels',
      brandName: 'What Goes Around Comes Around',
    });
    const nike = buildOpportunityFingerprint({
      registrableDomain: 'scheels.com',
      retailerName: 'Scheels',
      brandName: 'Nike',
    });
    assert.notEqual(wgaca, nike);
    assert.equal(wgaca, sha256Hex(tuple));
    assert.equal(wgaca, hashOpportunityFingerprintTuple(tuple));
    assert.match(wgaca, /^[0-9a-f]{64}$/);
    assert.match(nike, /^[0-9a-f]{64}$/);
    assert.notEqual(wgaca, buildLegacyOpportunityFingerprint(LEGACY_SCHEELS));
  });

  it('3. ShopMy equivalent identity is a stable V2 fingerprint', () => {
    const a = tryBuildOpportunityFingerprint({
      identityOk: true,
      registrableDomain: 'shopmy.us',
      retailerName: 'Shopmy',
      brandName: 'ShopMy',
    });
    const b = tryBuildOpportunityFingerprint({
      identityOk: true,
      registrableDomain: 'shopmy.us',
      retailerName: 'ShopMy',
      brandName: 'ShopMy',
    });
    assert.ok(a && b);
    assert.equal(a.tuple, 'v2|shopmy.us|shopmy|shopmy|');
    assert.equal(a.fingerprint, b.fingerprint);
    assert.equal(a.version, OPPORTUNITY_FINGERPRINT_VERSION);
    assert.equal(a.fingerprint, sha256Hex(a.tuple));
  });

  it('4. Loews equivalent identity is a stable V2 fingerprint', () => {
    const a = tryBuildOpportunityFingerprint({
      identityOk: true,
      registrableDomain: 'loewshotels.com',
      retailerName: 'Loewshotels',
      brandName: 'Loews',
    });
    const b = tryBuildOpportunityFingerprint({
      identityOk: true,
      registrableDomain: 'loewshotels.com',
      retailerName: 'Loewshotels',
      brandName: 'Loews',
    });
    assert.ok(a && b);
    assert.equal(a.tuple, 'v2|loewshotels.com|loewshotels|loews|');
    assert.equal(a.fingerprint, b.fingerprint);
  });

  it('5. Instagram shortcode does not get a V2 fingerprint', () => {
    const identity = evaluatePartnershipEntityIdentity({
      brandName: 'Dbtacojzn1r',
      submittedUrl: IG_POST_A,
    });
    assert.equal(identity.ok, false);
    assert.equal(
      tryBuildOpportunityFingerprint({
        identityOk: identity.ok,
        registrableDomain: 'instagram.com',
        retailerName: 'Instagram',
        brandName: 'Dbtacojzn1r',
      }),
      null,
    );
  });

  it('6. editorial headline does not get a V2 fingerprint', () => {
    const identity = evaluatePartnershipEntityIdentity({
      brandName: EDITORIAL_TITLE,
      submittedUrl: EDITORIAL_URL,
    });
    assert.equal(identity.ok, false);
    assert.equal(
      tryBuildOpportunityFingerprint({
        identityOk: identity.ok,
        registrableDomain: 'kcstudio.org',
        retailerName: 'Kcstudio',
        brandName: EDITORIAL_TITLE,
      }),
      null,
    );
  });

  it('different domains with the same brand get different V2 fingerprints', () => {
    const scheelsNike = buildOpportunityFingerprint({
      registrableDomain: 'scheels.com',
      retailerName: 'Scheels',
      brandName: 'Nike',
    });
    const nikeCom = buildOpportunityFingerprint({
      registrableDomain: 'nike.com',
      retailerName: 'Nike',
      brandName: 'Nike',
    });
    assert.notEqual(scheelsNike, nikeCom);
  });

  it('tryBuildOpportunityFingerprint is null when identity is not ok', () => {
    assert.equal(
      tryBuildOpportunityFingerprint({
        identityOk: false,
        registrableDomain: 'scheels.com',
        retailerName: 'Scheels',
        brandName: 'Nike',
      }),
      null,
    );
  });

  it('legacy metadata cannot pass the fingerprint touch gate', () => {
    const incoming = tryBuildOpportunityFingerprint({
      identityOk: true,
      registrableDomain: 'scheels.com',
      retailerName: 'Scheels',
      brandName: 'What Goes Around Comes Around',
    });
    assert.ok(incoming);
    assert.equal(
      existingRowAllowsFingerprintTouch({
        existingMetadata: {
          opportunityFingerprint: buildLegacyOpportunityFingerprint(LEGACY_SCHEELS),
        },
        existingBrandName: 'What Goes Around Comes Around',
        incoming,
        incomingBrandName: 'What Goes Around Comes Around',
      }),
      false,
    );
    assert.equal(
      existingRowAllowsFingerprintTouch({
        existingMetadata: {
          opportunityFingerprint: incoming.fingerprint,
          opportunityFingerprintVersion: 2,
        },
        existingBrandName: 'What Goes Around Comes Around',
        incoming,
        incomingBrandName: 'Nike',
      }),
      false,
    );
  });
});

describe('opportunity fingerprint V2 — postgres', () => {
  const partnershipIds: string[] = [];
  const contentItemIds: string[] = [];
  let testDatabaseUrl = '';

  function track(result: { partnershipId: string; contentItemId: string }) {
    partnershipIds.push(result.partnershipId);
    contentItemIds.push(result.contentItemId);
    return result;
  }

  async function insertFixture(input: {
    submittedUrl: string;
    brandName: string;
    retailerName: string;
    metadata: Record<string, unknown>;
  }): Promise<{ partnershipId: string; contentItemId: string }> {
    const [campaign] = await db.select({ id: campaigns.id }).from(campaigns).limit(1);
    assert.ok(campaign);
    const [item] = await db
      .insert(contentItems)
      .values({
        campaignId: campaign.id,
        type: 'industry_insight',
        state: 'planned',
        topic: `${SCREEN} ${input.brandName}`,
        creatorValueStatus: 'researching',
        lifecycleStatus: 'active',
      })
      .returning({ id: contentItems.id });
    assert.ok(item);
    contentItemIds.push(item.id);
    const [partnership] = await db
      .insert(creatorPartnerships)
      .values({
        contentItemId: item.id,
        submittedUrl: input.submittedUrl,
        brandName: input.brandName,
        retailerName: input.retailerName,
        pipelineStatus: 'discovered',
        researchStatus: 'queued',
        metadata: input.metadata,
      })
      .returning({ id: creatorPartnerships.id });
    assert.ok(partnership);
    partnershipIds.push(partnership.id);
    return { partnershipId: partnership.id, contentItemId: item.id };
  }

  async function loadPartnership(id: string) {
    const [row] = await db.select().from(creatorPartnerships).where(eq(creatorPartnerships.id, id)).limit(1);
    assert.ok(row);
    return row;
  }

  before(async () => {
    testDatabaseUrl = assertSafeTestDatabase();
    assert.match(testDatabaseUrl, /\/social_agent_test(?:\?|$)/);
    const leftover = (await db.execute(sql`
      SELECT id::text as id, content_item_id::text as content_item_id
      FROM creator_partnerships
      WHERE metadata->>'sourceScreen' = ${SCREEN}
    `)) as unknown as Array<{ id: string; content_item_id: string }>;
    if (leftover.length > 0) {
      await db.delete(creatorPartnerships).where(
        inArray(
          creatorPartnerships.id,
          leftover.map((row) => row.id),
        ),
      );
      await db.delete(contentItems).where(
        inArray(
          contentItems.id,
          leftover.map((row) => row.content_item_id),
        ),
      );
    }
    const [existingCampaign] = await db.select({ id: campaigns.id }).from(campaigns).limit(1);
    assert.ok(existingCampaign, 'expected at least one campaign row in social_agent_test');
  });

  after(async () => {
    if (partnershipIds.length > 0) {
      await db.delete(creatorPartnerships).where(inArray(creatorPartnerships.id, partnershipIds));
    }
    if (contentItemIds.length > 0) {
      await db.delete(contentItems).where(inArray(contentItems.id, contentItemIds));
    }
  });

  it('proves postgres tests use social_agent_test', () => {
    assert.match(testDatabaseUrl, /\/social_agent_test(?:\?|$)/);
    assert.doesNotMatch(testDatabaseUrl, /\/social_agent(?:\?|$)/);
  });

  it('A/7/8/9. WGACA vs Nike: exact URL dups, equivalent URL may merge, Nike does not touch WGACA', async () => {
    const wgaca = track(
      await submitCreatorPartnership(
        { url: WGACA_URL, text: 'brand: What Goes Around Comes Around', sourceScreen: SCREEN },
        { skipResearch: true },
      ),
    );
    assert.equal(wgaca.duplicate, false);
    const wgacaRow = await loadPartnership(wgaca.partnershipId);
    assert.equal(wgacaRow.brandName, 'What Goes Around Comes Around');
    const wgacaMeta = readPartnershipMetadata(wgacaRow.metadata);
    assert.equal(wgacaMeta.opportunityFingerprintVersion, 2);
    assert.match(String(wgacaMeta.opportunityFingerprint), /^[0-9a-f]{64}$/);
    assert.equal(String(wgacaMeta.opportunityFingerprint).length, 64);

    const sameUrl = await submitCreatorPartnership(
      { url: WGACA_URL, text: 'brand: What Goes Around Comes Around', sourceScreen: SCREEN },
      { skipResearch: true },
    );
    assert.equal(sameUrl.duplicate, true);
    assert.equal(sameUrl.partnershipId, wgaca.partnershipId);

    const equiv = await submitCreatorPartnership(
      {
        url: WGACA_EQUIV_URL,
        text: 'brand: What Goes Around Comes Around',
        sourceScreen: SCREEN,
      },
      { skipResearch: true },
    );
    assert.equal(equiv.duplicate, true);
    assert.equal(equiv.partnershipId, wgaca.partnershipId);

    const nike = track(
      await submitCreatorPartnership(
        { url: NIKE_SCHEELS_URL, text: 'brand: Nike', sourceScreen: SCREEN },
        { skipResearch: true },
      ),
    );
    assert.equal(nike.duplicate, false);
    assert.notEqual(nike.partnershipId, wgaca.partnershipId);
    const nikeRow = await loadPartnership(nike.partnershipId);
    assert.equal(nikeRow.brandName, 'Nike');
    const nikeMeta = readPartnershipMetadata(nikeRow.metadata);
    assert.notEqual(nikeMeta.opportunityFingerprint, wgacaMeta.opportunityFingerprint);

    const wgacaAfter = await loadPartnership(wgaca.partnershipId);
    const sources = listPartnershipSources(readPartnershipMetadata(wgacaAfter.metadata));
    assert.equal(
      sources.some((s) => s.normalizedUrl.includes('/b/nike')),
      false,
    );
    assert.equal(wgacaAfter.brandName, 'What Goes Around Comes Around');
  });

  it('10/11. invalid colliding candidate is rejected before fingerprint lookup and does not touch WGACA', async () => {
    const wgaca = track(
      await submitCreatorPartnership(
        {
          url: 'https://www.scheels.com/c/all/b/what-goes-around-comes-around?r=storeAvailability%3A99',
          text: 'brand: What Goes Around Comes Around',
          sourceScreen: SCREEN,
        },
        { skipResearch: true },
      ),
    );
    const before = await loadPartnership(wgaca.partnershipId);
    const beforeSources = listPartnershipSources(readPartnershipMetadata(before.metadata));
    const junkUrl = `https://www.scheels.com/identity-gate-junk-${Date.now()}`;
    await assert.rejects(
      () =>
        submitCreatorPartnership(
          { url: junkUrl, text: 'brand: Dbtacojzn1r', sourceScreen: SCREEN },
          { skipResearch: true },
        ),
      (err: unknown) => {
        assert.ok(err instanceof PartnershipIdentityRejectedError);
        return true;
      },
    );
    const afterRow = await loadPartnership(wgaca.partnershipId);
    assert.equal(afterRow.brandName, before.brandName);
    assert.equal(afterRow.researchStatus, before.researchStatus);
    const afterSources = listPartnershipSources(readPartnershipMetadata(afterRow.metadata));
    assert.equal(afterSources.length, beforeSources.length);
    assert.equal(
      afterSources.some((s) => s.originalUrl === junkUrl || s.normalizedUrl.includes('identity-gate-junk')),
      false,
    );
  });

  it('B. Instagram post is identity-rejected; existing fixture is unchanged', async () => {
    const fixture = await insertFixture({
      submittedUrl: normalizeSourceUrl(IG_POST_A),
      brandName: 'Dbtacojzn1r',
      retailerName: 'Instagram',
      metadata: {
        sourceScreen: SCREEN,
        opportunityFingerprint: buildLegacyOpportunityFingerprint({
          registrableDomain: 'instagram.com',
          brandSlug: null,
          retailerSlug: 'instagram',
          collectionSlug: null,
        }),
        fixtureMarker: 'ig-legacy',
      },
    });
    const before = await loadPartnership(fixture.partnershipId);
    await assert.rejects(
      () => submitCreatorPartnership({ url: IG_POST_B, text: IG_POST_B, sourceScreen: SCREEN }, { skipResearch: true }),
      (err: unknown) => {
        assert.ok(err instanceof PartnershipIdentityRejectedError);
        return true;
      },
    );
    const afterRow = await loadPartnership(fixture.partnershipId);
    assert.equal(afterRow.submittedUrl, before.submittedUrl);
    assert.equal(afterRow.brandName, 'Dbtacojzn1r');
    const meta = readPartnershipMetadata(afterRow.metadata);
    assert.equal(meta.fixtureMarker, 'ig-legacy');
    assert.equal(meta.opportunityFingerprintVersion, undefined);
    assert.equal(listPartnershipSources(meta).length, 0);
  });

  it('C. equivalent Loews URLs with the same defensible brand share one V2 partnership', async () => {
    const first = track(
      await submitCreatorPartnership(
        { url: LOEWS_KC_URL, text: 'brand: Loews', sourceScreen: SCREEN },
        { skipResearch: true },
      ),
    );
    assert.equal(first.duplicate, false);
    const second = await submitCreatorPartnership(
      { url: LOEWS_INFLUENCER_URL, text: 'brand: Loews', sourceScreen: SCREEN },
      { skipResearch: true },
    );
    assert.equal(second.duplicate, true);
    assert.equal(second.partnershipId, first.partnershipId);
    const row = await loadPartnership(first.partnershipId);
    const meta = readPartnershipMetadata(row.metadata);
    assert.equal(meta.opportunityFingerprintVersion, 2);
    assert.equal(listPartnershipSources(meta).length, 2);
  });

  it('ShopMy equivalent platform URLs share one V2 partnership', async () => {
    const first = track(
      await submitCreatorPartnership(
        { url: SHOPMY_A_URL, text: 'brand: ShopMy', sourceScreen: SCREEN },
        { skipResearch: true },
      ),
    );
    const second = await submitCreatorPartnership(
      { url: SHOPMY_B_URL, text: 'brand: ShopMy', sourceScreen: SCREEN },
      { skipResearch: true },
    );
    assert.equal(second.duplicate, true);
    assert.equal(second.partnershipId, first.partnershipId);
  });

  it('12/13. legacy fingerprint row resolves by exact URL only; different same-host URL does not merge', async () => {
    const legacyUrl = normalizeSourceUrl(
      'https://www.scheels.com/c/all/b/what-goes-around-comes-around?r=storeAvailability%3A77',
    );
    const legacyFp = buildLegacyOpportunityFingerprint(LEGACY_SCHEELS);
    const fixture = await insertFixture({
      submittedUrl: legacyUrl,
      brandName: 'What Goes Around Comes Around',
      retailerName: 'Scheels',
      metadata: {
        sourceScreen: SCREEN,
        opportunityFingerprint: legacyFp,
        fixtureMarker: 'legacy-scheels',
      },
    });

    const sameUrl = await submitCreatorPartnership(
      { url: legacyUrl, text: 'brand: What Goes Around Comes Around', sourceScreen: SCREEN },
      { skipResearch: true },
    );
    assert.equal(sameUrl.duplicate, true);
    assert.equal(sameUrl.partnershipId, fixture.partnershipId);
    const afterUrl = await loadPartnership(fixture.partnershipId);
    const afterUrlMeta = readPartnershipMetadata(afterUrl.metadata);
    assert.equal(afterUrlMeta.opportunityFingerprint, legacyFp);
    assert.equal(afterUrlMeta.opportunityFingerprintVersion, undefined);
    assert.equal(afterUrlMeta.fixtureMarker, 'legacy-scheels');

    const otherHostUrl = 'https://www.scheels.com/c/all/b/patagonia?r=storeAvailability%3A77';
    const other = track(
      await submitCreatorPartnership(
        { url: otherHostUrl, text: 'brand: Patagonia', sourceScreen: SCREEN },
        { skipResearch: true },
      ),
    );
    assert.equal(other.duplicate, false);
    assert.notEqual(other.partnershipId, fixture.partnershipId);
    const afterOther = await loadPartnership(fixture.partnershipId);
    const afterOtherMeta = readPartnershipMetadata(afterOther.metadata);
    assert.equal(afterOtherMeta.opportunityFingerprint, legacyFp);
    assert.equal(afterOther.brandName, 'What Goes Around Comes Around');
    assert.equal(
      listPartnershipSources(afterOtherMeta).some((s) => s.normalizedUrl.includes('/b/patagonia')),
      false,
    );
  });
});
