import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { eq, inArray } from 'drizzle-orm';
import { assertSafeTestDatabase, db } from '../test-db.js';
import { campaigns, contentItems, creatorPartnerships } from '../schema.js';
import {
  evaluatePartnershipEntityIdentity,
  PartnershipIdentityRejectedError,
  selectPartnershipIdentityForWrite,
} from './entity-identity.js';
import { inferNamesFromSubmission } from './detect.js';
import { runPartnershipResearch, submitCreatorPartnership } from './pipeline.js';
import type { PartnershipResearch } from './types.js';

const IG_SHORTCODE = 'Dbtacojzn1r';
const EDITORIAL_TITLE = 'Top Things To Do This Summer 2025';
const TRANSACTIONAL_SUBJECT = 'Thank you for your ShopMy application';
const SOFT_CONTEXT = 'Unrelated Soft Context Hotel';

function fixtureResearch(): PartnershipResearch {
  return {
    researchedAt: new Date().toISOString(),
    needsVerification: [],
    citations: [],
    localLocations: [],
    researchSummary: 'fixture',
    companySummary: { value: 'x', status: 'inferred', source: 'test' },
    audienceFitRationale: { value: 'x', status: 'inferred', source: 'test' },
    creatorProgram: { value: null, status: 'unavailable', source: null },
    programBenefits: { value: null, status: 'unavailable', source: null },
    programRequirements: { value: null, status: 'unavailable', source: null },
    socialAccounts: { value: null, status: 'unavailable', source: null },
    recentCollaborations: { value: null, status: 'unavailable', source: null },
    retailerRelationships: { value: null, status: 'unavailable', source: null },
    localFilmingPotential: { value: null, status: 'unavailable', source: null },
    creatorContactPath: { value: null, status: 'unavailable', source: null },
    productsPricingHooks: { value: null, status: 'unavailable', source: null },
    organicBeforeApproval: { value: null, status: 'unavailable', source: null },
    storyAngleCandidates: [],
    nextActionInputs: [],
  };
}

