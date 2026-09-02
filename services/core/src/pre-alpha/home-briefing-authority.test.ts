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
  HOME_VIDEO_VISIBLE_LIMIT,
  isFollowerGrowthLine,
  pickCompatibleSnapshotPair,
  selectLatestPostingBatch,
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
      formatVideoGrowthLine({
        title: designer.title,
        viewDelta: 251,
        currentViews: 7151,
        firstTracked: false,
      }),
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

  it('uses singular view wording for a gain of one', () => {
    assert.match(
      formatVideoGrowthLine({
        title: 'Everything costs more',
        viewDelta: 1,
        currentViews: 275,
        firstTracked: false,
      }),
      /gained 1 view since the last check/,
    );
    assert.doesNotMatch(
      formatVideoGrowthLine({
        title: 'Everything costs more',
        viewDelta: 1,
        currentViews: 275,
        firstTracked: false,
      }),
      /1 views/,
    );
    assert.match(
      formatVideoGrowthLine({
        title: 'Luxury shopping',
        viewDelta: 2,
        currentViews: 842,
        firstTracked: false,
      }),
      /gained 2 views since the last check/,
    );
    assert.match(
      formatVideoGrowthLine({
        title: 'First look',
        currentViews: 1,
        firstTracked: true,
      }),
      /Since first tracked: 1 view\./,
    );
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

  describe('latest posting batch', () => {
    const thursday: GrowthVideoSnapshot = {
      videoId: '7678803733140196622',
      title: 'Every Thursday I drop a weekend guide',
      views: 369,
      publishedAt: '2026-08-27T20:00:35.000Z',
    };
    const frozenTreat: GrowthVideoSnapshot = {
      videoId: '767880374930902555',
      title: 'I came for the frozen treat',
      views: 536,
      publishedAt: '2026-08-27T20:00:30.000Z',
    };
    const ross: GrowthVideoSnapshot = {
      videoId: '767880335414685210',
      title: 'Saw this at Ross',
      views: 382,
      publishedAt: '2026-08-27T19:58:59.000Z',
    };
    const olderDesigner: GrowthVideoSnapshot = {
      videoId: 'vid-designer-older',
      title: 'Kansas City, this is designer shopping with a purpose',
      views: 7151,
      publishedAt: '2026-08-26T18:00:00.000Z',
    };

    const previousBatch = account({
      capturedAt: '2026-08-28T10:00:00.000Z',
      followers: 6571,
      totalViews: 1_001_200,
      recentVideos: [
        { ...thursday, views: 361 },
        { ...frozenTreat, views: 520 },
        { ...ross, views: 370 },
        olderDesigner,
      ],
    });
    const currentBatch = account({
      capturedAt: '2026-08-28T16:00:00.000Z',
      followers: 6572,
      totalViews: 1_001_420,
      recentVideos: [thursday, frozenTreat, ross, olderDesigner],
    });

    function homeFacingLines(growth: ReturnType<typeof buildLatestVideoGrowth>) {
      const coherent = buildCoherentHomeAnalytics({
        asOf: currentBatch.capturedAt,
        authoritativeFollowers: 6572,
        whatChanged: ['Total views increased by 220.'],
        videoGrowth: growth,
      });
      return {
        growth,
        coherent,
        visible: coherent.changes.filter((c) => !isFollowerGrowthLine(c)),
        allReported: [
          coherent.headline,
          ...coherent.changes,
          ...coherent.overflowChanges,
          coherent.followerLine,
        ].filter((line): line is string => Boolean(line)),
      };
    }

    it('1. three videos published in the same posting batch all appear', () => {
      const batch = selectLatestPostingBatch(currentBatch.recentVideos);
      assert.equal(batch.length, 3);
      assert.deepEqual(
        batch.map((v) => v.videoId),
        [thursday.videoId, frozenTreat.videoId, ross.videoId],
      );
      const growth = buildLatestVideoGrowth({
        current: currentBatch,
        previous: previousBatch,
        authoritativeFollowers: 6572,
      });
      assert.equal(growth.videos.length, 3);
      assert.ok(growth.videos.every((row) => [thursday, frozenTreat, ross].some((v) => v.videoId === row.videoId)));
      assert.equal(growth.videos.some((row) => row.videoId === olderDesigner.videoId), false);
      const { coherent } = homeFacingLines(growth);
      assert.equal(coherent.videoIds.length, 3);
      for (const video of [thursday, frozenTreat, ross]) {
        assert.ok(
          [coherent.headline, ...coherent.changes].some((line) => line?.includes(video.title.slice(0, 12))),
          `missing ${video.title}`,
        );
      }
    });

    it('2. each view delta is calculated from the same comparison snapshots', () => {
      const growth = buildLatestVideoGrowth({
        current: currentBatch,
        previous: previousBatch,
        authoritativeFollowers: 6572,
      });
      assert.equal(growth.comparisonInterval?.from, previousBatch.capturedAt);
      assert.equal(growth.comparisonInterval?.to, currentBatch.capturedAt);
      assert.equal(growth.videos[0]?.viewDelta, thursday.views - 361);
      assert.equal(growth.videos[1]?.viewDelta, frozenTreat.views - 520);
      assert.equal(growth.videos[2]?.viewDelta, ross.views - 370);
      assert.equal(growth.followerDelta, 1);
      for (const row of growth.videos) {
        const prior = previousBatch.recentVideos.find((v) => v.videoId === row.videoId);
        assert.ok(prior);
        assert.equal(row.viewDelta, row.currentViews - prior!.views);
        assert.equal(row.previousViews, prior!.views);
      }
    });

    it('3. each video is matched using its stable video ID', () => {
      const sameTitleA: GrowthVideoSnapshot = {
        videoId: 'id-a',
        title: 'Weekend guide',
        views: 400,
        publishedAt: '2026-08-27T20:00:35.000Z',
      };
      const sameTitleB: GrowthVideoSnapshot = {
        videoId: 'id-b',
        title: 'Weekend guide',
        views: 200,
        publishedAt: '2026-08-27T20:00:30.000Z',
      };
      const previous = account({
        capturedAt: '2026-08-28T10:00:00.000Z',
        followers: 6571,
        recentVideos: [
          { ...sameTitleA, title: 'Unrelated old title A', views: 350 },
          { ...sameTitleB, title: 'Unrelated old title B', views: 180 },
        ],
      });
      const current = account({
        capturedAt: '2026-08-28T16:00:00.000Z',
        followers: 6572,
        recentVideos: [sameTitleA, sameTitleB],
      });
      const growth = buildLatestVideoGrowth({ current, previous, authoritativeFollowers: 6572 });
      assert.equal(growth.videos.find((v) => v.videoId === 'id-a')?.viewDelta, 50);
      assert.equal(growth.videos.find((v) => v.videoId === 'id-b')?.viewDelta, 20);
      assert.equal(growth.videos.find((v) => v.videoId === 'id-a')?.previousViews, 350);
      assert.equal(growth.videos.find((v) => v.videoId === 'id-b')?.previousViews, 180);
    });

    it('4. results are ordered newest first', () => {
      const growth = buildLatestVideoGrowth({
        current: currentBatch,
        previous: previousBatch,
        authoritativeFollowers: 6572,
      });
      const published = growth.videos.map((v) => Date.parse(v.publishedAt));
      assert.deepEqual(published, [...published].sort((a, b) => b - a));
      assert.deepEqual(
        growth.videos.map((v) => v.videoId),
        [thursday.videoId, frozenTreat.videoId, ross.videoId],
      );
    });

    it('5. follower growth appears exactly once', () => {
      const growth = buildLatestVideoGrowth({
        current: currentBatch,
        previous: previousBatch,
        authoritativeFollowers: 6572,
      });
      const { coherent, allReported } = homeFacingLines(growth);
      const followerHits = allReported.filter((line) => isFollowerGrowthLine(line));
      assert.equal(followerHits.length, 1);
      assert.equal(coherent.followerLine, formatFollowerGrowthLine(1, 6572));
      assert.equal(coherent.changes.filter((c) => isFollowerGrowthLine(c)).length, 0);
      assert.equal(coherent.overflowChanges.filter((c) => isFollowerGrowthLine(c)).length, 0);
      assert.doesNotMatch(coherent.headline ?? '', /You gained \d/);
    });

    it('6. account-wide view growth cannot replace per-video deltas', () => {
      const growth = buildLatestVideoGrowth({
        current: currentBatch,
        previous: previousBatch,
        authoritativeFollowers: 6572,
      });
      const accountWide = currentBatch.totalViews - previousBatch.totalViews;
      assert.equal(accountWide, 220);
      assert.notEqual(growth.videos[0]?.viewDelta, accountWide);
      assert.ok(growth.videos.every((row) => row.viewDelta !== accountWide));
      const { coherent, allReported } = homeFacingLines(growth);
      assert.equal(allReported.some((line) => /total views/i.test(line)), false);
      assert.equal(allReported.some((line) => /\b220\b/.test(line)), false);
      assert.match(coherent.changes[0] ?? coherent.headline ?? '', /8 views/);
    });

    it('7. newly tracked videos receive the correct label', () => {
      const previous = account({
        capturedAt: '2026-08-28T10:00:00.000Z',
        followers: 6571,
        recentVideos: [{ ...frozenTreat, views: 520 }, { ...ross, views: 370 }],
      });
      const growth = buildLatestVideoGrowth({
        current: currentBatch,
        previous,
        authoritativeFollowers: 6572,
      });
      const first = growth.videos.find((v) => v.videoId === thursday.videoId);
      assert.equal(first?.firstTracked, true);
      assert.match(first?.line ?? '', /Since first tracked: 369 views/);
      assert.doesNotMatch(first?.line ?? '', /since the last check/i);
      const frozenRow = growth.videos.find((v) => v.videoId === frozenTreat.videoId);
      assert.equal(frozenRow?.firstTracked, false);
      assert.match(frozenRow?.line ?? '', /since the last check/i);
    });

    it('8. more than the display limit does not make the Home card excessively long', () => {
      const extras: GrowthVideoSnapshot[] = [
        { videoId: 'batch-4', title: 'Fourth same-session post', views: 120, publishedAt: '2026-08-27T19:50:00.000Z' },
        { videoId: 'batch-5', title: 'Fifth same-session post', views: 110, publishedAt: '2026-08-27T19:45:00.000Z' },
      ];
      const previous = account({
        capturedAt: '2026-08-28T10:00:00.000Z',
        followers: 6571,
        recentVideos: [
          { ...thursday, views: 361 },
          { ...frozenTreat, views: 520 },
          { ...ross, views: 370 },
          { ...extras[0]!, views: 100 },
          { ...extras[1]!, views: 90 },
        ],
      });
      const current = account({
        capturedAt: '2026-08-28T16:00:00.000Z',
        followers: 6572,
        recentVideos: [thursday, frozenTreat, ross, extras[0]!, extras[1]!],
      });
      const growth = buildLatestVideoGrowth({ current, previous, authoritativeFollowers: 6572 });
      assert.equal(growth.videos.length, 5);
      assert.equal(growth.overflowLines.length, 5 - HOME_VIDEO_VISIBLE_LIMIT);
      const coherent = buildCoherentHomeAnalytics({
        asOf: current.capturedAt,
        authoritativeFollowers: 6572,
        videoGrowth: growth,
      });
      const visibleVideoLines = coherent.changes.filter((c) => !isFollowerGrowthLine(c));
      assert.ok(visibleVideoLines.length <= HOME_VIDEO_VISIBLE_LIMIT);
      assert.equal(visibleVideoLines.length, HOME_VIDEO_VISIBLE_LIMIT);
      assert.equal(coherent.overflowChanges.length, 2);
      assert.equal(visibleVideoLines.length + coherent.overflowChanges.length, 5);
      const collapsedCardLines = [coherent.headline, ...visibleVideoLines, coherent.followerLine].filter(Boolean);
      assert.ok(collapsedCardLines.length <= HOME_VIDEO_VISIBLE_LIMIT + 2);
    });

    it('9. a single-video batch still works', () => {
      const previous = account({
        capturedAt: '2026-08-28T10:00:00.000Z',
        followers: 6571,
        recentVideos: [{ ...thursday, views: 361 }, olderDesigner],
      });
      const current = account({
        capturedAt: '2026-08-28T16:00:00.000Z',
        followers: 6572,
        recentVideos: [thursday, olderDesigner],
      });
      const growth = buildLatestVideoGrowth({ current, previous, authoritativeFollowers: 6572 });
      assert.equal(selectLatestPostingBatch(current.recentVideos).length, 1);
      assert.equal(growth.videos.length, 1);
      assert.equal(growth.videoId, thursday.videoId);
      assert.equal(growth.viewDelta, 8);
      assert.match(growth.headline ?? '', /gained 8 views since the last check, now at 369/);
      assert.equal(growth.overflowLines.length, 0);
      const coherent = buildCoherentHomeAnalytics({
        asOf: current.capturedAt,
        authoritativeFollowers: 6572,
        videoGrowth: growth,
      });
      assert.equal(coherent.changes.length, 0);
      assert.equal(coherent.followerLine, formatFollowerGrowthLine(1, 6572));
    });

    it('10. missing or incompatible snapshots produce no invented numbers', () => {
      const missing = buildLatestVideoGrowth({ current: null, previous: null });
      assert.equal(missing.videos.length, 0);
      assert.equal(missing.viewDelta, null);
      assert.equal(missing.followerDelta, null);
      assert.equal(missing.headline, null);

      const onlyCurrent = buildLatestVideoGrowth({
        current: currentBatch,
        previous: null,
        authoritativeFollowers: 6572,
      });
      assert.equal(onlyCurrent.compatible, false);
      assert.equal(onlyCurrent.videos.length, 0);
      assert.equal(onlyCurrent.viewDelta, null);
      assert.equal(onlyCurrent.headline, 'No new view movement on your latest posts since the last check.');
      assert.doesNotMatch(onlyCurrent.headline ?? '', /\d+/);
      assert.equal(onlyCurrent.lines.some((l) => /\d+/.test(l) && !isFollowerGrowthLine(l)), false);

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
      assert.equal(areSnapshotsCompatible(currentBatch, incompatiblePrev).ok, false);
      const growth = buildLatestVideoGrowth({
        current: currentBatch,
        previous: incompatiblePrev,
        authoritativeFollowers: 6572,
      });
      const coherent = buildCoherentHomeAnalytics({
        asOf: currentBatch.capturedAt,
        authoritativeFollowers: 6572,
        whatChanged: ['Total views increased by 220.'],
        videoGrowth: growth,
      });
      assert.equal(growth.videos.length, 0);
      assert.equal(coherent.videoIds.length, 0);
      assert.doesNotMatch(coherent.headline ?? '', /gained/);
      assert.equal(coherent.changes.some((c) => /\d+/.test(c) && /views/i.test(c)), false);
      assert.equal(coherent.changes.some((c) => /220/.test(c)), false);
    });
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
