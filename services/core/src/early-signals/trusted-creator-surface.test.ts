import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyTrustedCreatorSurfaceAuthority,
  hasQualifyingOfficialEvidence,
  mapCuratorVerificationForSignal,
} from './trusted-creator-surface.js';
import type { EarlySignalView } from './types.js';

function baseView(overrides: Partial<EarlySignalView> = {}): EarlySignalView {
  return {
    id: 'sig-djmaxx',
    signalType: 'curator_event_lead',
    title: 'Sounds by DJMaxx Guv',
    summary:
      'Sounds by DJMaxx Guv\nDate: 2026-08-09\nVenue: The Levee\nI couldn\'t locate an official event titled "Sounds by DJMaxx Guv".\nSource: trusted creator / secondary\nUnverified until official confirmation.',
    sourceUrl: 'https://www.instagram.com/p/example/',
    sourceName: 'Trusted creator · Discovered via @jasfoodjourney',
    sourceCategory: 'curator_watchlist',
    businessName: 'The Levee',
    address: null,
    city: 'Kansas City',
    regionState: 'MO',
    firstDetectedAt: '2026-08-08T12:00:00.000Z',
    lastCheckedAt: '2026-08-08T12:00:00.000Z',
    eventDate: '2026-08-09T17:00:00.000Z',
    confidenceLevel: 'high',
    confidenceScore: 60,
    confidenceExplanation: [],
    urgencyLevel: 'planning_lead',
    urgencyScore: 50,
    urgencyExplanation: [],
    verificationStatus: 'confirmed',
    state: 'needs_verification',
    linkedOpportunityId: null,
    clusterKey: null,
    contentRecommendation: null,
    evidence: [],
    missingVerification: ['Official organizer confirmation'],
    alertSentAt: null,
    metadata: {
      sourceKind: 'trusted_creator_secondary',
      sourceHonesty: 'trusted_creator_secondary_unverified',
      officialLinks: {
        organizer: null,
        venue: null,
        ticket: 'https://www.axs.com/events/1400493/rb-and-ribs-tickets',
      },
      normalizedData: {
        officialLinks: {
          organizer: null,
          venue: null,
          ticket: 'https://www.axs.com/events/1400493/rb-and-ribs-tickets',
        },
        sourceHonesty: 'trusted_creator_secondary_unverified',
        verificationStatus: 'VERIFIED',
      },
    },
    ...overrides,
  };
}

describe('trusted creator surface authority', () => {
  it('expires past one-off DJMaxx fixture and demotes CONFIRMED', () => {
    const now = new Date('2026-08-11T18:00:00.000Z');
    const result = applyTrustedCreatorSurfaceAuthority(baseView(), now);
    assert.equal(result.surfaceEligible, false);
    assert.equal(result.temporalState, 'expired');
    assert.equal(result.view.urgencyLevel, 'weak_signal');
    assert.notEqual(result.view.verificationStatus, 'confirmed');
    assert.equal(result.view.verificationStatus, 'unverified');
    assert.ok(['low', 'medium'].includes(result.view.confidenceLevel));
    assert.ok(result.demotions.includes('temporal_expired'));
    assert.ok(result.demotions.includes('trusted_creator_confirmation_demoted'));
  });

  it('does not treat ticket-only citation as qualifying official evidence', () => {
    assert.equal(hasQualifyingOfficialEvidence(baseView()), false);
  });

  it('keeps future trusted-creator event eligible when unverified', () => {
    const now = new Date('2026-08-11T18:00:00.000Z');
    const result = applyTrustedCreatorSurfaceAuthority(
      baseView({
        title: 'Future Patio Night',
        eventDate: '2026-08-20T17:00:00.000Z',
        summary:
          'Future Patio Night\nDate: 2026-08-20\nSource: trusted creator / secondary\nUnverified until official confirmation.',
        verificationStatus: 'unverified',
        confidenceLevel: 'low',
        urgencyLevel: 'planning_lead',
        metadata: {
          sourceKind: 'trusted_creator_secondary',
          sourceHonesty: 'trusted_creator_secondary_unverified',
          officialLinks: { organizer: null, venue: null, ticket: null },
          normalizedData: {
            officialLinks: { organizer: null, venue: null, ticket: null },
            sourceHonesty: 'trusted_creator_secondary_unverified',
          },
        },
      }),
      now,
    );
    assert.equal(result.surfaceEligible, true);
    assert.notEqual(result.temporalState, 'expired');
    assert.equal(result.view.urgencyLevel, 'planning_lead');
    assert.notEqual(result.view.verificationStatus, 'confirmed');
  });

  it('keeps recurring series eligible after one occurrence passes', () => {
    const now = new Date('2026-08-11T18:00:00.000Z');
    const result = applyTrustedCreatorSurfaceAuthority(
      baseView({
        title: 'Weekly Jazz at The Levee',
        summary:
          'Weekly Jazz at The Levee — recurring every Friday series. Official venue page lists ongoing dates.',
        eventDate: '2026-08-09T17:00:00.000Z',
        verificationStatus: 'partial',
        confidenceLevel: 'medium',
        metadata: {
          sourceKind: 'trusted_creator_secondary',
          officialLinks: { organizer: null, venue: 'https://www.theleveekansascity.com/calendar/' },
          normalizedData: {
            officialLinks: {
              organizer: null,
              venue: 'https://www.theleveekansascity.com/calendar/',
            },
          },
        },
      }),
      now,
    );
    assert.equal(result.surfaceEligible, true);
    assert.ok(result.demotions.includes('recurring_kept_despite_past_occurrence'));
  });

  it('maps promote verification without confirming failed official research', () => {
    const mapped = mapCuratorVerificationForSignal({
      verificationStatus: 'VERIFIED',
      officialOrganizerUrl: null,
      officialVenueUrl: null,
      researchSummaryText:
        'I couldn\'t locate an official event titled "Sounds by DJMaxx Guv" at The Levee.',
    });
    assert.equal(mapped.verificationStatus, 'partial');
    assert.notEqual(mapped.verificationStatus, 'confirmed');

    const ok = mapCuratorVerificationForSignal({
      verificationStatus: 'VERIFIED',
      officialOrganizerUrl: 'https://official.example/event',
      officialVenueUrl: null,
      researchSummaryText: 'Official organizer page confirms the event on Aug 20.',
    });
    assert.equal(ok.verificationStatus, 'confirmed');
    assert.equal(ok.confidenceLevel, 'high');
  });
});
