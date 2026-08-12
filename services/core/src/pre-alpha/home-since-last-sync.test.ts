import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { InventoryItem } from '../inventory/normalize.js';
import {
  buildCurrentHomeSyncSnapshot,
  computeSinceLastSyncDeltas,
  type HomeOperatorSyncSnapshot,
} from './home-since-last-sync.js';
import type { StudioPulse } from './studio-pulse.js';

const pulse: StudioPulse = {
  pendingEmailApprovals: 0,
  pitchReadyCount: 1,
  researchingProspects: 1,
  unreadInboxReplies: 0,
  followerCount: 6222,
  followerTarget: 10_000,
  followerProgressPct: 62,
  followersToGo: 3778,
  milestoneReached: false,
  nearMilestone: false,
  topPendingApprovalHref: null,
  topSponsorPitchHref: '/email/approvals?id=x',
  topSponsorPitchLabel: 'Raphael Hotel',
  outreachMode: 'simulate',
};

function item(partial: Partial<InventoryItem> & Pick<InventoryItem, 'id' | 'title'>): InventoryItem {
  return {
    summary: '',
    sourceName: 'test',
    sourceType: 'manual',
    category: 'local_business',
    state: 'planned',
    eventDate: null,
    eventEndDate: null,
    discoveredAt: '2026-08-12T12:00:00.000Z',
    createdAt: '2026-08-12T12:00:00.000Z',
    updatedAt: '2026-08-12T12:00:00.000Z',
    venue: null,
    businessName: null,
    neighborhood: null,
    address: null,
    locationName: null,
    locationStatus: null,
    formattedAddress: null,
    locationLat: null,
    locationLng: null,
    googlePlaceId: null,
    googleMapsUrl: null,
    locationWebsiteUrl: null,
    locationConfidence: null,
    locationSource: null,
    locationVerifiedAt: null,
    locationResolutionError: null,
    sourceUrl: 'https://example.com',
    ingest: 'test',
    flags: {
      sponsorFriendly: false,
      luxury: false,
      dining: false,
      dateNight: false,
      estateSale: false,
      businessOpening: false,
      freeEvent: false,
      celebrityCharity: false,
      sports: false,
      reddit: false,
      worldCup: false,
      shopping: false,
      retail: false,
      vendorMarket: false,
      collector: false,
    },
    badges: [],
    audienceScore: 5,
    whyItMatters: 'test',
    metadata: {},
    relevanceScore: '0.5',
    urgencyScore: '0.5',
    coverageFormat: null,
    suggestedCoverageFormat: null,
    firsthandVisited: false,
    creatorValueStatus: 'creator_candidate',
    lifecycleStatus: 'active',
    ...partial,
  } as InventoryItem;
}

describe('since last sync deltas', () => {
  it('first checkpoint (no previous) is quiet — does not invent past changes', () => {
    const current = buildCurrentHomeSyncSnapshot({
      studioPulse: pulse,
      pipelineOpenDeals: 4,
      sponsorCandidates: 8,
      topSponsorCandidates: [],
    });
    const result = computeSinceLastSyncDeltas({
      previous: null,
      current,
      inventory: [item({ id: 'a', title: 'New thing', discoveredAt: '2026-08-12T18:00:00.000Z' })],
    });
    assert.equal(result.quiet, true);
    assert.match(result.headline, /Since your last sync/i);
    assert.match(result.points[0]!.text, /Nothing major changed/i);
  });

  it('real state change appears once; unchanged KPI does not masquerade as a delta', () => {
    const previous: HomeOperatorSyncSnapshot = {
      capturedAt: '2026-08-12T10:00:00.000Z',
      followerCount: 6222,
      followersToGo: 3778,
      openDeals: 4,
      sponsorCandidates: 5,
      pitchReadyCount: 0,
      pitchReadyLabel: null,
      researchingProspects: 1,
      topSponsorNames: ['Old Co'],
    };
    const current: HomeOperatorSyncSnapshot = {
      ...previous,
      capturedAt: '2026-08-12T15:00:00.000Z',
      pitchReadyCount: 1,
      pitchReadyLabel: 'Raphael Hotel',
      topSponsorNames: ['Old Co', 'Raphael Hotel'],
      // openDeals unchanged — must not appear
      openDeals: 4,
      followerCount: 6222,
    };
    const result = computeSinceLastSyncDeltas({
      previous,
      current,
      inventory: [
        item({
          id: 'new-1',
          title: 'Boutique opening',
          discoveredAt: '2026-08-12T14:00:00.000Z',
        }),
        item({
          id: 'exp-1',
          title: 'Stale concert',
          lifecycleStatus: 'expired',
          updatedAt: '2026-08-12T13:00:00.000Z',
          discoveredAt: '2026-08-01T12:00:00.000Z',
        }),
      ],
      shopMyAcceptedSince: true,
    });
    assert.equal(result.quiet, false);
    const blob = result.points.map((p) => p.text).join('\n');
    assert.match(blob, /ShopMy accepted/i);
    assert.match(blob, /1 new opportunity was screened|new opportunit/i);
    assert.match(blob, /expired automatically/i);
    assert.match(blob, /sponsor path/i);
    assert.match(blob, /pitch-ready/i);
    assert.doesNotMatch(blob, /4 active deal/i);
    assert.ok(result.points.length <= 5);
  });

  it('refresh with identical snapshot yields quiet (no duplicate reannounce)', () => {
    const snap: HomeOperatorSyncSnapshot = {
      capturedAt: '2026-08-12T10:00:00.000Z',
      followerCount: 6222,
      followersToGo: 3778,
      openDeals: 4,
      sponsorCandidates: 8,
      pitchReadyCount: 1,
      pitchReadyLabel: 'Raphael Hotel',
      researchingProspects: 2,
      topSponsorNames: ['Raphael Hotel'],
    };
    const again = computeSinceLastSyncDeltas({
      previous: snap,
      current: { ...snap, capturedAt: '2026-08-12T15:00:00.000Z' },
      inventory: [
        item({
          id: 'old',
          title: 'Already known',
          discoveredAt: '2026-08-10T12:00:00.000Z',
          updatedAt: '2026-08-10T12:00:00.000Z',
        }),
      ],
    });
    assert.equal(again.quiet, true);
    assert.match(again.points[0]!.text, /Nothing major changed/i);
  });

  it('stale-event expiration appears as Benson-handled work', () => {
    const previous: HomeOperatorSyncSnapshot = {
      capturedAt: '2026-08-12T10:00:00.000Z',
      followerCount: null,
      followersToGo: null,
      openDeals: 0,
      sponsorCandidates: 0,
      pitchReadyCount: 0,
      pitchReadyLabel: null,
      researchingProspects: 0,
      topSponsorNames: [],
    };
    const result = computeSinceLastSyncDeltas({
      previous,
      current: { ...previous, capturedAt: '2026-08-12T16:00:00.000Z' },
      inventory: [
        item({
          id: 'e1',
          title: 'Expired fest',
          lifecycleStatus: 'expired',
          updatedAt: '2026-08-12T12:00:00.000Z',
        }),
        item({
          id: 'e2',
          title: 'Expired 2',
          lifecycleStatus: 'expired',
          updatedAt: '2026-08-12T12:30:00.000Z',
        }),
      ],
    });
    assert.match(result.points.map((p) => p.text).join(' '), /2 stale opportunities expired/i);
  });
});
