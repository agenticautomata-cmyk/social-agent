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
  areSnapshotsCompatible,
  buildLatestVideoGrowth,
  buildLatestVideoGrowthFromSnapshots,
  formatFollowerGrowthLine,
  formatVideoGrowthLine,
  pickCompatibleSnapshotPair,
  selectLatestPublishedVideo,
  type GrowthAccountSnapshot,
  type GrowthVideoSnapshot,
} from './home-video-growth.js';
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

  it('cannot display account-wide view growth as a named video’s growth', () => {
    const snap = buildCoherentHomeAnalytics({
      asOf: '2026-08-28T17:00:00.000Z',
      authoritativeFollowers: 6572,
      headline: 'Kansas City, this is designer shopping with a purpose',
      whatChanged: [
        'Total views increased by 220.',
        'Followers grew by 2, now totaling 6,572.',
      ],
    });
    assert.match(snap.headline ?? '', /designer shopping with a purpose/i);
    assert.doesNotMatch(snap.headline ?? '', /220/);
    assert.equal(snap.changes.some((c) => /total views increased by 220/i.test(c)), false);
    assert.equal(snap.changes.some((c) => /220/.test(c)), false);
  });
});

describe('home per-video growth briefing', () => {
  const designer: GrowthVideoSnapshot = {
    videoId: 'vid-designer',
    title: 'Kansas City, this is designer shopping with a purpose',
    views: 7151,
    publishedAt: '2026-08-27T18:00:00.000Z',
  };
  const frozen: GrowthVideoSnapshot = {
    videoId: 'vid-frozen',
    title: 'I came for the frozen treat',
    views: 492,
    publishedAt: '2026-08-20T12:00:00.000Z',
  };
  const doGood: GrowthVideoSnapshot = {
    videoId: 'vid-dogood',
    title: 'Do Good Co.',
    views: 6138,
    publishedAt: '2026-08-15T12:00:00.000Z',
  };

  function account(partial: Partial<GrowthAccountSnapshot> & { recentVideos: GrowthVideoSnapshot[] }): GrowthAccountSnapshot {
    return {
      capturedAt: partial.capturedAt ?? '2026-08-28T16:00:00.000Z',
      followers: partial.followers ?? 6572,
      totalViews: partial.totalViews ?? 1_001_484,
      totalVideos: partial.totalVideos ?? 200,
      recentVideos: partial.recentVideos,
      successful: partial.successful,
    };
  }

  it('names the same video ID used for the view delta', () => {
    const previous = account({
      capturedAt: '2026-08-28T10:00:00.000Z',
      followers: 6570,
      totalViews: 1_001_264,
      recentVideos: [
        { ...designer, views: 7101 },
        { ...frozen, views: 466 },
        { ...doGood, views: 6138 },
      ],
    });
    const current = account({
      capturedAt: '2026-08-28T16:00:00.000Z',
      followers: 6572,
      totalViews: 1_001_484,
      recentVideos: [designer, { ...frozen, views: 492 }, doGood],
    });
    const growth = buildLatestVideoGrowth({
      current,
      previous,
      authoritativeFollowers: 6572,
    });
    assert.equal(growth.videoId, 'vid-designer');
    assert.equal(growth.viewDelta, 50);
    assert.match(growth.headline ?? '', /designer shopping with a purpose/i);
    assert.match(growth.headline ?? '', /50/);
    assert.doesNotMatch(growth.headline ?? '', /220/);
    assert.equal(growth.videoId, designer.videoId);
  });

  it('picks latest video by publication time, not the largest view gain', () => {
    const previous = account({
      capturedAt: '2026-08-28T10:00:00.000Z',
      followers: 6570,
      recentVideos: [
        { ...designer, views: 7101 },
        { ...frozen, views: 200 },
        { ...doGood, views: 5000 },
      ],
    });
    const current = account({
      capturedAt: '2026-08-28T16:00:00.000Z',
      followers: 6572,
      recentVideos: [
        { ...frozen, views: 492 },
        { ...doGood, views: 6138 },
        designer,
      ],
    });
    const latest = selectLatestPublishedVideo(current.recentVideos);
    assert.equal(latest?.videoId, 'vid-designer');
    assert.ok(new Date(latest!.publishedAt) > new Date(frozen.publishedAt));
    assert.ok(new Date(doGood.publishedAt) < new Date(designer.publishedAt));

    const growth = buildLatestVideoGrowth({ current, previous, authoritativeFollowers: 6572 });
    assert.equal(growth.videoId, 'vid-designer');
    assert.equal(growth.viewDelta, 50);
    assert.notEqual(growth.videoId, 'vid-dogood');
    assert.notEqual(growth.viewDelta, 1138);
  });

  it('view delta equals current views minus that video’s previous views', () => {
    const previous = account({
      capturedAt: '2026-08-28T10:00:00.000Z',
      followers: 6570,
      recentVideos: [{ ...designer, views: 6900 }, frozen],
    });
    const current = account({
      capturedAt: '2026-08-28T16:00:00.000Z',
      followers: 6572,
      recentVideos: [{ ...designer, views: 7151 }, frozen],
    });
    const growth = buildLatestVideoGrowth({ current, previous, authoritativeFollowers: 6572 });
    assert.equal(growth.currentViews, 7151);
    assert.equal(growth.previousViews, 6900);
    assert.equal(growth.viewDelta, 7151 - 6900);
    assert.equal(
      growth.headline,
      formatVideoGrowthLine({ title: designer.title, viewDelta: 251, firstTracked: false }),
    );
  });

  it('follower growth uses the same comparison window as the video', () => {
    const previous = account({
      capturedAt: '2026-08-28T09:15:00.000Z',
      followers: 6567,
      recentVideos: [{ ...designer, views: 7000 }],
    });
    const current = account({
      capturedAt: '2026-08-28T16:45:00.000Z',
      followers: 6572,
      recentVideos: [{ ...designer, views: 7151 }],
    });
    const growth = buildLatestVideoGrowth({ current, previous, authoritativeFollowers: 6572 });
    assert.equal(growth.comparisonInterval?.from, previous.capturedAt);
    assert.equal(growth.comparisonInterval?.to, current.capturedAt);
    assert.equal(growth.followerDelta, 5);
    assert.ok(growth.lines.includes(formatFollowerGrowthLine(5, 6572)));
    assert.match(growth.headline ?? '', /since the last check/i);
  });

  it('uses singular follower wording for a gain of one', () => {
    assert.equal(
      formatFollowerGrowthLine(1, 6572),
      'You gained 1 follower, bringing the total to 6,572.',
    );
    assert.match(formatFollowerGrowthLine(2, 6572), /2 followers/);
  });

  it('labels a newly discovered video Since first tracked', () => {
    const previous = account({
      capturedAt: '2026-08-28T10:00:00.000Z',
      followers: 6570,
      recentVideos: [frozen, doGood],
    });
    const current = account({
      capturedAt: '2026-08-28T16:00:00.000Z',
      followers: 6572,
      recentVideos: [designer, frozen, doGood],
    });
    const growth = buildLatestVideoGrowth({ current, previous, authoritativeFollowers: 6572 });
    assert.equal(growth.firstTracked, true);
    assert.equal(growth.videoId, 'vid-designer');
    assert.equal(growth.viewDelta, 7151);
    assert.equal(growth.previousViews, null);
    assert.match(growth.headline ?? '', /Since first tracked/);
    assert.doesNotMatch(growth.headline ?? '', /since the last check/i);
  });

  it('cannot treat account-wide total-view growth as the named video’s gain', () => {
    const previous = account({
      capturedAt: '2026-08-28T10:00:00.000Z',
      followers: 6570,
      totalViews: 1_001_264,
      recentVideos: [
        { ...designer, views: 7101 },
        { ...frozen, views: 466 },
        { ...doGood, views: 5900 },
      ],
    });
    const current = account({
      capturedAt: '2026-08-28T16:00:00.000Z',
      followers: 6572,
      totalViews: 1_001_484, // +220 account-wide
      recentVideos: [
        designer, // +50
        { ...frozen, views: 492 },
        { ...doGood, views: 6138 },
      ],
    });
    const growth = buildLatestVideoGrowth({ current, previous, authoritativeFollowers: 6572 });
    assert.equal(current.totalViews - previous.totalViews, 220);
    assert.equal(growth.viewDelta, 50);
    assert.notEqual(growth.viewDelta, 220);
    const coherent = buildCoherentHomeAnalytics({
      asOf: current.capturedAt,
      authoritativeFollowers: 6572,
      headline: designer.title,
      whatChanged: ['Total views increased by 220.'],
      videoGrowth: growth,
    });
    assert.match(coherent.headline ?? '', /50/);
    assert.doesNotMatch(coherent.headline ?? '', /220/);
    assert.equal(coherent.latestVideoId, 'vid-designer');
    assert.equal(coherent.changes.some((c) => /220/.test(c)), false);
    const withGptOtherVideo = buildCoherentHomeAnalytics({
      asOf: current.capturedAt,
      authoritativeFollowers: 6572,
      whatChanged: [
        'Total views increased by 220.',
        'Your weekend events guide video went from 359 to 367 views.',
      ],
      videoGrowth: growth,
    });
    assert.equal(withGptOtherVideo.changes.some((c) => /220|went from 359/i.test(c)), false);
    assert.match(withGptOtherVideo.headline ?? '', /50/);
    assert.equal(coherent.comparisonInterval?.from, previous.capturedAt);
    assert.equal(coherent.comparisonInterval?.to, current.capturedAt);
  });

  it('omits invented deltas when snapshots are missing or incompatible', () => {
    const missing = buildLatestVideoGrowth({
      current: null,
      previous: null,
      authoritativeFollowers: 6572,
    });
    assert.equal(missing.viewDelta, null);
    assert.equal(missing.followerDelta, null);
    assert.equal(missing.headline, null);
    assert.equal(missing.lines.length, 0);

    const onlyCurrent = buildLatestVideoGrowth({
      current: account({ recentVideos: [designer] }),
      previous: null,
      authoritativeFollowers: 6572,
    });
    assert.equal(onlyCurrent.viewDelta, null);
    assert.equal(onlyCurrent.firstTracked, false);
    assert.doesNotMatch(onlyCurrent.headline ?? '', /gained/);
    assert.doesNotMatch(onlyCurrent.headline ?? '', /7151/);

    const incompatiblePrev = account({
      capturedAt: '2026-08-27T10:00:00.000Z',
      followers: 6570,
      totalViews: 1_141_937,
      totalVideos: 211,
      recentVideos: [
        { videoId: 'old-a', title: 'Old A', views: 100, publishedAt: '2026-01-01T00:00:00.000Z' },
        { videoId: 'old-b', title: 'Old B', views: 100, publishedAt: '2026-01-02T00:00:00.000Z' },
        { videoId: 'old-c', title: 'Old C', views: 100, publishedAt: '2026-01-03T00:00:00.000Z' },
      ],
    });
    const current = account({
      capturedAt: '2026-08-28T16:00:00.000Z',
      followers: 6572,
      totalViews: 1_001_264,
      recentVideos: [designer, frozen, doGood],
    });
    assert.equal(areSnapshotsCompatible(current, incompatiblePrev).ok, false);
    const growth = buildLatestVideoGrowth({
      current,
      previous: incompatiblePrev,
      authoritativeFollowers: 6572,
    });
    assert.equal(growth.viewDelta, null);
    assert.equal(growth.followerDelta, null);
    assert.equal(growth.compatible, false);
    assert.doesNotMatch(growth.headline ?? '', /gained/);

    const pair = pickCompatibleSnapshotPair([current, incompatiblePrev]);
    assert.equal(pair.current?.capturedAt, current.capturedAt);
    assert.equal(pair.previous, null);

    const skipped = buildLatestVideoGrowthFromSnapshots(
      [
        current,
        incompatiblePrev,
        account({
          capturedAt: '2026-08-28T10:00:00.000Z',
          followers: 6570,
          totalViews: 1_001_200,
          recentVideos: [{ ...designer, views: 7101 }, frozen, doGood],
        }),
      ],
      6572,
    );
    assert.equal(skipped.viewDelta, 50);
    assert.equal(skipped.comparisonInterval?.from, '2026-08-28T10:00:00.000Z');
  });

  it('still suppresses unexplained cumulative account-view declines', () => {
    const snap = buildCoherentHomeAnalytics({
      asOf: '2026-08-28T01:47:09.988Z',
      authoritativeFollowers: 6557,
      whatChanged: [
        'Total views: 1,001,264, with a total views change of -140,673.',
        'Followers grew by 5, now totaling 6,554.',
      ],
      videoGrowth: buildLatestVideoGrowth({
        current: account({
          capturedAt: '2026-08-28T16:00:00.000Z',
          followers: 6557,
          recentVideos: [designer],
        }),
        previous: account({
          capturedAt: '2026-08-28T10:00:00.000Z',
          followers: 6552,
          recentVideos: [{ ...designer, views: 7000 }],
        }),
        authoritativeFollowers: 6557,
      }),
    });
    assert.equal(snap.followers, 6557);
    assert.ok(snap.anomaly);
    assert.equal(snap.changes.some((c) => /total views change of -/i.test(c)), false);
    assert.equal(snap.changes.some((c) => /140,673/.test(c)), false);
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
