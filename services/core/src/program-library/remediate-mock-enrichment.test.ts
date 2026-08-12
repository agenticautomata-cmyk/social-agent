import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { operatorSuppliedClaim } from './metadata.js';
import { remediateMockProgramLibraryEnrichment } from './remediate-mock-enrichment.js';
import { isProgramLibraryTestArtifact } from './test-artifacts.js';
import type { ProgramLibraryPayload } from './types.js';

function basePayload(overrides: Partial<ProgramLibraryPayload> = {}): ProgramLibraryPayload {
  return {
    programName: 'LTK',
    brandName: 'LTK',
    canonicalIdentity: 'ltk',
    programType: 'creator',
    scope: 'national',
    evidenceUrls: [],
    conflictingClaims: [],
    dateAdded: '2026-08-11T00:00:00.000Z',
    verificationDisplayState: 'operator_supplied',
    operatorSuppliedMasterList: true,
    ...overrides,
  };
}

describe('program library mock enrichment remediation', () => {
  it('restores operator commission and removes mock conflict for LTK-style contamination', () => {
    const operator = operatorSuppliedClaim('10–25% average')!;
    const result = remediateMockProgramLibraryEnrichment(
      basePayload({
        commissionBenefit: {
          value: '8%',
          authority: 'official_brand',
          sourceUrl: 'https://brand.example.com/affiliate',
          verificationState: 'conflicting_information',
          observedAt: '2026-08-11T23:17:26.592Z',
          verifiedAt: '2026-08-11T23:17:26.592Z',
        },
        evidenceUrls: ['https://brand.example.com/affiliate'],
        conflictingClaims: [
          {
            field: 'commission/benefit',
            claims: [
              operator,
              {
                value: '8%',
                authority: 'official_brand',
                sourceUrl: 'https://brand.example.com/affiliate',
                verificationState: 'verified_official',
                observedAt: '2026-08-11T23:17:26.592Z',
                verifiedAt: '2026-08-11T23:17:26.592Z',
              },
            ],
          },
        ],
        verificationDisplayState: 'conflicting_information',
        lastVerifiedAt: '2026-08-11T23:17:26.592Z',
      }),
    );

    assert.equal(result.changed, true);
    assert.equal(result.payload.commissionBenefit?.value, '10–25% average');
    assert.equal(result.payload.commissionBenefit?.authority, 'operator_supplied');
    assert.equal(result.payload.conflictingClaims.length, 0);
    assert.equal(result.payload.evidenceUrls.length, 0);
    assert.equal(result.payload.verificationDisplayState, 'operator_supplied');
    assert.equal(result.payload.lastVerifiedAt, null);
  });

  it('identifies documented test fixtures', () => {
    assert.equal(
      isProgramLibraryTestArtifact(
        { sourceScreen: 'auto_enrichment_test' },
        basePayload({ brandName: 'Anything', programName: 'Anything' }),
      ),
      true,
    );
    assert.equal(
      isProgramLibraryTestArtifact(
        { sourceScreen: 'program_library_seed' },
        basePayload({ brandName: 'AutoEnrich Smoke 123', programName: 'AutoEnrich Smoke 123' }),
      ),
      true,
    );
    assert.equal(
      isProgramLibraryTestArtifact(
        { sourceScreen: 'program_library_seed' },
        basePayload({ brandName: 'LTK', programName: 'LTK' }),
      ),
      false,
    );
  });
});