describe('evaluatePartnershipEntityIdentity', () => {
  it('rejects Instagram shortcode Dbtacojzn1r as opaque_content_id', () => {
    const decision = evaluatePartnershipEntityIdentity({
      brandName: IG_SHORTCODE,
      submittedUrl: `https://www.instagram.com/p/${IG_SHORTCODE}/`,
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) {
      assert.equal(decision.reason, 'opaque_content_id');
      assert.equal(decision.brandName, IG_SHORTCODE);
    }
  });

  it('rejects editorial listicle titles', () => {
    const decision = evaluatePartnershipEntityIdentity({
      brandName: EDITORIAL_TITLE,
      pageTitle: EDITORIAL_TITLE,
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) {
      assert.equal(decision.reason, 'editorial_headline');
    }
  });

  it('rejects Best Places To Eat headlines as editorial', () => {
    const decision = evaluatePartnershipEntityIdentity({
      brandName: 'Best Places To Eat In Kansas City',
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) assert.equal(decision.reason, 'editorial_headline');
  });

  it('rejects transactional subjects as brand identity', () => {
    const decision = evaluatePartnershipEntityIdentity({
      brandName: TRANSACTIONAL_SUBJECT,
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) assert.equal(decision.reason, 'transactional_subject');
  });

  it('rejects Email address verification subjects', () => {
    const decision = evaluatePartnershipEntityIdentity({
      brandName: 'Email address verification',
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) assert.equal(decision.reason, 'transactional_subject');
  });

  it('rejects generic soft-context strings with no entity evidence', () => {
    const decision = evaluatePartnershipEntityIdentity({
      brandName: SOFT_CONTEXT,
      userMessage: SOFT_CONTEXT,
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) {
      assert.ok(
        decision.reason === 'placeholder_or_empty' || decision.reason === 'no_entity_evidence',
      );
    }
  });

  it('allows Loews', () => {
    const decision = evaluatePartnershipEntityIdentity({ brandName: 'Loews' });
    assert.equal(decision.ok, true);
    if (decision.ok) {
      assert.equal(decision.brandName, 'Loews');
      assert.ok(decision.evidence.includes('known_program_entity'));
    }
  });

  it('allows ShopMy when entity evidence says ShopMy', () => {
    const decision = evaluatePartnershipEntityIdentity({
      brandName: 'ShopMy',
      submittedUrl: 'https://shopmy.us/programs',
    });
    assert.equal(decision.ok, true);
    if (decision.ok) {
      assert.equal(decision.brandName, 'ShopMy');
      assert.ok(
        decision.evidence.includes('known_program_entity') ||
          decision.evidence.includes('url_host') ||
          decision.evidence.includes('url_brand_slug'),
      );
    }
  });

  it('allows SCHEELS', () => {
    const decision = evaluatePartnershipEntityIdentity({
      brandName: 'SCHEELS',
      submittedUrl: 'https://www.scheels.com/creator',
    });
    assert.equal(decision.ok, true);
    if (decision.ok) {
      assert.equal(decision.brandName, 'SCHEELS');
    }
  });

  it('allows operator-supplied legitimate brand', () => {
    const decision = evaluatePartnershipEntityIdentity({
      brandName: 'Northfield Supply Co',
      userMessage: 'brand: Northfield Supply Co',
      operatorSuppliedBrand: true,
    });
    assert.equal(decision.ok, true);
    if (decision.ok) {
      assert.equal(decision.brandName, 'Northfield Supply Co');
      assert.ok(decision.evidence.includes('operator_brand'));
    }
  });

  it('allows JSON-LD organization names with matching candidate', () => {
    const decision = evaluatePartnershipEntityIdentity({
      brandName: 'Half of Half',
      jsonLdOrganization: 'Half of Half',
    });
    assert.equal(decision.ok, true);
    if (decision.ok) assert.ok(decision.evidence.includes('jsonld_organization'));
  });

  it('does not infer a brand from an Instagram shortcode URL alone', () => {
    const names = inferNamesFromSubmission({
      url: `https://www.instagram.com/p/${IG_SHORTCODE}/`,
      pageTitle: null,
      userMessage: `https://www.instagram.com/p/${IG_SHORTCODE}/`,
    });
    assert.notEqual((names.brandName ?? '').toLowerCase(), IG_SHORTCODE.toLowerCase());
    const decision = evaluatePartnershipEntityIdentity({
      brandName: names.brandName,
      retailerName: names.retailerName,
      submittedUrl: `https://www.instagram.com/p/${IG_SHORTCODE}/`,
      userMessage: `https://www.instagram.com/p/${IG_SHORTCODE}/`,
    });
    assert.equal(decision.ok, false);
  });

  it('does not use editorial page titles as brandName', () => {
    const names = inferNamesFromSubmission({
      url: 'https://example.com/guides/summer',
      pageTitle: EDITORIAL_TITLE,
      userMessage: EDITORIAL_TITLE,
    });
    assert.notEqual(names.brandName, EDITORIAL_TITLE);
  });
});

describe('selectPartnershipIdentityForWrite', () => {
  it('keeps an existing valid brand when a later opaque candidate arrives', () => {
    const result = selectPartnershipIdentityForWrite({
      existingBrandName: 'Loews',
      brandName: IG_SHORTCODE,
      submittedUrl: `https://www.instagram.com/p/${IG_SHORTCODE}/`,
    });
    assert.equal(result.writeBrand, false);
    assert.equal(result.brandName, 'Loews');
    assert.equal(result.incomingRejected, 'opaque_content_id');
  });

  it('keeps an existing valid brand when a later editorial title arrives', () => {
    const result = selectPartnershipIdentityForWrite({
      existingBrandName: 'SCHEELS',
      brandName: EDITORIAL_TITLE,
      pageTitle: EDITORIAL_TITLE,
    });
    assert.equal(result.writeBrand, false);
    assert.equal(result.brandName, 'SCHEELS');
    assert.equal(result.incomingRejected, 'editorial_headline');
  });
});

describe('submitCreatorPartnership identity gate — postgres', () => {
  const partnershipIds: string[] = [];
  const contentItemIds: string[] = [];

  async function countBrand(name: string): Promise<number> {
    const rows = await db
      .select({ id: creatorPartnerships.id })
      .from(creatorPartnerships)
      .where(eq(creatorPartnerships.brandName, name));
    return rows.length;
  }

  before(async () => {
    assertSafeTestDatabase();
    const [existingCampaign] = await db.select({ id: campaigns.id }).from(campaigns).limit(1);
    assert.ok(existingCampaign, 'expected at least one campaign row');
  });

  after(async () => {
    if (partnershipIds.length > 0) {
      await db.delete(creatorPartnerships).where(inArray(creatorPartnerships.id, partnershipIds));
    }
    if (contentItemIds.length > 0) {
      await db.delete(contentItems).where(inArray(contentItems.id, contentItemIds));
    }
  });

  it('does not create a partnership for Instagram shortcode brand Dbtacojzn1r', async () => {
    const beforeCount = await countBrand(IG_SHORTCODE);
    await assert.rejects(
      () =>
        submitCreatorPartnership(
          { text: `brand: ${IG_SHORTCODE}`, sourceScreen: 'test_identity_gate' },
          { skipResearch: true },
        ),
      (err: unknown) => {
        assert.ok(err instanceof PartnershipIdentityRejectedError);
        assert.equal(err.reason, 'opaque_content_id');
        return true;
      },
    );
    assert.equal(await countBrand(IG_SHORTCODE), beforeCount);
  });

  it('does not create a partnership for editorial listicle titles', async () => {
    const beforeCount = await countBrand(EDITORIAL_TITLE);
    await assert.rejects(
      () =>
        submitCreatorPartnership(
          { text: `brand: ${EDITORIAL_TITLE}`, sourceScreen: 'test_identity_gate' },
          { skipResearch: true },
        ),
      (err: unknown) => {
        assert.ok(err instanceof PartnershipIdentityRejectedError);
        assert.equal(err.reason, 'editorial_headline');
        return true;
      },
    );
    assert.equal(await countBrand(EDITORIAL_TITLE), beforeCount);
  });

  it('does not create a partnership using a transactional subject as brand identity', async () => {
    const beforeCount = await countBrand(TRANSACTIONAL_SUBJECT);
    await assert.rejects(
      () =>
        submitCreatorPartnership(
          { text: `brand: ${TRANSACTIONAL_SUBJECT}`, sourceScreen: 'test_identity_gate' },
          { skipResearch: true },
        ),
      (err: unknown) => {
        assert.ok(err instanceof PartnershipIdentityRejectedError);
        assert.equal(err.reason, 'transactional_subject');
        return true;
      },
    );
    assert.equal(await countBrand(TRANSACTIONAL_SUBJECT), beforeCount);
  });

  it('does not create a partnership for Unrelated Soft Context Hotel without entity evidence', async () => {
    const beforeCount = await countBrand(SOFT_CONTEXT);
    await assert.rejects(
      () =>
        submitCreatorPartnership(
          { text: SOFT_CONTEXT, sourceScreen: 'test_identity_gate' },
          { skipResearch: true },
        ),
      (err: unknown) => {
        assert.ok(err instanceof PartnershipIdentityRejectedError);
        assert.ok(err.reason === 'placeholder_or_empty' || err.reason === 'no_entity_evidence');
        return true;
      },
    );
    assert.equal(await countBrand(SOFT_CONTEXT), beforeCount);
  });

  it('creates a partnership for Loews', async () => {
    const result = await submitCreatorPartnership(
      { text: 'Loews', sourceScreen: 'test_identity_gate' },
      { skipResearch: true },
    );
    assert.equal(result.duplicate, false);
    partnershipIds.push(result.partnershipId);
    contentItemIds.push(result.contentItemId);
    assert.equal(result.duplicate, false);
    const [row] = await db
      .select()
      .from(creatorPartnerships)
      .where(eq(creatorPartnerships.id, result.partnershipId))
      .limit(1);
    assert.equal(row?.brandName, 'Loews');
  });

  it('creates a partnership for ShopMy when entity evidence says ShopMy', async () => {
    const result = await submitCreatorPartnership(
      { text: 'ShopMy', sourceScreen: 'test_identity_gate' },
      { skipResearch: true },
    );
    assert.equal(result.duplicate, false);
    partnershipIds.push(result.partnershipId);
    contentItemIds.push(result.contentItemId);
    const [row] = await db
      .select()
      .from(creatorPartnerships)
      .where(eq(creatorPartnerships.id, result.partnershipId))
      .limit(1);
    assert.equal(row?.brandName, 'ShopMy');
  });

  it('creates a partnership for SCHEELS', async () => {
    const result = await submitCreatorPartnership(
      { text: 'SCHEELS', sourceScreen: 'test_identity_gate' },
      { skipResearch: true },
    );
    assert.equal(result.duplicate, false);
    partnershipIds.push(result.partnershipId);
    contentItemIds.push(result.contentItemId);
    const [row] = await db
      .select()
      .from(creatorPartnerships)
      .where(eq(creatorPartnerships.id, result.partnershipId))
      .limit(1);
    assert.equal(row?.brandName, 'SCHEELS');
  });

  it('creates a partnership for an operator-supplied legitimate brand', async () => {
    const result = await submitCreatorPartnership(
      { text: 'brand: Northfield Supply Co', sourceScreen: 'test_identity_gate' },
      { skipResearch: true },
    );
    assert.equal(result.duplicate, false);
    partnershipIds.push(result.partnershipId);
    contentItemIds.push(result.contentItemId);
    const [row] = await db
      .select()
      .from(creatorPartnerships)
      .where(eq(creatorPartnerships.id, result.partnershipId))
      .limit(1);
    assert.equal(row?.brandName, 'Northfield Supply Co');
  });

  it('does not overwrite an existing valid partnership when a later bad identity is submitted', async () => {
    const url = `https://loews-preserve-${Date.now()}.example/`;
    const created = await submitCreatorPartnership(
      { url, text: 'brand: Loews', sourceScreen: 'test_identity_gate' },
      { skipResearch: true },
    );
    assert.equal(created.duplicate, false);
    partnershipIds.push(created.partnershipId);
    contentItemIds.push(created.contentItemId);

    await db
      .update(creatorPartnerships)
      .set({
        pipelineStatus: 'qualified',
        fitScore: 55,
        researchStatus: 'complete',
      })
      .where(eq(creatorPartnerships.id, created.partnershipId));

    const duplicate = await submitCreatorPartnership(
      { url, text: `brand: ${IG_SHORTCODE}`, sourceScreen: 'test_identity_gate' },
      { skipResearch: true },
    );
    assert.equal(duplicate.duplicate, true);
    assert.equal(duplicate.partnershipId, created.partnershipId);

    const [row] = await db
      .select()
      .from(creatorPartnerships)
      .where(eq(creatorPartnerships.id, created.partnershipId))
      .limit(1);
    assert.equal(row?.brandName, 'Loews');
    assert.equal(row?.pipelineStatus, 'qualified');
    assert.equal(row?.fitScore, 55);
    assert.equal(row?.researchStatus, 'complete');
  });

  it('does not overwrite a valid brand when research later sees an editorial page title', async () => {
    const url = `https://loews-research-${Date.now()}.example/`;
    const created = await submitCreatorPartnership(
      { url, text: 'brand: Loews', sourceScreen: 'test_identity_gate' },
      { skipResearch: true },
    );
    assert.equal(created.duplicate, false);
    partnershipIds.push(created.partnershipId);
    contentItemIds.push(created.contentItemId);

    await db
      .update(creatorPartnerships)
      .set({
        pipelineStatus: 'qualified',
        fitScore: 55,
        researchStatus: 'queued',
        submittedText: `brand: ${EDITORIAL_TITLE}`,
      })
      .where(eq(creatorPartnerships.id, created.partnershipId));

    await runPartnershipResearch(created.partnershipId, {
      trigger: 'test',
      testPage: { title: EDITORIAL_TITLE, text: 'A summer listicle.' },
      testResearchFn: async () => fixtureResearch(),
    });

    const [row] = await db
      .select()
      .from(creatorPartnerships)
      .where(eq(creatorPartnerships.id, created.partnershipId))
      .limit(1);
    assert.equal(row?.brandName, 'Loews');
    assert.notEqual(row?.brandName, EDITORIAL_TITLE);

    const [item] = await db
      .select({ topic: contentItems.topic })
      .from(contentItems)
      .where(eq(contentItems.id, created.contentItemId))
      .limit(1);
    assert.notEqual(item?.topic, EDITORIAL_TITLE);
  });
});
