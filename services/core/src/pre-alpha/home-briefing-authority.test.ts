/**
 * Home briefing authority regression tests.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  reconcileLearningSummary,
  resolvePreferenceConflicts,
  selectHomeLearningBrief,
  statementsFromLearningInsights,
} from './home-preference-authority.js';
import {
  evaluateHomeCategoryGuard,
  isImplausibleDiningClassification,
  safeHomeReason,
} from './home-category-guard.js';
import { resolveHomePitchStatusLabel } from './home-pitch-ready.js';
import { canonicalHomeEntityKey, claimHomePlacement } from './home-placement.js';
import {
  buildCoherentHomeAnalytics,
  isUnexplainedCumulativeViewsDecline,
} from './home-analytics-coherence.js';
import {
  looksLikeRawScoutProse,
  shapeDiscoveryForHome,
} from './home-scout-surface.js';
import { buildWorthALook } from './home-worth-a-look.js';
import { classifyContentLanes, evaluateHomeShowroomGate } from './home-showroom-lanes.js';
import { inferContentFraming } from '../inventory/content-framing.js';
import type { InventoryFlags, InventoryItem } from '../inventory/normalize.js';

const baseFlags = (): InventoryFlags => ({
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
});

describe('home preference authority', () => {
  it('literary disinterest cannot be summarized as positive interest', () => {
    const statements = resolvePreferenceConflicts(
      statementsFromLearningInsights([
        {
          id: 'literary_event_preference',
          insight:
            "Your audience has consistently shown disinterest in literary events, with multiple 'less like this' votes.",
          action: 'Deprioritize literary events',
          confidence: 'high',
          durability: 'durable',
          materialChangeSinceLastShown: true,
        },
      ]),
    );
    const { summary } = reconcileLearningSummary({
      summary: 'Your audience is still hot interested in literary events and food content.',
      statements,
    });
    assert.doesNotMatch(summary, /interested in literary/i);
    assert.equal(statements[0]?.direction, 'avoid');
  });

  it('opposing preference statements cannot appear simultaneously', () => {
    const resolved = resolvePreferenceConflicts(
      statementsFromLearningInsights([
        {
          id: 'lit-avoid',
          insight: 'Audience showed disinterest in literary events',
          action: 'Deprioritize',
          confidence: 'high',
          durability: 'durable',
        },
        {
          id: 'lit-favor',
          insight: 'Audience is interested in literary events',
          action: 'Focus on literary',
          confidence: 'medium',
          durability: 'temporary',
        },
      ]),
    );
    assert.equal(resolved.length, 1);
    assert.equal(resolved[0]?.direction, 'avoid');
  });

  it('hides learning block when nothing material changed', () => {
    const brief = selectHomeLearningBrief({
      summary: 'Nothing new emerged from the latest signals. Your audience is still not interested in literary events.',
      insights: [
        {
          id: 'literary_event_preference',
          insight: 'Disinterest in literary events',
          action: 'Deprioritize',
          confidence: 'high',
          durability: 'durable',
          materialChangeSinceLastShown: false,
        },
      ],
    });
    assert.equal(brief.show, false);
  });
});

describe('home category guard', () => {
  it('law services cannot classify as dining/food', () => {
    assert.equal(
      isImplausibleDiningClassification({
        title: "Max Indiveri’s Funk House Law sees The Whips frontman launch legal services for creatives",
        category: 'restaurant_opening',
        reason: 'Dining or food opening — timely restaurant/cafe content.',
      }),
      true,
    );
    const guard = evaluateHomeCategoryGuard({
      title: 'Funk House Law launch',
      reason: 'Dining or food opening — timely restaurant/cafe content.',
    });
    assert.equal(guard.ok, false);
    assert.equal(guard.reasonCode, 'law_not_dining');
  });

  it('coffee-related article is not automatically a restaurant opening', () => {
    assert.equal(
      isImplausibleDiningClassification({
        title: 'Coffee & Death: Crows Coffee destigmatizes difficult conversations about earthly departures',
        category: 'coffee_opening',
        reason: 'Dining or food opening — timely restaurant/cafe content.',
      }),
      true,
    );
  });

  it('band interview / album touring story cannot classify as dining', () => {
    assert.equal(
      isImplausibleDiningClassification({
        title:
          "Train frontman Pat Monahan on the band’s new album, longevity, and touring ahead of Wednesday’s Morton show",
        category: 'dining',
        reason: 'Dining or food opening — timely restaurant/cafe content.',
      }),
      true,
    );
    const guard = evaluateHomeCategoryGuard({
      title:
        "Train frontman Pat Monahan on the band’s new album, longevity, and touring ahead of Wednesday’s Morton show",
      category: 'dining',
      reason: 'Dining or food opening — timely restaurant/cafe content.',
    });
    assert.equal(guard.ok, false);
    assert.equal(guard.reasonCode, 'entertainment_not_dining');
  });

  it('museum exhibition is not a hotel package', () => {
    const guard = evaluateHomeCategoryGuard({
      title: 'Current Exhibition: Fragile Figures: Beings and Time',
      category: 'hotel package',
      reason: 'Date-night or premium experience — couples/weekend plan content.',
      businessName: '21c Museum Hotel Kansas City',
    });
    assert.equal(guard.ok, false);
    assert.equal(guard.reasonCode, 'exhibition_not_hotel_package');
  });

  it('Savers thrift is not date-night framing', () => {
    const reason = safeHomeReason(
      {
        title: 'Savers',
        businessName: 'Savers',
        reason: 'Date-night or premium experience — couples/weekend plan content.',
      },
      'Shopping / thrift path.',
    );
    assert.doesNotMatch(reason, /date-night/i);
  });

  it('inferContentFraming refuses law/death subjects as dining_opening', () => {
    const flags = { ...baseFlags(), dining: true, businessOpening: true };
    assert.equal(
      inferContentFraming(flags, 'restaurant_opening', 'Funk House Law legal services'),
      'general',
    );
    assert.equal(
      inferContentFraming(flags, 'coffee_opening', 'Coffee & Death destigmatizes difficult conversations'),
      'general',
    );
  });
});

describe('home pitch ready authority', () => {
  it('Pitch Ready requires complete operational evidence', () => {
    const incomplete = resolveHomePitchStatusLabel({
      businessName: 'Savers',
      title: 'Savers',
      hasConcreteAngle: true,
      contactVerificationStatus: 'found_unverified',
      hasPersonalizedDraft: false,
    });
    assert.equal(incomplete.pitchReady, false);
    assert.notEqual(incomplete.label, 'Pitch ready');

    const ready = resolveHomePitchStatusLabel({
      businessName: 'Example Cafe',
      outreachPitchReadinessStatus: 'pitch_ready',
    });
    assert.equal(ready.pitchReady, true);
    assert.equal(ready.label, 'Pitch ready');
  });
});

describe('home placement dedupe', () => {
  it('same canonical entity cannot occupy Best Move and Money', () => {
    const claimed = new Set<string>();
    const key = canonicalHomeEntityKey({
      contentItemId: 'ee1c35a7-f1a4-4190-baa7-1148835c262a',
      businessName: 'Savers',
    });
    assert.equal(claimHomePlacement(claimed, key), true);
    assert.equal(claimHomePlacement(claimed, key), false);
  });
});

describe('home analytics coherence', () => {
  it('suppresses unexplained cumulative view declines', () => {
    assert.equal(
      isUnexplainedCumulativeViewsDecline(
        'Total views: 1,001,264, with a total views change of -140,673.',
      ),
      true,
    );
    const snap = buildCoherentHomeAnalytics({
      asOf: '2026-08-28T01:47:09.988Z',
      authoritativeFollowers: 6557,
      whatChanged: [
        'Total views: 1,001,264, with a total views change of -140,673.',
        'Followers grew by 5, now totaling 6,554.',
        'The video on Do Good Co. increased by 1,103 views, a 27.5% rise.',
      ],
      headline: 'Designer shopping hitting a sweet spot',
    });
    assert.equal(snap.followers, 6557);
    assert.ok(snap.anomaly);
    assert.equal(snap.changes.some((c) => /total views change of -/i.test(c)), false);
    assert.ok(snap.changes.length <= 3);
  });

  it('follower totals are identical across the same snapshot', () => {
    const snap = buildCoherentHomeAnalytics({
      asOf: '2026-08-28T01:47:09.988Z',
      authoritativeFollowers: 6557,
      progressSummary: 'Followers grew by 5, now totaling 6,554.',
      whatChanged: ['Followers grew by 5, now totaling 6,554.'],
    });
    assert.equal(snap.followers, 6557);
  });

  it('headline names the actual post when known', () => {
    const snap = buildCoherentHomeAnalytics({
      asOf: '2026-08-28T05:23:40.051Z',
      authoritativeFollowers: 6559,
      headline: 'Solid uptick for the designer shopping video.',
      whatChanged: [
        'Total views rose by 325 since last check.',
        "'Do Good Co.' video gained 235 views (4%) to reach 6,138.",
      ],
    });
    assert.match(snap.headline ?? '', /Do Good Co/);
    assert.match(snap.headline ?? '', /235/);
    assert.equal(snap.asOf, '2026-08-28T05:23:40.051Z');

    const snap2 = buildCoherentHomeAnalytics({
      asOf: '2026-08-28T15:03:45.124Z',
      authoritativeFollowers: 6570,
      headline: 'Views ticking up across the board.',
      whatChanged: [
        "Most views gained from 'Kansas City, this is designer shopping with a purpose' — up 249 to 7,151.",
        "'I came for the frozen treat' gained 26 views, now at 492.",
      ],
    });
    assert.match(snap2.headline ?? '', /designer shopping with a purpose/i);
    assert.match(snap2.headline ?? '', /249/);
  });
});

describe('home scout surface', () => {
  it('raw URLs, citations and search prose cannot render on Home', () => {
    const raw =
      'Kansas City casino concert: [Little River Band](https://www.bandsintown.com/a/28644-little-river-band?utm_source=openai)';
    assert.equal(looksLikeRawScoutProse(raw), true);
    const shaped = shapeDiscoveryForHome({
      createdAt: '2026-07-24T04:59:33.057Z',
      summary: raw,
      items: [],
      createdCount: 5,
      now: new Date('2026-08-28T03:00:00.000Z'),
    });
    assert.equal(shaped.surface, null);
    assert.equal(shaped.suppressedReason, 'stale_scout_batch');
  });

  it('month-old scouting cannot appear as current Home intelligence', () => {
    const shaped = shapeDiscoveryForHome({
      createdAt: '2026-07-24T04:59:33.057Z',
      summary: 'Clean local finds',
      items: [
        {
          contentItemId: '1',
          title: 'Local Market',
          location: 'KC',
          eventStartsAt: '2026-09-01T17:00:00.000Z',
          sourceUrl: 'https://example.com',
        },
      ],
      now: new Date('2026-08-28T03:00:00.000Z'),
    });
    assert.equal(shaped.surface, null);
  });
});

describe('worth a look', () => {
  it('Home Show can qualify for Worth a Look without Best Move/Pitch Ready forcing', () => {
    const item = {
      id: 'home-show-1',
      title: 'Kansas City Home Show',
      summary: 'Consumer home expo at the convention center',
      summaryRaw: 'Consumer home expo at the convention center',
      sourceName: 'KC Convention Center',
      sourceType: 'scrape',
      category: 'community_event',
      state: 'new',
      eventDate: '2026-09-12T15:00:00.000Z',
      eventEndDate: '2026-09-14T22:00:00.000Z',
      discoveredAt: '2026-08-20T12:00:00.000Z',
      createdAt: '2026-08-20T12:00:00.000Z',
      updatedAt: '2026-08-20T12:00:00.000Z',
      venue: 'Kansas City Convention Center',
      businessName: null,
      neighborhood: 'Downtown',
      address: null,
      locationName: 'Kansas City, MO',
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
      sourceUrl: 'https://example.com/home-show',
      audienceScore: 7,
      whyItMatters: 'Strong visual local content for Things To Do Weekly.',
      creatorValueStatus: 'creator_candidate',
      lifecycleStatus: 'upcoming',
      flags: { ...baseFlags(), freeEvent: true },
      badges: ['free'],
      metadata: {},
      ingest: 'scrape_listing',
      relevanceScore: null,
      urgencyScore: null,
      coverageFormat: null,
      suggestedCoverageFormat: null,
      firsthandVisited: false,
    } satisfies InventoryItem;

    const lanes = classifyContentLanes(item, new Date('2026-08-28T15:00:00.000Z'));
    assert.ok(lanes.includes('things_to_do_weekly'));
    assert.equal(lanes.includes('home_best_move'), false);
    assert.equal(evaluateHomeShowroomGate(item, new Date('2026-08-28T15:00:00.000Z')).eligible, false);

    const pitch = resolveHomePitchStatusLabel({
      businessName: item.title,
      title: item.title,
      hasConcreteAngle: false,
      contactVerificationStatus: 'missing',
      hasPersonalizedDraft: false,
    });
    assert.equal(pitch.pitchReady, false);

    const claimed = new Set<string>();
    claimHomePlacement(claimed, canonicalHomeEntityKey({ businessName: 'Savers' }));
    const cards = buildWorthALook({ inventory: [item], claimedKeys: claimed, limit: 3 });
    assert.equal(cards.length, 1, 'Home Show must produce exactly one Worth a Look card');
    const card = cards[0]!;
    assert.equal(card.title, 'Kansas City Home Show');
    assert.equal(card.bestUse, 'share');
    assert.match(card.reason, /Things To Do Weekly|visual local|Useful local/i);
    assert.match(card.whenWhere ?? '', /Sep\s*12/i);
    assert.equal(card.sourceUrl, 'https://example.com/home-show');
    assert.notEqual(card.bestUse, 'contact');
  });

  it('empty sections disappear instead of being filled with weak candidates', () => {
    const cards = buildWorthALook({ inventory: [], claimedKeys: new Set(), limit: 3 });
    assert.equal(cards.length, 0);
  });
});
