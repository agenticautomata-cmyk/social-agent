/**
 * Instagram visual event reader — fixture matrix + unit tests.
 * No billable AI. No live network required for these cases.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import {
  refuseSynthesizedInstagramUrl,
  validateCapturedPermalink,
} from './acquisition.js';
import { assembleVisualEvents, isRoundupCoverTitle } from './event-assembler.js';
import { resolveEventDateWithYearTrust } from './date-year-trust.js';
import { triageEventLikelihood } from './event-triage.js';
import { assessLocationTrust } from './location-trust.js';
import { decideDuplicate, dedupeVisualCandidates, occurrenceKey } from './visual-dedupe.js';
import {
  deriveCoverageStatus,
  finalizeCoverageReport,
  emptyCoverageReport,
  formatCoverageSummary,
  coverageStatusToHealthStatus,
} from './coverage.js';
import { defaultInstagramVisualBounds } from './bounds.js';
import { processPostVisualEvents } from './process-post.js';
import { hammingDistanceHex, averagePerceptualHash } from './cache.js';
import { escalateToVision, defaultVisionBudget } from './vision-escalation.js';
import {
  detectVisualStructureChange,
  emptyStrategyProfile,
  updateStrategyProfile,
} from './strategy-memory.js';
import { isCapturedInstagramPostOrReelUrl, isPlatformIssuedInstagramShortcode } from '../instagram-url.js';
import type { AcquiredInstagramMedia, SlideOcrEvidence } from './types.js';
import type { CapturedSocialPost } from '../types.js';

function acquired(overrides: Partial<AcquiredInstagramMedia> = {}): AcquiredInstagramMedia {
  return {
    postId: null,
    shortcode: 'DbLYAWGnLPD',
    permalink: 'https://www.instagram.com/p/DbLYAWGnLPD/',
    handle: 'curator',
    author: 'curator',
    publishedAt: '2026-09-10T18:00:00.000Z',
    caption: null,
    altTexts: [],
    hashtags: [],
    taggedCollaborators: [],
    locationTag: null,
    mediaType: 'carousel_images',
    carouselChildCount: 3,
    carouselChildIds: ['DbLYAWGnLPD:0', 'DbLYAWGnLPD:1', 'DbLYAWGnLPD:2'],
    mediaUrls: [],
    thumbnailOrCoverUrl: null,
    accessibilityMetadata: {},
    editIndicators: [],
    permalinkSource: 'platform_url',
    ...overrides,
  };
}

function slide(n: number, text: string, conf = 0.8): SlideOcrEvidence {
  return {
    slideNumber: n,
    mediaHash: `hash-${n}`,
    rawText: text,
    normalizedText: text,
    confidence: conf,
    engine: 'fixture',
    preprocessMethod: 'fixture',
    fromCache: false,
    bboxes: [],
    timestamp: new Date().toISOString(),
    kind: 'image',
  };
}

function post(overrides: Partial<CapturedSocialPost> = {}): CapturedSocialPost {
  return {
    postUrl: 'https://www.instagram.com/p/DbLYAWGnLPD/',
    profileHandle: 'jasfoodjourney',
    publishedAt: '2026-09-10T18:00:00.000Z',
    caption: 'Weekend notes',
    postType: 'carousel',
    sourceFingerprint: 'fp1',
    outboundLinks: [],
    ephemeralSource: false,
    slideImageUrls: ['data:image/jpeg;base64,abc'],
    mediaType: 'carousel_images',
    mediaItems: [
      { index: 0, kind: 'image', imageUrl: 'https://cdn/1.jpg', videoUrl: null, screenshotPath: null, durationSeconds: null },
      { index: 1, kind: 'image', imageUrl: 'https://cdn/2.jpg', videoUrl: null, screenshotPath: null, durationSeconds: null },
      { index: 2, kind: 'image', imageUrl: 'https://cdn/3.jpg', videoUrl: null, screenshotPath: null, durationSeconds: null },
    ],
    ...overrides,
  };
}

describe('Instagram visual — permalink trust (Original Sin regression)', () => {
  it('accepts genuine platform shortcodes', () => {
    const v = validateCapturedPermalink('https://www.instagram.com/p/DbLYAWGnLPD/');
    assert.equal(v.ok, true);
    assert.equal(v.shortcode, 'DbLYAWGnLPD');
    assert.equal(isCapturedInstagramPostOrReelUrl(v.permalink), true);
  });

  it('rejects synthetic kebab permalinks', () => {
    assert.equal(isPlatformIssuedInstagramShortcode('original-sin'), false);
    const v = validateCapturedPermalink('https://www.instagram.com/p/original-sin/');
    assert.equal(v.ok, false);
    assert.equal(v.reason, 'synthetic_shortcode_rejected');
  });

  it('never synthesizes URLs from title/handle', () => {
    assert.equal(
      refuseSynthesizedInstagramUrl({ title: 'Rock the Bridge', handle: 'bizzybodyb007' }),
      null,
    );
  });
});

describe('Instagram visual — fixture matrix', () => {
  it('single flyer with explicit year', () => {
    const events = assembleVisualEvents({
      acquired: acquired({
        mediaType: 'single_image',
        carouselChildCount: 1,
        caption: null,
      }),
      slideOcr: [
        slide(1, 'Rock the Bridge\nBoone Theater\nSeptember 20, 2026\n8:00 PM\n$45'),
      ],
    });
    assert.ok(events.length >= 1);
    assert.match(events[0]!.title ?? '', /Rock the Bridge/i);
    assert.equal(events[0]!.eventDate, '2026-09-20');
    assert.equal(events[0]!.yearTrust, 'year_explicit');
    assert.equal(events[0]!.permalink, 'https://www.instagram.com/p/DbLYAWGnLPD/');
    assert.ok(events[0]!.fieldEvidence.some((e) => e.field === 'title' && e.slideNumber === 1));
  });

  it('carousel cover with no event facts + later event slides (Jas pattern)', () => {
    const events = assembleVisualEvents({
      acquired: acquired({
        handle: 'jasfoodjourney',
        caption: 'Kansas City Events in Black Spaces',
      }),
      slideOcr: [
        slide(1, 'Kansas City Events in Black Spaces\nThis Weekend'),
        slide(2, 'Friday\nJazz Night at The Gem\n7:00 PM\n$20'),
        slide(3, 'Saturday\nBrunch Social\nCrossroads\n11:00 AM'),
      ],
    });
    assert.ok(isRoundupCoverTitle('Kansas City Events in Black Spaces'));
    assert.ok(events.length >= 2, `expected >=2 events, got ${events.length}`);
    assert.ok(!events.every((e) => /Kansas City Events in Black Spaces/i.test(e.title ?? '')));
    assert.ok(events.every((e) => e.permalink === 'https://www.instagram.com/p/DbLYAWGnLPD/'));
    assert.ok(events.some((e) => e.slideNumbers.includes(2)));
    assert.ok(events.some((e) => e.slideNumbers.includes(3)));
  });

  it('multi-slide one event merges evidence', () => {
    const events = assembleVisualEvents({
      acquired: acquired({ carouselChildCount: 2 }),
      slideOcr: [
        slide(1, 'Hip Hop & R&B Night\nBoone Theater'),
        slide(2, 'Hip Hop & R&B Night\nDoors 8:00 PM\n$30'),
      ],
    });
    assert.equal(events.length, 1);
    assert.deepEqual(events[0]!.slideNumbers, [1, 2]);
    assert.ok(events[0]!.eventTime);
  });

  it('missing year without weekday → review, not verified calendar', () => {
    const trust = resolveEventDateWithYearTrust({
      text: 'September 20 at Boone Theater',
      postPublishedAt: '2026-09-12T12:00:00.000Z',
    });
    assert.equal(trust.yearTrust, 'year_inferred_review');
    assert.ok(
      trust.temporalClass === 'review' ||
        trust.temporalClass === 'future' ||
        trust.temporalClass === 'expired',
    );
  });

  it('yearless Friday Sep 18 + publish + weekday → year_corroborated 2026', () => {
    const trust = resolveEventDateWithYearTrust({
      text: 'Friday, September 18\n7 PM–11 PM\nRock Island Bridge',
      postPublishedAt: '2026-09-10T18:00:00.000Z',
      now: new Date('2026-09-13T17:00:00Z'),
    });
    assert.equal(trust.isoDate, '2026-09-18');
    assert.equal(trust.yearTrust, 'year_corroborated');
    assert.equal(trust.temporalClass, 'future');
  });

  it('old flyer with explicit past year stays expired (never rolled forward)', () => {
    const trust = resolveEventDateWithYearTrust({
      text: 'Ghostface Killah\nMarch 15, 2024\nBoone Theater',
      postPublishedAt: '2024-03-01T12:00:00.000Z',
      now: new Date('2026-09-13T12:00:00Z'),
    });
    assert.equal(trust.isoDate, '2024-03-15');
    assert.equal(trust.yearTrust, 'year_explicit');
    assert.equal(trust.temporalClass, 'expired');
  });

  it('caption correction marks review', () => {
    const events = assembleVisualEvents({
      acquired: acquired({
        caption: 'UPDATE: show moved to Sunday — correction',
      }),
      slideOcr: [slide(1, 'Hip Hop Night\nFriday September 18, 2026\n8 PM')],
    });
    assert.ok(events.length >= 1);
    assert.equal(events[0]!.decisionStage, 'review');
  });

  it('out-of-market rejected', () => {
    const loc = assessLocationTrust({
      flyerText: 'Live in Brooklyn New York at Barclays',
      curatorHandle: 'bizzybodyb007',
    });
    assert.equal(loc.trust, 'out_of_market');
  });

  it('curator handle is not sole geo', () => {
    const loc = assessLocationTrust({
      flyerText: 'Party tonight',
      curatorHandle: 'jasfoodjourney',
    });
    assert.equal(loc.trust, 'curator_only');
  });

  it('empty caption still prioritizes OCR (facts may be in image)', () => {
    const t = triageEventLikelihood({
      caption: '',
      carouselChildCount: 1,
      notPreviouslyInspected: true,
    });
    assert.equal(t.prioritizeOcr, true);
    assert.ok(t.signals.includes('caption_thin_image_may_carry_facts'));
  });

  it('weak keyword alone is not enough', () => {
    const t = triageEventLikelihood({ caption: 'event' });
    assert.ok(t.signals.includes('weak_keyword_only_not_enough'));
    assert.ok(t.score <= 0.35);
  });

  it('repost / cropped dupe dedupes; separate showtimes preserved', () => {
    const a = {
      title: 'Rock the Bridge',
      eventDate: '2026-09-20',
      eventTime: '8:00 PM',
      venue: 'Boone Theater',
      permalink: 'https://www.instagram.com/p/AAAA11112222/',
      originalQuotedText: 'x',
      slideNumbers: [1],
      yearTrust: 'year_explicit' as const,
      yearInferenceExplanation: null,
      locationTrust: 'evidenced' as const,
      temporalClass: 'future' as const,
      likelihoodScore: 0.8,
      fieldEvidence: [],
      decisionStage: 'extracted' as const,
      rejectionReason: null,
      duplicateOf: null,
      performers: [],
      endTime: null,
      address: null,
      neighborhood: null,
      city: null,
      price: null,
      ageRestriction: null,
      ticketUrl: null,
      dayHeading: null,
    };
    const sameShow = { ...a, permalink: 'https://www.instagram.com/p/BBBB22223333/' };
    const otherTime = { ...a, eventTime: '10:00 PM', permalink: 'https://www.instagram.com/p/CCCC33334444/' };
    const { kept, duplicates } = dedupeVisualCandidates([a, sameShow, otherTime]);
    assert.equal(duplicates.length, 1);
    assert.ok(kept.some((k) => k.eventTime === '8:00 PM'));
    assert.ok(kept.some((k) => k.eventTime === '10:00 PM'));
  });

  it('perceptual hash near-match', () => {
    const bits = new Uint8Array(64).fill(100);
    bits[0] = 200;
    const h1 = averagePerceptualHash(bits);
    bits[1] = 200;
    const h2 = averagePerceptualHash(bits);
    assert.ok(hammingDistanceHex(h1, h2) <= 8);
  });

  it('vision escalation disabled by default', async () => {
    const budget = defaultVisionBudget(false);
    const res = await escalateToVision({
      request: {
        mediaHash: 'x',
        slideNumber: 1,
        imageDataUrl: 'data:image/jpeg;base64,aa',
        reason: 'low_confidence_ocr',
      },
      budget,
    });
    assert.equal(res.used, false);
    assert.equal(res.skippedReason, 'billable_vision_disabled');
  });

  it('coverage status does not call incomplete carousel healthy', () => {
    const status = deriveCoverageStatus({
      sessionOk: true,
      postsDiscovered: 8,
      postsInspected: 3,
      slidesExpected: 12,
      slidesAcquired: 3,
      slidesOcrAttempted: 3,
      unreadablePosts: 0,
      candidatesFuture: 2,
      candidatesExtracted: 2,
      incompleteReason: 'carousel_slides_incomplete 3/12',
    });
    assert.equal(status, 'partial');
    assert.equal(coverageStatusToHealthStatus(status), 'degraded');
  });

  it('complete_no_current_events when inspected with zero candidates', () => {
    const status = deriveCoverageStatus({
      sessionOk: true,
      postsDiscovered: 6,
      postsInspected: 4,
      slidesExpected: 4,
      slidesAcquired: 4,
      slidesOcrAttempted: 4,
      unreadablePosts: 0,
      candidatesFuture: 0,
      candidatesExtracted: 0,
    });
    assert.equal(status, 'complete_no_current_events');
  });

  it('structure change detects cover-only carousel regression', () => {
    const prior = emptyStrategyProfile('bizzybodyb007');
    prior.successCount = 3;
    prior.mediaStructureFingerprint = 'abc';
    prior.lastPostEnumerationAt = new Date().toISOString();
    const change = detectVisualStructureChange({
      prior,
      postsDiscovered: 8,
      slidesExpected: 10,
      slidesAcquired: 1,
      carouselsSeen: 2,
      slidesOcrAttempted: 1,
      slidesOcrSucceeded: 1,
      coverOnlyCarouselRegression: true,
    });
    assert.equal(change.structureChanged, true);
    assert.ok(change.reasons.includes('cover_only_carousel_regression'));
  });

  it('processPostVisualEvents fixture path extracts candidates with slide evidence', async () => {
    const result = await processPostVisualEvents({
      post: post(),
      fixtureOcrTexts: [
        'Kansas City Events in Black Spaces',
        'Friday — Soul Food Pop-up at 18th & Vine 6:00 PM',
        'Saturday — Poetry Night Midtown 7:30 PM $10',
      ],
    });
    assert.ok(result.acquired);
    assert.equal(result.acquired!.shortcode, 'DbLYAWGnLPD');
    assert.ok(result.candidates.length >= 1);
    assert.ok(result.candidates.every((c) => c.permalink.includes('/p/DbLYAWGnLPD')));
  });

  it('second-run dedupe produces zero new kept when identical', () => {
    const c = {
      title: 'Brunch Social',
      localDatetime: '2026-09-20',
      venue: 'Crossroads',
      showtime: '11:00 AM',
      permalink: 'https://www.instagram.com/p/DbLYAWGnLPD/',
      platformId: 'https://www.instagram.com/p/DbLYAWGnLPD/',
    };
    const key = occurrenceKey(c);
    const d = decideDuplicate(c, [{ ...c, key }]);
    assert.equal(d.isDuplicate, true);
  });

  it('all-day and UTC midnight do not invent timezone shifts into wrong calendar day', () => {
    const trust = resolveEventDateWithYearTrust({
      text: 'All day festival September 21, 2026',
      postPublishedAt: '2026-09-13T00:00:00.000Z',
    });
    assert.equal(trust.isoDate, '2026-09-21');
    assert.equal(trust.yearTrust, 'year_explicit');
  });

  it('coverage summary is concrete, not usable-records', () => {
    const report = finalizeCoverageReport({
      ...emptyCoverageReport('bizzybodyb007', 'https://www.instagram.com/bizzybodyb007/', defaultInstagramVisualBounds()),
      postsDiscovered: 10,
      postsInspected: 5,
      slidesExpected: 8,
      slidesAcquired: 8,
      slidesOcrAttempted: 8,
      slidesOcrSucceeded: 7,
      candidatesExtracted: 3,
      candidatesFuture: 2,
      candidatesExpired: 1,
    });
    const line = formatCoverageSummary(report);
    assert.doesNotMatch(line, /usable records/i);
    assert.match(line, /slides 8\/8/);
    assert.match(line, /candidates 3/);
  });

  it('strategy profile updates on success', () => {
    const prior = emptyStrategyProfile('hookedonkc');
    const coverage = finalizeCoverageReport({
      ...emptyCoverageReport('hookedonkc', 'https://www.instagram.com/hookedonkc/', defaultInstagramVisualBounds()),
      postsDiscovered: 4,
      postsInspected: 2,
      slidesExpected: 2,
      slidesAcquired: 2,
      slidesOcrAttempted: 2,
      candidatesExtracted: 1,
      candidatesFuture: 1,
    });
    const next = updateStrategyProfile({
      prior,
      status: coverage.status,
      coverage,
      lastPostId: 'AbCdEfGhIjK',
      mediaHashes: [createHash('sha256').update('x').digest('hex').slice(0, 16)],
      sessionHealth: 'ready',
      structureFingerprint: 'struct1',
    });
    assert.equal(next.successCount, 1);
    assert.equal(next.lastPostId, 'AbCdEfGhIjK');
  });
});

describe('Instagram visual — sharp preprocess smoke', () => {
  it('builds a tiny flyer buffer without throwing', async () => {
    const buf = await sharp({
      create: {
        width: 400,
        height: 600,
        channels: 3,
        background: { r: 20, g: 20, b: 40 },
      },
    })
      .jpeg()
      .toBuffer();
    assert.ok(buf.length > 500);
  });
});
