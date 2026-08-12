import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { enforceCreatorPlayVerification, buildSafeHook } from './creator-play-consistency.js';
import { buildVerificationContext } from './verification-context.js';
import type { CreatorPlay, PartnershipResearch } from './types.js';

function field(value: string | null, status: PartnershipResearch['companySummary']['status']) {
  return { value, status, source: 'test' };
}

function reklaimResearch(): PartnershipResearch {
  return {
    companySummary: field(
      'REKLAIM specializes in authenticated pre-owned luxury handbags and watches.',
      'inferred',
    ),
    audienceFitRationale: field('KC shoppers interested in accessible luxury may respond.', 'inferred'),
    creatorProgram: field('REKLAIM Conscious Collective creator program with commissions.', 'inferred'),
    programBenefits: field('Industry-leading commissions and product credits.', 'inferred'),
    programRequirements: field(null, 'needs_verification'),
    socialAccounts: field('@reklaim on Instagram', 'inferred'),
    recentCollaborations: field(null, 'unavailable'),
    retailerRelationships: field('REKLAIM is sold through Jared as a retail partner.', 'inferred'),
    localFilmingPotential: field(
      'Jared KC stores do not currently offer REKLAIM in-store inventory.',
      'needs_verification',
    ),
    creatorContactPath: field('Apply via Conscious Collective program page.', 'inferred'),
    productsPricingHooks: field('Authenticated pre-owned luxury handbags.', 'inferred'),
    organicBeforeApproval: field('Organic teaser may be possible before approval.', 'needs_verification'),
    needsVerification: ['NEEDS VERIFICATION: Kansas City store inventory for filming'],
    citations: [{ url: 'https://reklaim.com/pages/about', title: 'REKLAIM About' }],
    localLocations: [
      {
        name: 'Jared — Kansas City area',
        address: null,
        availability: 'unknown_call_first',
        notes: 'KC stores may not carry REKLAIM inventory in-store.',
        source: 'https://reklaim.com/pages/about',
      },
    ],
    researchSummary: 'REKLAIM x Jared partnership with Conscious Collective program.',
    researchedAt: new Date().toISOString(),
  };
}

function badPlay(): CreatorPlay {
  return {
    opportunitySummary: 'Shop REKLAIM at Jared in Kansas City today.',
    whyKellieShouldCare: 'KC shoppers can visit Jared in KC for REKLAIM bags.',
    recommendedStrategy: 'Film at a local Jared store in KC this week.',
    organicFirstVsPitchFirst: 'organic_first',
    organicFirstRationale: 'Go to Jared in KC and film immediately.',
    contentConcepts: [
      'Surprising local discovery angle for REKLAIM',
      'Shop REKLAIM at Jared in KC',
      'Try-on at your nearest KC Jared',
    ],
    openingHook: 'I did not know you could shop REKLAIM at Jared in KC — let me show you.',
    talkingPoints: ['Best Jared in KC', 'In-store REKLAIM selection', 'Drive to Jared today'],
    shotList: ['Hook on camera', 'Local store exterior', 'In-store handbag reveal'],
    bRollSuggestions: ['KC store signage', 'Shopping bags leaving Jared'],
    researchBeforeFilming: [],
    productsToFeature: ['REKLAIM handbags'],
    brandPositioningToPreserve: ['Authenticated pre-owned luxury'],
    potentialProblems: [],
    disclosureRequirements: ['Affiliate disclosure if applicable'],
    monetizationPaths: ['affiliate'],
    programLinks: ['https://reklaim.com/pages/about'],
    brandContactResearch: 'Conscious Collective application',
    partnershipPitch: 'I visited Jared in KC and filmed REKLAIM already.',
    followUpRecommendation: 'Post the KC store visit video tomorrow.',
    generatedAt: new Date().toISOString(),
  };
}

describe('creator play verification consistency', () => {
  it('buildSafeHook does not imply KC inventory when unverified', () => {
    const research = reklaimResearch();
    const context = buildVerificationContext(research, 'REKLAIM', 'Jared');
    const hook = buildSafeHook(context, research);
    assert.match(hook, /Jared/i);
    assert.match(hook, /REKLAIM/i);
    assert.doesNotMatch(hook, /\bin KC\b/i);
    assert.doesNotMatch(hook, /let me show you/i);
  });

  it('enforceCreatorPlayVerification removes KC inventory claims from downstream copy', () => {
    const research = reklaimResearch();
    const fixed = enforceCreatorPlayVerification(badPlay(), research, 'REKLAIM', 'Jared');

    const combined = JSON.stringify(fixed).toLowerCase();
    assert.doesNotMatch(combined, /shop reklaim at jared in kc/);
    assert.doesNotMatch(fixed.openingHook, /\bin kc\b.*let me show you/i);
    assert.doesNotMatch(fixed.openingHook, /shop reklaim at jared in kc/i);
    assert.ok(
      fixed.researchBeforeFilming.some((item) => /verify.*kansas city|verify.*kc/i.test(item)),
      'expected KC verification action',
    );
    assert.ok(!fixed.shotList.some((s) => /local store exterior/i.test(s)), 'store exterior removed');
    assert.match(fixed.openingHook, /didn't know|did not know/i);
  });

  it('allows verified brand/program facts without KC inventory confirmation', () => {
    const research = reklaimResearch();
    research.creatorProgram = field('Conscious Collective creator program', 'verified');
    research.retailerRelationships = field('Jared is an official REKLAIM retail partner.', 'verified');

    const fixed = enforceCreatorPlayVerification(
      {
        ...badPlay(),
        partnershipPitch:
          'Hi — I am interested in the Conscious Collective program for REKLAIM through Jared.',
        openingHook: buildSafeHook(buildVerificationContext(research, 'REKLAIM', 'Jared'), research),
      },
      research,
      'REKLAIM',
      'Jared',
    );

    assert.match(fixed.partnershipPitch, /Conscious Collective/i);
    assert.match(fixed.openingHook, /REKLAIM/i);
    assert.doesNotMatch(fixed.openingHook, /\bin kc\b/i);
  });
});
