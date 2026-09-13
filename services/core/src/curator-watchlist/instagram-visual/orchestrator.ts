/**
 * Account-level Instagram visual event reader orchestrator.
 * One general pipeline — no account-specific production branches.
 */

import { eq } from 'drizzle-orm';
import { db } from '../../db.js';
import { sourceWatchers } from '../../schema.js';
import { fetchInstagramProfilePostsWithContext } from '../instagram-profile-watcher.js';
import {
  closeInstagramSession,
  openInstagramSession,
  pauseWatcherForAuth,
  syncInstagramWatchersWithSharedSession,
} from '../instagram-session.js';
import { createSessionImageFetcher } from '../slide-ocr.js';
import { listKnownInstagramPostKeys, listRecentFingerprints } from '../store.js';
import { extractHandleFromProfileUrl } from '../instagram-page-utils.js';
import { instagramProfileUrl } from '../instagram-url.js';
import { defaultInstagramVisualBounds } from './bounds.js';
import {
  coverageStatusToHealthStatus,
  emptyCoverageReport,
  finalizeCoverageReport,
  summarizeCandidates,
} from './coverage.js';
import { processPostVisualEvents } from './process-post.js';
import {
  detectVisualStructureChange,
  mediaStructureFingerprint,
  readStrategyProfile,
  strategyProfileForConfig,
  updateStrategyProfile,
} from './strategy-memory.js';
import type {
  InstagramVisualBounds,
  InstagramVisualRunResult,
  VisualEventCandidate,
} from './types.js';
import { cleanupExpiredTempMedia } from './cache.js';

