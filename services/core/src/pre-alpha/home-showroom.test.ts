/**
 * Home creator showroom regressions — no paid web research.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { InventoryItem } from '../inventory/normalize.js';
import type { ActionCenterItem, ActionCenterResponse } from '../action-center/types.js';
import { resolveInboundActionability, isReplyActionable } from '../gmail-inbox/inbound-actionability.js';
import {
  classifyContentLanes,
  evaluateHomeShowroomGate,
  isGenericSponsorPlaceholder,
  isOrdinaryPublicEvent,
  qualifiesFilmThis,
  qualifiesThingsToDoWeekly,
} from './home-showroom-lanes.js';
import { buildHomeShowroom } from './home-showroom.js';
import type { HomeDailyBriefing, HomeOperationalMetrics, HomeRefreshSummary } from './operational-home.js';
import type { StudioPulse } from './studio-pulse.js';
import type { SponsorRecommendation } from '../sponsor-intelligence/recommendations.js';

function baseItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    title: 'Plato Closet Overland Park thrift haul',
    summary: 'Local consignment restock with filmable luxury resale angle',
    sourceName: 'Ask Benson',
    sourceType: 'manual',
    category: 'local_business',
    state: 'planned',
    eventDate: null,
    eventEndDate: null,
    discoveredAt: '2026-08-10T12:00:00.000Z',
    createdAt: '2026-08-10T12:00:00.000Z',
    updatedAt: '2026-08-10T12:00:00.000Z',
    venue: null,
    businessName: "Plato's Closet",
    neighborhood: 'Overland Park',
    address: null,
    locationName: 'Overland Park',
    locationStatus: 'resolved',
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
    sourceUrl: 'https://stores.platoscloset.com/op',
    ingest: 'ask_benson_link',
    flags: {
      sponsorFriendly: true,
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
      shopping: true,
      retail: true,
      vendorMarket: false,
      collector: false,
    },
    badges: [],
    audienceScore: 7,
    whyItMatters: 'Named local resale business — creator filming and sponsorship outreach potential.',
    metadata: { opportunityCategory: 'local_business', ingest: 'ask_benson_link' },
    relevanceScore: '0.7',
    urgencyScore: '0.4',
    coverageFormat: null,
    suggestedCoverageFormat: null,
    firsthandVisited: false,
    creatorValueStatus: 'creator_candidate',
    lifecycleStatus: 'active',
    ...overrides,
  } as InventoryItem;
}

function emptyActions(overrides: Partial<ActionCenterResponse> = {}): ActionCenterResponse {
  return {
    demoMode: true,
    generatedAt: new Date().toISOString(),
    sections: {
      pendingFollowUps: [],
      pendingSponsorEmails: [],
      contentWaitingForApproval: [],
      upcomingPlannedContent: [],
      sponsorOpportunitiesNeedingUpdates: [],
      tiktokOperatorMoves: [],
    },
    notifications: { overdue: [], dueToday: [], dueThisWeek: [] },
    priorities: { critical: [], important: [], suggested: [] },
    doNow: [],
    counts: { total: 0, overdue: 0, dueToday: 0 },
    ...overrides,
  };
}

function actionItem(partial: Partial<ActionCenterItem> & Pick<ActionCenterItem, 'id' | 'title'>): ActionCenterItem {
  return {
    section: 'pending_sponsor_emails',
    entityType: 'outreach',
    entityId: partial.id,
    subtitle: null,
    dueAt: null,
    dueBucket: 'none',
    priority: 'critical',
    actions: [],
    href: '/email/inbox',
    ...partial,
  };
}

const EMPTY_BRIEFING: HomeDailyBriefing = {
  topEvents: [],
  topSponsorOpportunities: [],
  topBusinessOpenings: [],
  highestPriority: [],
  askBensonToday: [],
};

const EMPTY_METRICS: HomeOperationalMetrics = {
  totalSources: 4,
  healthySources: 4,
  contentItems: 10,
  sponsorCandidates: 2,
  activePipelineDeals: 1,
  sponsorLeads: 1,
  activeDeals: 1,
  pendingOutreach: 0,
  connectedAccounts: 1,
};

const EMPTY_REFRESH: HomeRefreshSummary = {
  lastRefreshAt: '2026-08-11T12:00:00.000Z',
  itemsDiscovered: 14,
  healthySources: 4,
  failedSources: 0,
  newItemsSinceRefresh: 14,
};

const EMPTY_PULSE: StudioPulse = {
  pendingEmailApprovals: 62,
  pitchReadyCount: 1,
  researchingProspects: 2,
  unreadInboxReplies: 5,
  followerCount: 8200,
  followerTarget: 10_000,
  followerProgressPct: 82,
  followersToGo: 1800,
  milestoneReached: false,
  nearMilestone: true,
  topPendingApprovalHref: '/email/approvals',
  topSponsorPitchHref: '/email/approvals?id=demo',
  topSponsorPitchLabel: '21c Museum Hotels',
  outreachMode: 'simulate',
};

const QUIET_SYNC = {
  headline: 'Since your last sync',
  points: [
    {
      id: 'quiet',
      text: 'Nothing major changed since your last sync. Benson is still tracking the active pipeline.',
    },
  ],
  quiet: true,
  previousCheckpointAt: null as string | null,
};

function sponsorRec(partial: Partial<SponsorRecommendation> & Pick<SponsorRecommendation, 'contentItemId' | 'businessName'>): SponsorRecommendation {
  return {
    sponsorContactId: null,
    sponsorContactStatus: null,
    title: partial.businessName,
    category: 'hotel',
    sourceName: 'Ask Benson',
    sourceUrl: 'https://example.com',
    scores: {
      sponsorFit: 80,
      audienceFit: 70,
      revenuePotential: 60,
      confidence: 70,
      contactFirst: 75,
    },
    recommendedPitchAngle: 'Stay + film',
    whyBensonRecommends: 'Strong hotel collab path with follow-up due.',
    expectedAudienceFit: 'Travel/luxury',
    suggestedContentAngle: 'Hotel stay',
    suggestedSponsorshipAngle: 'Gifted stay',
    ...partial,
  };
}

describe('content-lane separation', () => {
  it('ordinary concert can qualify for Things To Do Weekly but not Film This/Home', () => {
    const concert = baseItem({
      id: 'concert-owen-pirch',
      title: 'Owen Pirch Live — music event at The Truman',
      summary: 'Live music concert downtown KC',
      businessName: null,
      eventDate: '2026-08-20T01:00:00.000Z',
      flags: {
        ...baseItem().flags,
        sponsorFriendly: false,
        shopping: false,
        retail: false,
        freeEvent: true,
      },
      whyItMatters: 'Popular local concert night.',
      audienceScore: 8,
      category: 'events',
    });
    const now = new Date('2026-08-10T12:00:00.000Z');
    assert.equal(isOrdinaryPublicEvent(concert), true);
    assert.equal(qualifiesThingsToDoWeekly(concert, now), true);
    assert.equal(qualifiesFilmThis(concert), false);
    assert.equal(evaluateHomeShowroomGate(concert).eligible, false);
    const lanes = classifyContentLanes(concert, now);
    assert.ok(lanes.includes('things_to_do_weekly'));
    assert.ok(!lanes.includes('film_this'));
    assert.ok(!lanes.includes('home_best_move'));
  });

  it('Fire-Rescue International / Laura Moriarty style events are not Home Best Move', () => {
    const fire = baseItem({
      id: 'fire-rescue',
      title: 'Fire-Rescue International 2026',
      summary: 'Convention and expo',
      businessName: null,
      eventDate: '2026-08-25T15:00:00.000Z',
      flags: { ...baseItem().flags, sponsorFriendly: false, shopping: false, retail: false },
      whyItMatters: 'Verify date before planning a visit.',
      audienceScore: 6,
    });
    const author = baseItem({
      id: 'laura',
      title: 'Laura Moriarty author event and book signing',
      summary: 'Author event at local library',
      businessName: null,
      eventDate: '2026-08-18T23:00:00.000Z',
      flags: { ...baseItem().flags, sponsorFriendly: false, shopping: false, retail: false },
      whyItMatters: 'Local author event.',
    });
    assert.equal(evaluateHomeShowroomGate(fire).eligible, false);
    assert.equal(evaluateHomeShowroomGate(author).eligible, false);
  });

  it('unrelated local-news/Pitch article does not reach Home', () => {
    const news = baseItem({
      id: 'pitch-news',
      title: 'City council debates surveillance ordinance',
      summary: 'Politics and public policy coverage from Pitch Weekly',
      sourceName: 'Pitch KC',
      ingest: 'pitch_dining_rss',
      businessName: null,
      flags: { ...baseItem().flags, sponsorFriendly: false, shopping: false, retail: false },
      whyItMatters: 'Local news mention of Kansas City.',
      audienceScore: 5,
      category: 'news',
    });
    assert.equal(evaluateHomeShowroomGate(news).eligible, false);
    assert.ok(classifyContentLanes(news).includes('source_intelligence_only'));
  });

  it('strong filmable creator-fit discovery can reach Home', () => {
    const gem = baseItem({
      id: 'hidden-gem',
      title: 'New luxury consignment boutique grand opening in Crossroads',
      summary: 'Hidden gem shopping opening with filmable store walkthrough',
      businessName: 'Velvet Archive',
      flags: {
        ...baseItem().flags,
        businessOpening: true,
        shopping: true,
        retail: true,
        sponsorFriendly: true,
      },
      whyItMatters: 'Luxury resale opening — strong filming and sponsor path.',
      audienceScore: 8,
      lifecycleStatus: 'active',
    });
    assert.equal(evaluateHomeShowroomGate(gem).eligible, true);
    assert.equal(qualifiesFilmThis(gem), true);
    assert.ok(classifyContentLanes(gem).includes('home_best_move'));
  });

  it('expired event cannot reach Home', () => {
    const expired = baseItem({
      id: 'expired-1',
      title: 'Vintage market popup',
      lifecycleStatus: 'expired',
      eventDate: '2026-07-01T18:00:00.000Z',
      whyItMatters: 'Luxury vintage market — great filming.',
    });
    assert.equal(evaluateHomeShowroomGate(expired).eligible, false);
    assert.ok(evaluateHomeShowroomGate(expired).reasons.includes('lifecycle_not_current'));
  });

  it('weak/unverified item cannot become Best Move', () => {
    const weak = baseItem({
      id: 'weak-1',
      title: 'Something happening somewhere',
      businessName: null,
      audienceScore: 2,
      flags: { ...baseItem().flags, sponsorFriendly: false, shopping: false, retail: false },
      whyItMatters: 'Verify date — planning lead only.',
      creatorValueStatus: 'creator_candidate',
    });
    assert.equal(evaluateHomeShowroomGate(weak).eligible, false);
  });

  it('generic shopping/retail sponsor placeholder excluded', () => {
    const placeholder = baseItem({
      id: 'placeholder',
      title: 'Shopping/retail discovery — deal haul, store opening, or gift-card sponsorship',
      businessName: null,
      whyItMatters: 'Shopping/retail discovery — deal haul, store opening, or gift-card sponsorship',
      flags: { ...baseItem().flags, shopping: true, retail: true, sponsorFriendly: true },
    });
    assert.equal(isGenericSponsorPlaceholder(placeholder), true);
    assert.equal(evaluateHomeShowroomGate(placeholder).eligible, false);
  });

  it('malformed CTA target excluded', () => {
    const bad = baseItem({
      id: 'x',
      title: 'Broken target sponsor',
      sourceUrl: null,
      businessName: null,
      eventDate: null,
      googleMapsUrl: null,
      googlePlaceId: null,
    });
    const gate = evaluateHomeShowroomGate(bad);
    assert.equal(gate.eligible, false);
    assert.ok(
      gate.reasons.includes('invalid_cta_target') || gate.reasons.includes('malformed_entity'),
    );
  });
});

describe('email on Home', () => {
  it('ShopMy accepted email is not Reply/Needs You', () => {
    const shopmy = resolveInboundActionability({
      subject: "You're in!",
      bodyText: 'Welcome to ShopMy — The ShopMy Team. Your application was accepted.',
      senderDomain: 'shopmy.us',
      matchKind: 'sponsors_inbox_pipeline',
      outreachEmailId: null,
    });
    assert.equal(isReplyActionable(shopmy.actionability), false);

    const showroom = buildHomeShowroom({
      inventory: [baseItem()],
      dailyBriefing: EMPTY_BRIEFING,
      topOpportunities: [],
      topSponsorCandidates: [],
      refresh: EMPTY_REFRESH,
      metrics: EMPTY_METRICS,
      studioPulse: EMPTY_PULSE,
      actions: emptyActions({
        doNow: [
          actionItem({
            id: 'shopmy-in',
            title: 'Reply: The ShopMy Team — You’re in!',
            subtitle: 'Unread email',
            href: '/email/inbox',
            meta: { actionability: shopmy.actionability },
          }),
        ],
      }),
      pipelineOpenDeals: 1,
      greeting: 'Good morning, Kellie',
      sinceLastSync: QUIET_SYNC,
    });
    assert.equal(showroom.needsYou.length, 0);
  });

  it('unread-only email does not enter Needs You', () => {
    const showroom = buildHomeShowroom({
      inventory: [],
      dailyBriefing: EMPTY_BRIEFING,
      topOpportunities: [],
      topSponsorCandidates: [],
      refresh: EMPTY_REFRESH,
      metrics: EMPTY_METRICS,
      studioPulse: EMPTY_PULSE,
      actions: emptyActions({
        doNow: [
          actionItem({
            id: 'unread-1',
            title: '5 unread emails in inbox',
            subtitle: 'Open inbox',
            href: '/email/inbox',
          }),
        ],
      }),
      pipelineOpenDeals: 0,
      greeting: 'Good morning, Kellie',
      sinceLastSync: QUIET_SYNC,
    });
    assert.equal(showroom.needsYou.length, 0);
  });
});

describe('showroom assembly rules', () => {
  it('bulk 62-approval housekeeping excluded from Home Needs You', () => {
    const showroom = buildHomeShowroom({
      inventory: [baseItem()],
      dailyBriefing: EMPTY_BRIEFING,
      topOpportunities: [],
      topSponsorCandidates: [],
      refresh: EMPTY_REFRESH,
      metrics: EMPTY_METRICS,
      studioPulse: EMPTY_PULSE,
      actions: emptyActions({
        priorities: {
          critical: [
            actionItem({
              id: 'bulk-pitches',
              title: '62 Benson pitches need approval',
              subtitle: 'Bulk outreach queue',
              href: '/email/approvals',
            }),
          ],
          important: [],
          suggested: [],
        },
        doNow: [
          actionItem({
            id: 'bulk-pitches-2',
            title: '62 pitches need approval',
            href: '/email/approvals',
          }),
        ],
      }),
      pipelineOpenDeals: 1,
      greeting: 'Good morning, Kellie',
      sinceLastSync: QUIET_SYNC,
    });
    assert.equal(showroom.needsYou.length, 0);
  });

  it('Home Needs You max 3 and Best Move max 1', () => {
    const strong = baseItem({ id: '00000000-0000-4000-8000-0000000000aa' });
    const showroom = buildHomeShowroom({
      inventory: [strong],
      dailyBriefing: {
        ...EMPTY_BRIEFING,
        highestPriority: [
          {
            id: strong.id,
            title: strong.title,
            whyItMatters: strong.whyItMatters,
            confidence: { level: 'high', score: 80, label: 'High' },
            audienceFit: { level: 'high', score: 80, label: 'High' },
            sponsorPotential: { level: 'high', score: 80, label: 'High' },
            sourceUrl: strong.sourceUrl,
            sourceName: strong.sourceName,
            category: strong.category,
          },
        ],
      },
      topOpportunities: [],
      topSponsorCandidates: [
        sponsorRec({ contentItemId: strong.id, businessName: "Plato's Closet" }),
      ],
      refresh: EMPTY_REFRESH,
      metrics: EMPTY_METRICS,
      studioPulse: EMPTY_PULSE,
      actions: emptyActions({
        doNow: [1, 2, 3, 4, 5].map((n) =>
          actionItem({
            id: `need-${n}`,
            title: `Choose between two sponsor terms #${n}`,
            subtitle: 'Operator decision required',
            href: `/pipeline?decision=${n}`,
            meta: { actionability: 'reply_required' },
          }),
        ),
      }),
      pipelineOpenDeals: 2,
      greeting: 'Good morning, Kellie',
      sinceLastSync: QUIET_SYNC,
    });
    assert.ok(showroom.bestMove === null || showroom.bestMove.id);
    // At most one best move object
    assert.ok(showroom.bestMove === null || typeof showroom.bestMove.id === 'string');
    assert.ok(showroom.needsYou.length <= 3);
    assert.equal(showroom.needsYou.length, 3);
  });

  it('valid genuine sponsor follow-up can still qualify with human copy', () => {
    const hotel = baseItem({
      id: '00000000-0000-4000-8000-000000000021',
      title: '21c Museum Hotels',
      businessName: '21c Museum Hotels',
      whyItMatters: 'Follow up with 21c Museum Hotels — strong travel collab path.',
      flags: { ...baseItem().flags, sponsorFriendly: true, luxury: true },
    });
    const showroom = buildHomeShowroom({
      inventory: [hotel],
      dailyBriefing: EMPTY_BRIEFING,
      topOpportunities: [],
      topSponsorCandidates: [
        sponsorRec({
          contentItemId: hotel.id,
          businessName: '21c Museum Hotels',
          whyBensonRecommends: 'Follow up with 21c Museum Hotels — reply window is open.',
        }),
      ],
      refresh: EMPTY_REFRESH,
      metrics: EMPTY_METRICS,
      studioPulse: EMPTY_PULSE,
      actions: emptyActions(),
      pipelineOpenDeals: 1,
      greeting: 'Good morning, Kellie',
      sinceLastSync: QUIET_SYNC,
    });
    assert.ok(showroom.bestMove);
    assert.match(showroom.bestMove!.title, /21c/i);
    assert.doesNotMatch(showroom.bestMove!.title, /ready_to_contact/i);
    assert.doesNotMatch(showroom.bestMove!.reason, /ready_to_contact/i);
  });

  it('Dismiss/Later persistence: skipped inventory ids never reappear across showroom sections', () => {
    const kept = baseItem({ id: '00000000-0000-4000-8000-0000000000bb' });
    const dismissed = baseItem({
      id: '00000000-0000-4000-8000-0000000000cc',
      title: 'Dismissed boutique opening',
      businessName: 'Gone Shop',
    });
    // loadIngestedInventoryItems already filters skips — Home must only see kept.
    const inventory = [kept];
    const showroom = buildHomeShowroom({
      inventory,
      dailyBriefing: {
        ...EMPTY_BRIEFING,
        highestPriority: [
          {
            id: dismissed.id,
            title: dismissed.title,
            whyItMatters: dismissed.whyItMatters,
            confidence: { level: 'high', score: 80, label: 'High' },
            audienceFit: { level: 'high', score: 80, label: 'High' },
            sponsorPotential: { level: 'high', score: 80, label: 'High' },
            sourceUrl: dismissed.sourceUrl,
            sourceName: dismissed.sourceName,
            category: dismissed.category,
          },
        ],
      },
      topOpportunities: [],
      topSponsorCandidates: [
        sponsorRec({ contentItemId: dismissed.id, businessName: 'Gone Shop' }),
        sponsorRec({ contentItemId: kept.id, businessName: "Plato's Closet" }),
      ],
      refresh: EMPTY_REFRESH,
      metrics: EMPTY_METRICS,
      studioPulse: EMPTY_PULSE,
      actions: emptyActions(),
      pipelineOpenDeals: 1,
      greeting: 'Good morning, Kellie',
      sinceLastSync: QUIET_SYNC,
    });
    const ids = [
      showroom.bestMove?.contentItemId,
      ...showroom.moneyOnTheTable.map((c) => c.contentItemId),
    ].filter(Boolean);
    assert.ok(!ids.includes(dismissed.id), 'dismissed id must not return under another Home section');
  });

  it('hero uses durable stats and showroom sections exist', () => {
    const showroom = buildHomeShowroom({
      inventory: [baseItem({ lifecycleStatus: 'expired', id: '00000000-0000-4000-8000-0000000000dd' }), baseItem()],
      dailyBriefing: EMPTY_BRIEFING,
      topOpportunities: [],
      topSponsorCandidates: [],
      refresh: EMPTY_REFRESH,
      metrics: EMPTY_METRICS,
      studioPulse: EMPTY_PULSE,
      actions: emptyActions(),
      pipelineOpenDeals: 1,
      greeting: 'Good morning, Kellie',
      sinceLastSync: QUIET_SYNC,
    });
    assert.match(showroom.hero.headline, /Benson worked/i);
    assert.ok(showroom.hero.stats.length >= 1);
    assert.ok(showroom.whatBensonHandled.length >= 1);
    assert.ok(showroom.creatorMomentum.length >= 1);
    assert.ok(showroom.creatorAnalytics.tiles.length >= 1);
    assert.ok(showroom.creatorAnalytics.followers);
    assert.equal(showroom.creatorAnalytics.followers!.count, 8200);
    assert.equal(showroom.creatorAnalytics.activeDeals, 1);
    assert.ok(showroom.sinceLastSync);
    assert.match(showroom.sinceLastSync.headline, /Since your last sync/i);
    assert.ok(showroom.businessSummary.length >= 1);
    assert.ok(showroom.businessSummary.length <= 5);
    // Analytics are not chore-list / unread clutter
    const summaryBlob = showroom.businessSummary.map((p) => p.text).join(' ').toLowerCase();
    assert.ok(!summaryBlob.includes('62'));
    assert.ok(!/unread email/.test(summaryBlob));
  });

  it('creator analytics use real follower progress and do not invent revenue', () => {
    const showroom = buildHomeShowroom({
      inventory: [baseItem()],
      dailyBriefing: EMPTY_BRIEFING,
      topOpportunities: [],
      topSponsorCandidates: [],
      refresh: EMPTY_REFRESH,
      metrics: EMPTY_METRICS,
      studioPulse: EMPTY_PULSE,
      actions: emptyActions(),
      pipelineOpenDeals: 4,
      greeting: 'Good morning, Kellie',
      revenueUsd: null,
      sinceLastSync: QUIET_SYNC,
    });
    const followersTile = showroom.creatorAnalytics.tiles.find((t) => t.id === 'analytics-followers');
    assert.ok(followersTile);
    assert.match(followersTile!.value, /8,?200/);
    assert.match(followersTile!.value, /10,?000/);
    assert.ok(followersTile!.sub?.includes('%'));
    assert.equal(showroom.creatorAnalytics.revenueUsd, null);
    assert.ok(!showroom.creatorAnalytics.tiles.some((t) => t.id === 'analytics-revenue'));
  });

  it('Watchlist brief lines sit beside video-growth copy instead of replacing it', () => {
    const showroom = buildHomeShowroom({
      inventory: [baseItem()],
      dailyBriefing: EMPTY_BRIEFING,
      topOpportunities: [],
      topSponsorCandidates: [],
      refresh: EMPTY_REFRESH,
      metrics: EMPTY_METRICS,
      studioPulse: EMPTY_PULSE,
      actions: emptyActions(),
      pipelineOpenDeals: 0,
      greeting: 'Good morning, Kellie',
      sinceLastSync: QUIET_SYNC,
      pulseBrief: {
        headline: 'Designer Closet +50 views',
        whatChanged: ['Your latest posts: Designer Closet +50 views'],
      },
      watchlistBriefLines: ['Watchlist checked 4 sources.', 'New from @boonetheater: Ghostface after party'],
    });
    assert.match(showroom.todaysBrief.headline ?? '', /Designer Closet \+50/);
    assert.ok(showroom.todaysBrief.changes.some((line) => /Watchlist checked 4/.test(line)));
    assert.ok(showroom.todaysBrief.changes.some((line) => /Designer Closet \+50/.test(line)));
  });
});
