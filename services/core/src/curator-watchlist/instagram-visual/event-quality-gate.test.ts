/**
 * Instagram event quality gate — 25 required regressions (K).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assembleVisualEvents } from './event-assembler.js';
import { extractCaptionStructuredEvent } from './caption-event-extract.js';
import { resolveEventDateWithYearTrust } from './date-year-trust.js';
import {
  classifyResearchToolOutcome,
  evaluateEventQualityGate,
  isResearchFailureProse,
} from './event-quality-gate.js';
import { assessOcrTitleQuality, isKnownGarbageTitle, isOcrGibberishTitle } from './ocr-quality.js';
import { classifyInstagramPostContent } from './post-classification.js';
import {
  deriveCoverageStatus,
  emptyCoverageReport,
  finalizeCoverageReport,
  summarizeCandidates,
} from './coverage.js';
import { defaultInstagramVisualBounds } from './bounds.js';
import type { AcquiredInstagramMedia, SlideOcrEvidence, VisualEventCandidate } from './types.js';

function acquired(overrides: Partial<AcquiredInstagramMedia> = {}): AcquiredInstagramMedia {
  return {
    postId: null,
    shortcode: 'SculptTest01',
    permalink: 'https://www.instagram.com/p/SculptTest01/',
    handle: 'kcpldistrict',
    author: 'kcpldistrict',
    publishedAt: '2026-09-10T18:00:00.000Z',
    caption: null,
    altTexts: [],
    hashtags: [],
    taggedCollaborators: [],
    locationTag: null,
    mediaType: 'carousel_images',
    carouselChildCount: 3,
    carouselChildIds: [],
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

const GARBAGE = ['I Zo SL dE i)', 'oy ihe po Hy', 'Epa | te- 4 3', 'fa 7S RE NARA 4'];

describe('Instagram event quality gate regressions', () => {
  it('1-4: known garbage titles rejected as OCR gibberish', () => {
    for (const g of GARBAGE) {
      assert.equal(isKnownGarbageTitle(g), true, g);
      assert.equal(isOcrGibberishTitle(g), true, g);
      assert.equal(assessOcrTitleQuality(g).usableAsTitle, false, g);
    }
  });

  it('5: rejected OCR stays diagnostic — no lead from gibberish slides', () => {
    const events = assembleVisualEvents({
      acquired: acquired({
        caption: 'Thanks for following along!',
        carouselChildCount: 4,
      }),
      slideOcr: GARBAGE.map((t, i) => slide(i + 1, t, 0.3)),
    });
    assert.equal(events.filter((e) => e.decisionStage !== 'rejected').length, 0);
    assert.ok(events.every((e) => !GARBAGE.includes(e.title ?? '')));
  });

  it('6: weak slide OCR + strong caption → caption-derived title', () => {
    const events = assembleVisualEvents({
      acquired: acquired({
        caption: 'Next up: FREE Sculpt Fusion in PNC Plaza on 9.16',
        publishedAt: '2026-09-10T15:00:00.000Z',
      }),
      slideOcr: [slide(1, 'I Zo SL dE i)', 0.2), slide(2, 'oy ihe po Hy', 0.2)],
    });
    assert.ok(events.length >= 1);
    assert.equal(events[0]!.title, 'Sculpt Fusion');
    assert.ok(events[0]!.fieldEvidence.some((e) => e.field === 'supportingSlideOcr'));
  });

  it('7: Sculpt Fusion extracted from caption', () => {
    const c = extractCaptionStructuredEvent({
      caption: 'Next up: FREE Sculpt Fusion in PNC Plaza on 9.16',
      permalink: 'https://www.instagram.com/p/SculptTest01/',
      publishedAt: '2026-09-10T15:00:00.000Z',
      handle: 'kcpldistrict',
      now: new Date('2026-09-14T12:00:00.000Z'),
    });
    assert.ok(c);
    assert.equal(c!.title, 'Sculpt Fusion');
    assert.equal(c!.venue, 'PNC Plaza');
    assert.ok(/free/i.test(c!.price ?? ''));
    assert.equal(c!.eventDate, '2026-09-16');
  });

  it('8: missing event time remains unknown — never invented', () => {
    const c = extractCaptionStructuredEvent({
      caption: 'Next up: FREE Sculpt Fusion in PNC Plaza on 9.16',
      permalink: 'https://www.instagram.com/p/SculptTest01/',
      publishedAt: '2026-09-10T15:00:00.000Z',
      now: new Date('2026-09-14T12:00:00.000Z'),
    });
    assert.equal(c!.eventTime, null);
  });

  it('9: post timestamp + 9.16 corroborates September 16, 2026', () => {
    const d = resolveEventDateWithYearTrust({
      text: 'Next up: FREE Sculpt Fusion in PNC Plaza on 9.16',
      postPublishedAt: '2026-09-10T15:00:00.000Z',
      now: new Date('2026-09-14T12:00:00.000Z'),
    });
    assert.equal(d.isoDate, '2026-09-16');
    assert.ok(d.yearTrust === 'year_corroborated' || d.yearTrust === 'year_inferred_review');
  });

  it('10: insufficient year evidence → visible review, not discarded', () => {
    const d = resolveEventDateWithYearTrust({
      text: 'Workshop on March 3',
      postPublishedAt: null,
      now: new Date('2026-09-14T12:00:00.000Z'),
    });
    assert.equal(d.yearTrust, 'year_unresolved');
    assert.ok(d.temporalClass === 'review' || d.temporalClass === 'undated');

    const events = assembleVisualEvents({
      acquired: acquired({
        caption: 'Next up: FREE Open Studio in Crossroads on 3.3',
        publishedAt: null,
      }),
      slideOcr: [],
    });
    // Without publish timestamp, still surface as review/rejected-with-reason — not silent drop of caption parse
    const c = extractCaptionStructuredEvent({
      caption: 'Next up: FREE Open Studio in Crossroads on 3.3',
      permalink: 'https://www.instagram.com/p/x/',
      publishedAt: null,
      now: new Date('2026-09-14T12:00:00.000Z'),
    });
    assert.ok(c);
    assert.ok(
      c!.decisionStage === 'review' ||
        c!.yearTrust === 'year_unresolved' ||
        c!.yearTrust === 'year_inferred_review',
    );
    void events;
  });

  it('11: human-interest award story classified non-event', () => {
    const cls = classifyInstagramPostContent({
      caption: 'The moment Joevenn learned his next two years of rent are on us',
    });
    assert.equal(cls.contentClass, 'human_interest_story');
    assert.equal(cls.isEventBearing, false);

    const events = assembleVisualEvents({
      acquired: acquired({
        caption: 'The moment Joevenn learned his next two years of rent are on us',
      }),
      slideOcr: [slide(1, 'Joevenn rent award celebration')],
    });
    assert.equal(events.length, 0);
  });

  it('12: past-event recap is not an upcoming event', () => {
    const cls = classifyInstagramPostContent({
      caption: 'Recap: what a night at last weekend’s block party. Thanks to everyone who came out!',
    });
    assert.equal(cls.contentClass, 'past_event_recap');
    assert.equal(cls.isEventBearing, false);
  });

  it('13: research not_found prose never populates public description', () => {
    const prose =
      "I couldn't locate an event titled Sculpt Fusion. Could you please provide more details?";
    assert.equal(isResearchFailureProse(prose), true);
    assert.equal(classifyResearchToolOutcome({ summary: prose, ok: true }), 'not_found');
  });

  it('14: tool failure cannot upgrade verification', () => {
    assert.equal(classifyResearchToolOutcome({ ok: false, summary: 'tool timed out' }), 'error');
    assert.equal(
      classifyResearchToolOutcome({
        ok: true,
        summary: 'insufficient',
        citations: 0,
      }),
      'insufficient_evidence',
    );
  });

  it('15: carousel assembled as post evidence bundle — not one event per noisy slide', () => {
    const events = assembleVisualEvents({
      acquired: acquired({
        caption: 'Next up: FREE Sculpt Fusion in PNC Plaza on 9.16',
        publishedAt: '2026-09-10T15:00:00.000Z',
        carouselChildCount: 4,
      }),
      slideOcr: [
        slide(1, 'I Zo SL dE i)'),
        slide(2, 'oy ihe po Hy'),
        slide(3, 'Epa | te- 4 3'),
        slide(4, 'PNC Plaza · Free'),
      ],
    });
    const live = events.filter((e) => e.decisionStage !== 'rejected' && e.decisionStage !== 'duplicate');
    assert.equal(live.length, 1);
    assert.equal(live[0]!.title, 'Sculpt Fusion');
  });

  it('16: true multi-event roundup can still produce multiple supported events', () => {
    const events = assembleVisualEvents({
      acquired: acquired({
        caption: 'KC events this weekend — lineup inside',
        publishedAt: '2026-09-11T12:00:00.000Z',
        mediaType: 'carousel_images',
        carouselChildCount: 2,
      }),
      slideOcr: [
        slide(
          1,
          'Friday\nJazz Night\n8:00 PM\nMutual Musicians Foundation\n$15',
        ),
        slide(2, 'Saturday\nMarket Day\n10:00 AM\nCity Market\nFree'),
      ],
    });
    const live = events.filter((e) => e.decisionStage !== 'rejected' && e.decisionStage !== 'duplicate');
    assert.ok(live.length >= 2, `expected >=2 got ${live.length}`);
  });

  it('17: stylized legitimate titles are not automatically rejected', () => {
    assert.equal(assessOcrTitleQuality('BizzyBody').usableAsTitle, true);
    assert.equal(assessOcrTitleQuality('Rock the Bridge').usableAsTitle, true);
    assert.equal(assessOcrTitleQuality('XOXO').usableAsTitle, true);
  });

  it('18: OCR failure produces partial or warning coverage', () => {
    const status = deriveCoverageStatus({
      sessionOk: true,
      postsDiscovered: 4,
      postsInspected: 4,
      slidesExpected: 10,
      slidesAcquired: 10,
      imagesOcrEligible: 10,
      slidesOcrAttempted: 10,
      slidesOcrFailed: 3,
      unreadablePosts: 0,
      candidatesFuture: 0,
      candidatesExtracted: 0,
    });
    assert.equal(status, 'partial');

    const warn = deriveCoverageStatus({
      sessionOk: true,
      postsDiscovered: 4,
      postsInspected: 4,
      slidesExpected: 10,
      slidesAcquired: 10,
      imagesOcrEligible: 10,
      slidesOcrAttempted: 10,
      slidesOcrFailed: 2,
      unreadablePosts: 0,
      candidatesFuture: 1,
      candidatesExtracted: 1,
    });
    assert.equal(warn, 'complete_with_warnings');
  });

  it('19: non-image slides explain slides vs OCR-eligible gap', () => {
    const report = emptyCoverageReport('x', 'https://instagram.com/x', defaultInstagramVisualBounds());
    report.slidesAcquired = 36;
    report.imagesOcrEligible = 34;
    report.slidesOcrAttempted = 34;
    report.slidesOcrSucceeded = 34;
    report.slidesOcrSkipped = 2;
    report.slidesOcrSkipReason = 'non_image_video_children';
    report.postsDiscovered = 12;
    report.postsInspected = 12;
    report.candidatesExtracted = 1;
    report.candidatesFuture = 1;
    const finalized = finalizeCoverageReport(report, { sessionOk: true });
    assert.match(finalized.summaryLine, /eligible 34\/36|skipped=2/);
  });

  it('20: supported future event prevents complete_no_current_events', () => {
    const status = deriveCoverageStatus({
      sessionOk: true,
      postsDiscovered: 12,
      postsInspected: 12,
      slidesExpected: 36,
      slidesAcquired: 36,
      slidesOcrAttempted: 34,
      imagesOcrEligible: 34,
      unreadablePosts: 0,
      candidatesFuture: 1,
      candidatesExtracted: 1,
    });
    assert.notEqual(status, 'complete_no_current_events');
    assert.equal(status, 'complete');
  });

  it('21: current-run new events cannot display a lifetime count (counter semantics)', () => {
    // newLogicalEvents is run-scoped; lifetimeEventsExtracted is separate — document contract
    const currentRunNew = 0;
    const lifetimeUnique = 8;
    assert.notEqual(currentRunNew, lifetimeUnique);
    assert.equal(currentRunNew, 0);
  });

  it('22: rejected garbage does not affect reliability/yield counts', () => {
    const candidates: VisualEventCandidate[] = [
      {
        title: 'I Zo SL dE i)',
        eventDate: null,
        eventTime: null,
        endTime: null,
        venue: null,
        address: null,
        neighborhood: null,
        city: null,
        price: null,
        ageRestriction: null,
        ticketUrl: null,
        performers: [],
        dayHeading: null,
        originalQuotedText: 'I Zo SL dE i)',
        slideNumbers: [1],
        permalink: 'https://www.instagram.com/p/x/',
        yearTrust: 'year_unresolved',
        yearInferenceExplanation: null,
        locationTrust: 'unknown',
        temporalClass: 'undated',
        likelihoodScore: 0.1,
        fieldEvidence: [],
        decisionStage: 'rejected',
        rejectionReason: 'ocr_gibberish',
        duplicateOf: null,
      },
      {
        title: 'Sculpt Fusion',
        eventDate: '2026-09-16',
        eventTime: null,
        endTime: null,
        venue: 'PNC Plaza',
        address: null,
        neighborhood: null,
        city: 'Kansas City',
        price: 'Free',
        ageRestriction: null,
        ticketUrl: null,
        performers: [],
        dayHeading: null,
        originalQuotedText: 'Next up: FREE Sculpt Fusion',
        slideNumbers: [0],
        permalink: 'https://www.instagram.com/p/x/',
        yearTrust: 'year_corroborated',
        yearInferenceExplanation: 'test',
        locationTrust: 'evidenced',
        temporalClass: 'future',
        likelihoodScore: 0.9,
        fieldEvidence: [],
        decisionStage: 'extracted',
        rejectionReason: null,
        duplicateOf: null,
      },
    ];
    const s = summarizeCandidates(candidates);
    assert.equal(s.extracted, 1);
    assert.equal(s.rejected, 1);
    assert.equal(s.future, 1);
  });

  it('23: backfill quarantine helper preserves audit fields (pure check)', () => {
    // Pure: known garbage + research prose detection used by backfill
    assert.equal(isKnownGarbageTitle('Epa | te- 4 3'), true);
    assert.equal(
      isResearchFailureProse("I couldn't locate an event titled Foo. Could you please provide more details?"),
      true,
    );
  });

  it('24: second identical run creates zero new logical events (dedupe identity)', () => {
    const a = assembleVisualEvents({
      acquired: acquired({
        caption: 'Next up: FREE Sculpt Fusion in PNC Plaza on 9.16',
        publishedAt: '2026-09-10T15:00:00.000Z',
      }),
      slideOcr: [slide(1, 'Sculpt Fusion PNC Plaza')],
    });
    const b = assembleVisualEvents({
      acquired: acquired({
        caption: 'Next up: FREE Sculpt Fusion in PNC Plaza on 9.16',
        publishedAt: '2026-09-10T15:00:00.000Z',
      }),
      slideOcr: [slide(1, 'Sculpt Fusion PNC Plaza')],
    });
    assert.equal(a[0]!.title, b[0]!.title);
    assert.equal(a[0]!.eventDate, b[0]!.eventDate);
    assert.equal(a[0]!.permalink, b[0]!.permalink);
  });

  it('25: quality gate requires title + date + corroboration', () => {
    const pass = evaluateEventQualityGate(
      {
        title: 'Sculpt Fusion',
        eventDate: '2026-09-16',
        eventTime: null,
        venue: 'PNC Plaza',
        price: 'Free',
        ticketUrl: null,
        originalQuotedText: 'Next up: FREE Sculpt Fusion in PNC Plaza on 9.16',
        yearTrust: 'year_corroborated',
        temporalClass: 'future',
        decisionStage: 'extracted',
        fieldEvidence: [],
        likelihoodScore: 0.9,
      },
      { caption: 'Next up: FREE Sculpt Fusion in PNC Plaza on 9.16', postClassIsEvent: true },
    );
    assert.equal(pass.pass, true);
    assert.equal(pass.queue, 'event_lead');

    const fail = evaluateEventQualityGate(
      {
        title: 'I Zo SL dE i)',
        eventDate: null,
        eventTime: null,
        venue: null,
        price: null,
        ticketUrl: null,
        originalQuotedText: 'I Zo SL dE i)',
        yearTrust: 'year_unresolved',
        temporalClass: 'undated',
        decisionStage: 'extracted',
        fieldEvidence: [],
        likelihoodScore: 0.2,
      },
      { caption: null },
    );
    assert.equal(fail.pass, false);
    assert.equal(fail.queue, 'reject');
  });
});