export async function runInstagramVisualEventReader(input: {
  watcherId: string;
  specificPostUrl?: string;
  force?: boolean;
  bounds?: Partial<InstagramVisualBounds>;
  /** Fixture OCR keyed by post URL shortcode or index — tests only. */
  fixtureOcrByPost?: Record<string, string[]>;
}): Promise<InstagramVisualRunResult> {
  await syncInstagramWatchersWithSharedSession();
  cleanupExpiredTempMedia(14);

  const [watcher] = await db
    .select()
    .from(sourceWatchers)
    .where(eq(sourceWatchers.id, input.watcherId))
    .limit(1);

  const bounds = defaultInstagramVisualBounds(input.bounds);
  const handle = watcher
    ? extractHandleFromProfileUrl(watcher.sourceUrl)
    : 'unknown';
  const profileUrl = watcher?.sourceUrl ?? instagramProfileUrl(handle);
  const prior = readStrategyProfile(
    (watcher?.config as Record<string, unknown> | null) ?? null,
    handle,
  );

  let coverage = emptyCoverageReport(handle, profileUrl, bounds);
  const allCandidates: VisualEventCandidate[] = [];
  const acquiredList: InstagramVisualRunResult['acquired'] = [];
  let mutatedWrites = 0;

  if (!watcher) {
    coverage = finalizeCoverageReport(
      { ...coverage, incompleteReason: 'watcher_not_found' },
      { sessionOk: false },
    );
    return {
      ok: false,
      coverage,
      candidates: [],
      acquired: [],
      strategyProfile: prior,
      mutatedWrites: 0,
    };
  }

  const started = Date.now();
  const { ctx, status, sanitizedFailure } = await openInstagramSession();
  if (!ctx) {
    const sessionRequired =
      status === 'login_required' || status === 'captcha_blocked' || status === 'consent_required';
    if (sessionRequired) {
      await pauseWatcherForAuth(input.watcherId, sanitizedFailure ?? status);
    }
    coverage = finalizeCoverageReport(
      {
        ...coverage,
        incompleteReason: sanitizedFailure ?? status,
      },
      {
        sessionOk: false,
        blocked: status === 'captcha_blocked',
      },
    );
    const profile = updateStrategyProfile({
      prior,
      status: coverage.status,
      coverage,
      lastPostId: null,
      mediaHashes: [],
      sessionHealth: status,
      structureFingerprint: prior.mediaStructureFingerprint ?? 'none',
    });
    await persistStrategy(input.watcherId, watcher.config, profile, coverage);
    return {
      ok: false,
      coverage,
      candidates: [],
      acquired: [],
      strategyProfile: profile,
      mutatedWrites: 0,
    };
  }

  const lastSeen = input.force ? [] : await listRecentFingerprints(input.watcherId);
  const knownPostKeys = input.force
    ? new Set<string>()
    : await listKnownInstagramPostKeys(input.watcherId);

  try {
    const fetch = await fetchInstagramProfilePostsWithContext(ctx, {
      profileUrl: watcher.sourceUrl,
      lastSeenFingerprints: lastSeen,
      knownPostKeys,
      specificPostUrl: input.specificPostUrl,
      maxPosts: bounds.maxPosts,
      maxCarouselSlides: bounds.maxCarouselSlides,
      pageWaitUntil: 'domcontentloaded',
    });

    coverage.postsDiscovered = fetch.inspection.postsDiscovered;
    coverage.postsSkipped = fetch.inspection.alreadyKnown + fetch.inspection.skipped.length;
    coverage.postsFailed = fetch.inspection.failed.length;

    if (fetch.pausedForAuth) {
      await pauseWatcherForAuth(input.watcherId, fetch.error ?? 'Instagram login required');
      coverage = finalizeCoverageReport(
        { ...coverage, incompleteReason: fetch.error ?? 'session_required' },
        { sessionOk: false },
      );
      const profile = updateStrategyProfile({
        prior,
        status: coverage.status,
        coverage,
        lastPostId: null,
        mediaHashes: [],
        sessionHealth: 'login_required',
        structureFingerprint: prior.mediaStructureFingerprint ?? 'none',
      });
      await persistStrategy(input.watcherId, watcher.config, profile, coverage);
      return {
        ok: false,
        coverage,
        candidates: [],
        acquired: [],
        strategyProfile: profile,
        mutatedWrites: 0,
      };
    }

    const imageFetcher = createSessionImageFetcher(ctx.page);
    const carouselCounts: number[] = [];
    let reelCount = 0;
    const mediaHashes: string[] = [];
    let coverOnlyRegression = false;

    for (const post of fetch.posts) {
      if (Date.now() - started > bounds.runTimeoutMs) {
        coverage.incompleteReason = 'run_timeout';
        break;
      }

      // Age bound
      if (post.publishedAt && bounds.maxPostAgeDays > 0) {
        const ageMs = Date.now() - Date.parse(post.publishedAt);
        if (ageMs > bounds.maxPostAgeDays * 24 * 60 * 60 * 1000) {
          coverage.postsSkipped += 1;
          coverage.postNotes.push({
            permalink: post.postUrl,
            shortcode: post.postUrl,
            mediaType: post.mediaType ?? post.postType,
            slidesExpected: 0,
            slidesAcquired: 0,
            ocrOk: 0,
            candidates: 0,
            note: 'skipped_max_age',
          });
          continue;
        }
      }

      const fixtureKey =
        input.fixtureOcrByPost?.[post.postUrl] ??
        input.fixtureOcrByPost?.[post.postUrl.replace(/\/$/, '')];

      const result = await processPostVisualEvents({
        post,
        fetchImage: imageFetcher,
        bounds,
        fixtureOcrTexts: fixtureKey,
        notPreviouslyInspected: true,
      });

      coverage.postsInspected += 1;
      coverage.slidesExpected += result.slidesExpected;
      coverage.slidesAcquired += result.slidesAcquired;
      coverage.slidesOcrAttempted += result.ocrAttempted;
      coverage.slidesOcrSucceeded += result.ocrSucceeded;
      coverage.slidesOcrCached += result.ocrCached;
      coverage.framesSampled += result.framesSampled;
      coverage.visionEscalations += result.visionEscalations;
      coverage.visionCostLoggedUsd += result.visionCostUsd;
      mediaHashes.push(...result.perceptualHashes);

      if (result.slidesExpected > 1) {
        coverage.carouselsSeen += 1;
        carouselCounts.push(result.slidesExpected);
        if (result.slidesAcquired <= 1 && result.slidesExpected >= 3) {
          coverOnlyRegression = true;
        }
      }
      if (post.mediaType === 'reel' || post.postType === 'reel') {
        coverage.reelsSeen += 1;
        reelCount += 1;
      }
      coverage.imagesAcquired += result.slidesAcquired;
      if (result.likelihoodScore >= 0.45) coverage.likelyEventPosts += 1;
      if (result.unreadable) coverage.unreadablePosts += 1;

      if (result.acquired) acquiredList.push(result.acquired);
      allCandidates.push(...result.candidates);

      coverage.postNotes.push({
        permalink: result.acquired?.permalink ?? post.postUrl,
        shortcode: result.acquired?.shortcode ?? 'unknown',
        mediaType: result.acquired?.mediaType ?? post.postType,
        slidesExpected: result.slidesExpected,
        slidesAcquired: result.slidesAcquired,
        ocrOk: result.ocrSucceeded,
        candidates: result.candidates.filter((c) => c.decisionStage !== 'duplicate').length,
        note: result.note,
      });
    }

    // Also count already-known as inspected for coverage honesty when force=false
    if (fetch.inspection.alreadyKnown > 0 && fetch.posts.length === 0) {
      coverage.postsInspected = Math.max(coverage.postsInspected, 0);
      // Discovery succeeded; no new posts to visually re-read
      if (!coverage.incompleteReason) {
        coverage.incompleteReason = null;
      }
    }

    const summary = summarizeCandidates(allCandidates);
    coverage.candidatesExtracted = summary.extracted;
    coverage.candidatesFuture = summary.future;
    coverage.candidatesExpired = summary.expired;
    coverage.candidatesReview = summary.review;
    coverage.candidatesRejected = summary.rejected;
    coverage.duplicatesSkipped = summary.duplicates;

    if (
      coverage.slidesExpected > coverage.slidesAcquired &&
      coverage.carouselsSeen > 0 &&
      !coverage.incompleteReason
    ) {
      coverage.incompleteReason = `carousel_slides_incomplete ${coverage.slidesAcquired}/${coverage.slidesExpected}`;
    }

    const structureFp = mediaStructureFingerprint({
      postsDiscovered: coverage.postsDiscovered,
      carouselCounts,
      reelCount,
    });

    const change = detectVisualStructureChange({
      prior,
      postsDiscovered: coverage.postsDiscovered,
      slidesExpected: coverage.slidesExpected,
      slidesAcquired: coverage.slidesAcquired,
      carouselsSeen: coverage.carouselsSeen,
      slidesOcrAttempted: coverage.slidesOcrAttempted,
      slidesOcrSucceeded: coverage.slidesOcrSucceeded,
      coverOnlyCarouselRegression: coverOnlyRegression,
      flyerHeavyAccountZeroYield:
        coverage.likelyEventPosts >= 2 &&
        coverage.candidatesExtracted === 0 &&
        coverage.candidatesReview === 0 &&
        coverage.slidesOcrSucceeded === 0,
    });

    coverage = finalizeCoverageReport(coverage, {
      sessionOk: true,
      structureChanged: change.structureChanged,
    });
    if (change.structureChanged && change.reasons.length) {
      coverage.incompleteReason = [
        coverage.incompleteReason,
        `structure:${change.reasons.join(',')}`,
      ]
        .filter(Boolean)
        .join('; ');
      coverage = finalizeCoverageReport(coverage, {
        sessionOk: true,
        structureChanged: true,
      });
    }

    const lastPostId = acquiredList[0]?.shortcode ?? null;
    const profile = updateStrategyProfile({
      prior,
      status: coverage.status,
      coverage,
      lastPostId,
      mediaHashes,
      sessionHealth: 'ready',
      structureFingerprint: structureFp,
    });

    const health = coverageStatusToHealthStatus(coverage.status);
    const config = {
      ...((watcher.config as Record<string, unknown>) ?? {}),
      ...strategyProfileForConfig(profile),
      lastInstagramVisualCoverage: {
        status: coverage.status,
        summaryLine: coverage.summaryLine,
        at: new Date().toISOString(),
        postsInspected: coverage.postsInspected,
        slidesAcquired: coverage.slidesAcquired,
        slidesExpected: coverage.slidesExpected,
        candidatesExtracted: coverage.candidatesExtracted,
        candidatesExpired: coverage.candidatesExpired,
        candidatesReview: coverage.candidatesReview,
      },
    };

    await db
      .update(sourceWatchers)
      .set({
        config,
        healthStatus: health,
        sessionStatus: 'ready',
        lastSuccessfulCheck:
          coverage.status === 'complete' ||
          coverage.status === 'complete_no_current_events' ||
          coverage.status === 'partial'
            ? new Date()
            : watcher.lastSuccessfulCheck,
        lastFailureAt:
          coverage.status === 'failed' || coverage.status === 'blocked'
            ? new Date()
            : null,
        lastFailureMessage:
          coverage.status === 'failed' || coverage.status === 'blocked'
            ? (coverage.incompleteReason ?? coverage.summaryLine).slice(0, 500)
            : null,
        lastNewItemDetected:
          summary.extracted > 0 || summary.review > 0 ? new Date() : watcher.lastNewItemDetected,
        updatedAt: new Date(),
      })
      .where(eq(sourceWatchers.id, input.watcherId));
    mutatedWrites += 1;

    return {
      ok:
        coverage.status === 'complete' ||
        coverage.status === 'complete_no_current_events' ||
        coverage.status === 'partial',
      coverage,
      candidates: allCandidates,
      acquired: acquiredList,
      strategyProfile: profile,
      mutatedWrites,
    };
  } finally {
    await closeInstagramSession(ctx);
  }
}

async function persistStrategy(
  watcherId: string,
  priorConfig: unknown,
  profile: InstagramVisualRunResult['strategyProfile'],
  coverage: InstagramVisualRunResult['coverage'],
): Promise<void> {
  const health = coverageStatusToHealthStatus(coverage.status);
  await db
    .update(sourceWatchers)
    .set({
      config: {
        ...((priorConfig as Record<string, unknown>) ?? {}),
        ...strategyProfileForConfig(profile),
        lastInstagramVisualCoverage: {
          status: coverage.status,
          summaryLine: coverage.summaryLine,
          at: new Date().toISOString(),
        },
      },
      healthStatus: health,
      lastFailureAt: new Date(),
      lastFailureMessage: (coverage.incompleteReason ?? coverage.summaryLine).slice(0, 500),
      updatedAt: new Date(),
    })
    .where(eq(sourceWatchers.id, watcherId));
}
