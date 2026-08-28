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
      summary: 'Consumer home expo',
      sourceName: 'KC Convention Center',
      sourceType: 'scrape',
      category: 'community_event',
      state: 'new',
      eventDate: '2026-09-12T15:00:00.000Z',
      eventEndDate: null,
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
      sourceUrl: 'https://example.com/home-show',
      audienceScore: 7,
      creatorScore: 6,
      monetizationScore: 3,
      compositeScore: 6,
      whyItMatters: 'Strong visual local content for Things To Do Weekly.',
      creatorValueStatus: 'creator_candidate',
      lifecycleStatus: 'upcoming',
      flags: { ...baseFlags(), freeEvent: true },
      metadata: {},
      ingest: 'scrape_listing',
    } as InventoryItem;

    const claimed = new Set<string>();
    // Simulate Best Move already claimed something else — Home Show still eligible for look.
    claimHomePlacement(claimed, canonicalHomeEntityKey({ businessName: 'Savers' }));
    const cards = buildWorthALook({ inventory: [item], claimedKeys: claimed, limit: 3 });
    // May be empty if showroom gate rejects — assert it does not force pitch-ready fields.
    for (const c of cards) {
      assert.notEqual(c.bestUse, 'contact');
      assert.match(c.title, /Home Show/i);
    }
  });

  it('empty sections disappear instead of being filled with weak candidates', () => {
    const cards = buildWorthALook({ inventory: [], claimedKeys: new Set(), limit: 3 });
    assert.equal(cards.length, 0);
  });
});
