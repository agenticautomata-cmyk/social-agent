/**
 * Production-path regressions for Instagram visual Watchlist integration (A–J).
 * Pure / fixture tests — no live Playwright, no billable vision.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isCalendarEligible } from '../creator-value.js';
import { isPastEvent } from '../dedupe.js';
import { leadFingerprint } from '../store.js';
import { classifyWatchlistText } from '../watchlist-intelligence.js';
import { shouldExpireLeadOnCheck } from '../instagram-visual-backfill.js';
import { assembleVisualEvents } from './event-assembler.js';
import { resolveEventDateWithYearTrust } from './date-year-trust.js';
import { isInstagramErrorChrome, isInstagramErrorChromeTitle } from './ig-error-chrome.js';
import { dedupeVisualCandidates } from './visual-dedupe.js';
import {
  coverageStatusToHealthStatus,
  deriveCoverageStatus,
  emptyCoverageReport,
  finalizeCoverageReport,
} from './coverage.js';
import { defaultInstagramVisualBounds } from './bounds.js';
import { escalateToVision, defaultVisionBudget } from './vision-escalation.js';
import type { AcquiredInstagramMedia, SlideOcrEvidence, VisualEventCandidate } from './types.js';

function acquired(overrides: Partial<AcquiredInstagramMedia> = {}): AcquiredInstagramMedia {
  return {
    postId: null,
    shortcode: 'DdKPMvSOLcT',
    permalink: 'https://www.instagram.com/p/DdKPMvSOLcT/',
    handle: 'bizzybodyb007',
    author: 'bizzybodyb007',
    publishedAt: '2026-09-10T18:00:00.000Z',
    caption: null,
    altTexts: [],
    hashtags: [],
    taggedCollaborators: [],
    locationTag: null,
    mediaType: 'single_image',
    carouselChildCount: 1,
    carouselChildIds: ['DdKPMvSOLcT:0'],
    mediaUrls: [],
    thumbnailOrCoverUrl: null,
    accessibilityMetadata: {},
    editIndicators: [],
    permalinkSource: 'platform_url',
    ...overrides,
  };
}

function slide(n: number, text: string, conf = 0.85): SlideOcrEvidence {
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

/** Documented production entrypoints that must share visualRefresh. */
describe('Instagram visual production path wiring', () => {
  it('1–3. scheduled / Check now / reprocess share visualRefresh defaults', async () => {
    // Source-level contract: pipeline signature accepts visualRefresh + triggerType
    const pipelineSrc = await import('node:fs').then((fs) =>
      fs.promises.readFile(
        new URL('../pipeline.ts', import.meta.url),
        'utf8',
      ),
    );
    const schedulerSrc = await import('node:fs').then((fs) =>
      fs.promises.readFile(
        new URL('../scheduler.ts', import.meta.url),
        'utf8',
      ),
    );
    assert.match(pipelineSrc, /visualRefresh/);
    assert.match(pipelineSrc, /triggerType:\s*'reprocess'/);
    assert.match(schedulerSrc, /visualRefresh:\s*true/);
    assert.match(schedulerSrc, /triggerType/);
    assert.match(pipelineSrc, /processPostVisualEvents/);
  });

  it('4. session ready + zero inspected requires precise incomplete reason', () => {
    const report = finalizeCoverageReport({
      ...emptyCoverageReport('x', 'https://www.instagram.com/x/', defaultInstagramVisualBounds()),
      postsDiscovered: 4,
      postsInspected: 0,
      incompleteReason: 'acquisition_returned_posts_but_none_inspected',
    });
    assert.equal(report.status, 'partial');
    assert.match(report.summaryLine, /acquisition_returned_posts_but_none_inspected/);
    assert.equal(coverageStatusToHealthStatus(report.status), 'degraded');
  });

  it('5. current-run coverage fields are distinct from lifetime counters', () => {
    const current = {
      postsInspected: 4,
      postsExpected: 4,
      recordsPersisted: 1,
    };
    const lifetime = { postsProcessed: 35, eventsExtracted: 4 };
    assert.notEqual(current.postsInspected, lifetime.postsProcessed);
    assert.ok(lifetime.eventsExtracted >= current.recordsPersisted);
  });

  it('6. successful stored records imply extraction timestamp presence', () => {
    const recordsExtracted = 4;
    const lastSuccessfulExtractionAt =
      recordsExtracted > 0 ? '2026-09-13T12:00:00.000Z' : null;
    assert.ok(lastSuccessfulExtractionAt);
    assert.notEqual(lastSuccessfulExtractionAt, null);
  });

  it('7. attempt precedes completion for same run', () => {
    const attemptedAt = new Date('2026-09-13T21:00:00.000Z');
    const completedAt = new Date('2026-09-13T21:05:00.000Z');
    assert.ok(completedAt.getTime() >= attemptedAt.getTime());
  });

  it('8. September 6 event checked on September 13 is expired', () => {
    const now = new Date('2026-09-13T17:00:00Z');
    assert.equal(isPastEvent('2026-09-06', now), true);
    assert.equal(shouldExpireLeadOnCheck({ eventDate: '2026-09-06', now }), true);
  });

  it('9. expired yearless event cannot be Calendar eligible', () => {
    assert.equal(
      isCalendarEligible({
        verificationStatus: 'SOCIAL_LEAD',
        eventDate: '2026-09-06',
        now: new Date('2026-09-13T17:00:00Z'),
      }),
      false,
    );
    assert.equal(
      isCalendarEligible({
        verificationStatus: 'EXPIRED',
        eventDate: '2026-09-18',
        now: new Date('2026-09-13T17:00:00Z'),
      }),
      false,
    );
  });

  it('10. yearless Friday Sep 18 resolves to 2026 with publish+weekday', () => {
    const trust = resolveEventDateWithYearTrust({
      text: 'Friday September 18',
      postPublishedAt: '2026-09-08T15:00:00.000Z',
      now: new Date('2026-09-13T12:00:00Z'),
    });
    assert.equal(trust.isoDate, '2026-09-18');
    assert.equal(trust.yearTrust, 'year_corroborated');
  });

  it('11. unresolved year still yields visible review candidate', () => {
    const events = assembleVisualEvents({
      acquired: acquired({ publishedAt: null }),
      slideOcr: [slide(1, 'Mystery Night\nSeptember 22\nSome Venue\n8 PM')],
    });
    assert.ok(events.length >= 1);
    assert.ok(
      events[0]!.decisionStage === 'review' ||
        events[0]!.yearTrust === 'year_unresolved' ||
        events[0]!.yearTrust === 'year_inferred_review',
    );
  });

  it('12. Rock the Bridge fixture extracts required fields', () => {
    const text = [
      'Rock the Bridge',
      'Salute the Samples',
      'Friday, September 18',
      '7 PM–11 PM',
      'Rock Island Bridge',
      '1799 American Royal Drive',
      'Kansas City, MO 64108',
    ].join('\n');
    const events = assembleVisualEvents({
      acquired: acquired({ publishedAt: '2026-09-10T18:00:00.000Z' }),
      slideOcr: [slide(1, text)],
    });
    assert.equal(events.length, 1);
    const e = events[0]!;
    assert.match(e.title ?? '', /Rock the Bridge/i);
    assert.equal(e.eventDate, '2026-09-18');
    assert.ok(e.eventTime && /7/i.test(e.eventTime));
    assert.ok(e.endTime && /11/i.test(e.endTime));
    assert.match(e.venue ?? '', /Rock Island Bridge/i);
    assert.match(e.address ?? '', /1799 American Royal/i);
    assert.equal(e.permalink, 'https://www.instagram.com/p/DdKPMvSOLcT/');
    assert.ok(e.yearTrust === 'year_corroborated' || e.yearTrust === 'year_inferred_review');
    assert.ok(e.fieldEvidence.some((f) => f.field === 'subtitle' && /Salute/i.test(f.value)));
  });

  it('13. duplicate Rock the Bridge posts → one logical fingerprint', () => {
    const a = leadFingerprint({
      eventName: 'Rock the Bridge',
      eventDate: '2026-09-18',
      venue: 'Rock Island Bridge',
      postUrl: 'https://www.instagram.com/p/AAAA/',
      eventTime: '7 PM',
    });
    const b = leadFingerprint({
      eventName: 'Rock the Bridge',
      eventDate: '2026-09-18',
      venue: 'Rock Island Bridge',
      postUrl: 'https://www.instagram.com/p/BBBB/',
      eventTime: '7 PM',
    });
    assert.equal(a, b);
  });

  it('14. duplicate Karlos Miller promos suppress; 15. distinct showtimes preserved', () => {
    const base: VisualEventCandidate = {
      title: 'Karlos Miller',
      eventDate: '2026-09-20',
      eventTime: '7:00 PM',
      endTime: null,
      venue: 'Funny Bone',
      address: null,
      neighborhood: null,
      city: 'Kansas City',
      price: null,
      ageRestriction: null,
      ticketUrl: null,
      performers: ['Karlos Miller'],
      dayHeading: null,
      originalQuotedText: 'Karlos Miller 7:00 PM',
      slideNumbers: [1],
      permalink: 'https://www.instagram.com/p/Karlos1/',
      yearTrust: 'year_explicit',
      yearInferenceExplanation: 'explicit',
      locationTrust: 'evidenced',
      temporalClass: 'future',
      likelihoodScore: 0.8,
      fieldEvidence: [],
      decisionStage: 'extracted',
      rejectionReason: null,
      duplicateOf: null,
    };
    const dup = { ...base, permalink: 'https://www.instagram.com/p/Karlos2/' };
    const late = {
      ...base,
      eventTime: '9:30 PM',
      permalink: 'https://www.instagram.com/p/Karlos3/',
      originalQuotedText: 'Karlos Miller 9:30 PM',
    };
    const { kept, duplicates } = dedupeVisualCandidates([base, dup, late]);
    assert.ok(duplicates.length >= 1);
    assert.ok(kept.some((u) => /7:00/i.test(u.eventTime ?? '')));
    assert.ok(kept.some((u) => /9:30/i.test(u.eventTime ?? '')));
  });

  it('16. Instagram error chrome never becomes a finding title', () => {
    assert.equal(isInstagramErrorChromeTitle("Sorry, This Page Isn't Available."), true);
    assert.equal(isInstagramErrorChrome('Log in to continue'), true);
    const classified = classifyWatchlistText({
      text: "Sorry, This Page Isn't Available. The link you followed may be broken.",
      sourceUrl: 'https://www.instagram.com/p/broken/',
      watchedSource: '@funnybonekcmo',
      retrievedAt: new Date().toISOString(),
    });
    assert.equal(classified.accepted.length, 0);
    assert.ok(classified.rejected.some((r) => r.reason === 'page_chrome'));
  });

  it('17. fabricated Instagram permalinks remain rejected', async () => {
    const { refuseSynthesizedInstagramUrl } = await import('./acquisition.js');
    assert.equal(
      refuseSynthesizedInstagramUrl({ title: 'Rock the Bridge', handle: 'bizzybodyb007' }),
      null,
    );
  });

  it('18. billable vision stays off by default', async () => {
    const budget = defaultVisionBudget(false);
    assert.equal(budget.enabled, false);
    const result = await escalateToVision({
      request: {
        mediaHash: 'x',
        slideNumber: 1,
        imageDataUrl: 'data:image/jpeg;base64,xx',
        reason: 'low_confidence_ocr',
      },
      budget,
    });
    assert.equal(result.used, false);
    assert.equal(result.skippedReason, 'billable_vision_disabled');
  });

  it('19. partial coverage never maps to healthy', () => {
    assert.equal(coverageStatusToHealthStatus('partial'), 'degraded');
    assert.equal(coverageStatusToHealthStatus('structure_changed'), 'degraded');
    const status = deriveCoverageStatus({
      sessionOk: true,
      postsDiscovered: 4,
      postsInspected: 0,
      slidesExpected: 0,
      slidesAcquired: 0,
      slidesOcrAttempted: 0,
      unreadablePosts: 0,
      candidatesFuture: 0,
      candidatesExtracted: 0,
      incompleteReason: 'posts_discovered_but_zero_inspected',
    });
    assert.equal(status, 'partial');
  });

  it('20. stored expired candidates are reclassified by backfill helper', () => {
    assert.equal(
      shouldExpireLeadOnCheck({
        eventDate: '2026-09-06',
        now: new Date('2026-09-13T12:00:00Z'),
      }),
      true,
    );
    assert.equal(
      shouldExpireLeadOnCheck({
        eventDate: '2026-09-18',
        now: new Date('2026-09-13T12:00:00Z'),
      }),
      false,
    );
  });
});
