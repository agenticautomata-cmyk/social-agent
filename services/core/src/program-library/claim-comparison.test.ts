import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  evaluateOperatorResearchConsistency,
  isPercentInsideOperatorRange,
  parsePercentRange,
  unresolvedCompoundComponents,
} from './claim-comparison.js';
import {
  isAuthoritativeResearchedClaim,
  recomputeProgramLibraryClaimSemantics,
} from './claim-semantics.js';
import { operatorSuppliedClaim } from './metadata.js';
import type { ProgramLibraryPayload } from './types.js';

describe('claim comparison range semantics', () => {
  it('treats value inside operator range as consistent', () => {
    assert.equal(isPercentInsideOperatorRange('5–15%', '10%'), true);
    assert.equal(isPercentInsideOperatorRange('1–5%', '1%'), true);
    assert.equal(isPercentInsideOperatorRange('10–25% average', '12%'), true);
    assert.equal(evaluateOperatorResearchConsistency('5–15%', '10%').consistent, true);
    assert.equal(evaluateOperatorResearchConsistency('1–5%', '1%').consistent, true);
    assert.equal(evaluateOperatorResearchConsistency('10–25% average', '12%').consistent, true);
  });

  it('treats range boundary values as consistent', () => {
    assert.equal(isPercentInsideOperatorRange('5–15%', '5%'), true);
    assert.equal(isPercentInsideOperatorRange('5–15%', '15%'), true);
    assert.equal(isPercentInsideOperatorRange('1–5%', '5%'), true);
  });

  it('treats value outside operator range as conflict', () => {
    assert.equal(isPercentInsideOperatorRange('5–15%', '4%'), false);
    assert.equal(isPercentInsideOperatorRange('1–5%', '8%'), false);
    assert.equal(evaluateOperatorResearchConsistency('5%', '1%').consistent, false);
  });

  it('handles compound operator claims with partial percent match', () => {
    assert.equal(evaluateOperatorResearchConsistency('5% + $50', '5%').consistent, true);
    assert.deepEqual(unresolvedCompoundComponents('5% + $50', '5%'), ['$50']);
  });
});

describe('claim semantics recompute', () => {
  function basePayload(overrides: Partial<ProgramLibraryPayload>): ProgramLibraryPayload {
    return {
      programName: 'Test',
      brandName: 'Test',
      canonicalIdentity: 'test|test',
      programType: 'affiliate',
      scope: 'national',
      evidenceUrls: [],
      conflictingClaims: [],
      dateAdded: '2026-08-12T00:00:00.000Z',
      verificationDisplayState: 'conflicting_information',
      operatorSuppliedMasterList: true,
      ...overrides,
    };
  }

  it('clears false conflict when secondary value is inside operator range', () => {
    const payload = basePayload({
      brandName: 'thredUP',
      commissionBenefit: {
        value: '10%',
        authority: 'secondary_source',
        verificationState: 'conflicting_information',
        sourceUrl: 'https://taprefer.com/thredup',
      },
      conflictingClaims: [
        {
          field: 'commission/benefit',
          claims: [
            operatorSuppliedClaim('5–15%')!,
            {
              value: '10%',
              authority: 'secondary_source',
              verificationState: 'secondary_source',
              sourceUrl: 'https://taprefer.com/thredup',
            },
          ],
        },
      ],
    });
    const result = recomputeProgramLibraryClaimSemantics(
      payload,
      new Map([['https://taprefer.com/thredup', true]]),
    );
    assert.equal(result.payload.conflictingClaims.length, 0);
    assert.equal(result.payload.commissionBenefit?.value, '5–15%');
    assert.equal(result.payload.supportingEvidence?.commissionBenefit?.value, '10%');
    assert.equal(result.payload.verificationDisplayState, 'secondary_source_consistent');
  });

  it('retires failed official URL evidence from authoritative commission', () => {
    const payload = basePayload({
      brandName: 'The RealReal',
      commissionBenefit: {
        value: '1%',
        authority: 'official_brand',
        verificationState: 'conflicting_information',
        sourceUrl: 'https://www.therealreal.com/affiliates',
      },
      conflictingClaims: [
        {
          field: 'commission/benefit',
          claims: [
            operatorSuppliedClaim('5%')!,
            {
              value: '1%',
              authority: 'official_brand',
              verificationState: 'verified_official',
              sourceUrl: 'https://www.therealreal.com/affiliates',
            },
          ],
        },
      ],
    });
    const result = recomputeProgramLibraryClaimSemantics(
      payload,
      new Map([['https://www.therealreal.com/affiliates', false]]),
    );
    assert.equal(result.payload.commissionBenefit?.value, '5%');
    assert.equal(result.payload.conflictingClaims.length, 0);
    assert.equal(result.payload.supportingEvidence?.commissionBenefit?.value, '1%');
    assert.equal(result.payload.supportingEvidence?.commissionBenefit?.verificationState, 'needs_verification');
    assert.equal(result.payload.verificationDisplayState, 'operator_supplied');
    assert.equal(isAuthoritativeResearchedClaim(result.payload.supportingEvidence!.commissionBenefit!, false), false);
  });

  it('records partial unresolved component for compound operator claim', () => {
    const payload = basePayload({
      brandName: 'FASHIONPHILE',
      commissionBenefit: operatorSuppliedClaim('5% + $50'),
      conflictingClaims: [
        {
          field: 'commission/benefit',
          claims: [
            operatorSuppliedClaim('5% + $50')!,
            {
              value: '5%',
              authority: 'official_brand',
              verificationState: 'verified_official',
              sourceUrl: 'https://www.fashionphile.com/pages/influencer',
            },
          ],
        },
      ],
    });
    const result = recomputeProgramLibraryClaimSemantics(
      payload,
      new Map([['https://www.fashionphile.com/pages/influencer', true]]),
    );
    assert.equal(result.payload.conflictingClaims.length, 0);
    assert.equal(result.payload.commissionBenefit?.value, '5% + $50');
    assert.equal(result.payload.partialUnresolved?.[0]?.component, '$50');
    assert.equal(result.payload.verificationDisplayState, 'partial_unresolved');
  });
});

describe('percent range parser', () => {
  it('parses en-dash and hyphen ranges', () => {
    assert.deepEqual(parsePercentRange('5–15%'), { min: 5, max: 15, raw: '5–15%' });
    assert.deepEqual(parsePercentRange('10-25% average')?.min, 10);
    assert.deepEqual(parsePercentRange('10-25% average')?.max, 25);
  });
});
