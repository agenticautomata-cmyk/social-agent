import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildResearchedClaim,
  classifyEvidenceAuthority,
  isBrandOwnedHost,
  isSecondaryEvidenceHost,
  recomputeProgramLibraryEvidenceAuthority,
  verificationStateForAuthority,
} from './evidence-authority.js';
import { operatorSuppliedClaim, mergeFieldClaim } from './metadata.js';
import type { ProgramLibraryPayload } from './types.js';

describe('program library evidence authority', () => {
  it('classifies brand-owned domains as official_brand', () => {
    assert.equal(
      classifyEvidenceAuthority({
        url: 'https://www.fashionphile.com/pages/influencer',
        brandName: 'FASHIONPHILE',
      }),
      'official_brand',
    );
    assert.equal(
      classifyEvidenceAuthority({
        url: 'https://www.lmconnectkc.com/influencerwelcome',
        brandName: 'LM Connect KC',
      }),
      'official_brand',
    );
    assert.ok(isBrandOwnedHost('kcsmokeshop.com', 'Dream KC Smoke Shop'));
  });

  it('classifies legitimate affiliate network domains as affiliate_network', () => {
    assert.equal(
      classifyEvidenceAuthority({
        url: 'https://app.impact.com/campaign-promo-signup/KC-Chiefs.brand',
        brandName: 'KC Chiefs Pro Shop',
        affiliateNetwork: 'Impact',
      }),
      'affiliate_network',
    );
    assert.equal(
      classifyEvidenceAuthority({
        url: 'https://login.partnerize.com/',
        brandName: 'LEGOLAND Discovery Center Kansas City',
        affiliateNetwork: 'Partnerize',
      }),
      'affiliate_network',
    );
  });

  it('classifies aggregator directories as secondary_source', () => {
    for (const url of [
      'https://www.viglink.com/merchants/65309/kansas-city-chiefs-affiliate-program',
      'https://getlasso.co/affiliate/poshmark/',
      'https://favly.com/ltk-commission-rates',
      'https://taprefer.com/thredup-inc-affiliate-program/thredup-inc/',
      'https://www.affilitizer.com/programs/flexpromeals.com',
    ]) {
      assert.ok(isSecondaryEvidenceHost(new URL(url).hostname));
      assert.equal(
        classifyEvidenceAuthority({ url, brandName: 'Example Brand' }),
        'secondary_source',
      );
    }
  });

  it('never marks failed URL resolution as verified official', () => {
    assert.equal(
      verificationStateForAuthority('official_brand', false),
      'needs_verification',
    );
    assert.equal(
      verificationStateForAuthority('affiliate_network', false),
      'needs_verification',
    );
    const claim = buildResearchedClaim({
      value: '10%',
      url: 'https://www.kcwineroad.com/affiliate-program',
      brandName: 'KC Wine Road',
      urlResolved: false,
    });
    assert.equal(claim.authority, 'official_brand');
    assert.equal(claim.verificationState, 'needs_verification');
    assert.notEqual(claim.verificationState, 'verified_official');
  });

  it('preserves operator values and recomputes conflicts after authority downgrade', async () => {
    const payload: ProgramLibraryPayload = {
      programName: 'Poshmark',
      brandName: 'Poshmark',
      canonicalIdentity: 'poshmark|poshmark',
      programType: 'affiliate',
      scope: 'national',
      commissionBenefit: {
        value: '1%',
        authority: 'official_brand',
        verificationState: 'conflicting_information',
        sourceUrl: 'https://getlasso.co/affiliate/poshmark/',
      },
      conflictingClaims: [
        {
          field: 'commission/benefit',
          claims: [
            operatorSuppliedClaim('1–5%')!,
            {
              value: '1%',
              authority: 'official_brand',
              verificationState: 'verified_official',
              sourceUrl: 'https://getlasso.co/affiliate/poshmark/',
            },
          ],
        },
      ],
      officialProgramUrl: {
        value: 'https://getlasso.co/affiliate/poshmark/',
        authority: 'official_brand',
        verificationState: 'verified_official',
        sourceUrl: 'https://getlasso.co/affiliate/poshmark/',
      },
      evidenceUrls: ['https://getlasso.co/affiliate/poshmark/'],
      dateAdded: '2026-08-12T00:00:00.000Z',
      verificationDisplayState: 'conflicting_information',
      operatorSuppliedMasterList: true,
    };

    const resolutionMap = new Map<string, boolean>([
      ['https://getlasso.co/affiliate/poshmark/', false],
    ]);
    const result = await recomputeProgramLibraryEvidenceAuthority(payload, { resolutionMap });

    assert.equal(result.payload.commissionBenefit?.authority, 'operator_supplied');
    assert.equal(result.payload.commissionBenefit?.value, '1–5%');
    assert.equal(result.payload.commissionBenefit?.verificationState, 'operator_supplied');
    assert.equal(result.payload.supportingEvidence?.commissionBenefit?.authority, 'secondary_source');
    assert.equal(result.payload.supportingEvidence?.commissionBenefit?.value, '1%');
    assert.equal(result.payload.officialProgramUrl?.authority, 'secondary_source');
    assert.equal(result.payload.officialProgramUrl?.verificationState, 'secondary_source');
    assert.equal(result.payload.conflictingClaims.length, 0);
    assert.equal(result.payload.verificationDisplayState, 'secondary_source_consistent');
  });

  it('operator claim never inherits verified_official from merged research', () => {
    const conflicts: import('./types.js').ProgramLibraryConflict[] = [];
    const existing = operatorSuppliedClaim('10%')!;
    const incoming = buildResearchedClaim({
      value: '10%',
      url: 'https://www.kcwineroad.com/affiliate-program',
      brandName: 'KC Wine Road',
      urlResolved: false,
    });
    const merged = mergeFieldClaim({
      existing,
      incoming,
      field: 'commission/benefit',
      conflicts,
    });
    assert.equal(merged.claim?.verificationState, 'operator_supplied');
    assert.equal(merged.claim?.authority, 'operator_supplied');
  });

  it('recompute does not perform paid search', async () => {
    let fetchCalls = 0;
    const payload: ProgramLibraryPayload = {
      programName: 'LTK',
      brandName: 'LTK',
      canonicalIdentity: 'ltk|ltk',
      programType: 'creator',
      scope: 'national',
      commissionBenefit: operatorSuppliedClaim('10–25% average'),
      evidenceUrls: ['https://favly.com/ltk-commission-rates'],
      conflictingClaims: [],
      dateAdded: '2026-08-12T00:00:00.000Z',
      verificationDisplayState: 'operator_supplied',
      operatorSuppliedMasterList: true,
    };
    await recomputeProgramLibraryEvidenceAuthority(payload, {
      resolveFn: async () => {
        fetchCalls += 1;
        return true;
      },
    });
    assert.equal(fetchCalls, 1);
  });
});
