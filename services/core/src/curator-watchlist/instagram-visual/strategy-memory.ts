/**
 * Strategy memory + change detection for Instagram visual extraction.
 * Detect DOM/payload change, missing carousel children, session expiry,
 * post-count collapse, OCR failure spike, cover-only carousel regression.
 */

import { createHash } from 'node:crypto';
import type {
  InstagramVisualCoverageReport,
  InstagramVisualCoverageStatus,
  InstagramVisualStrategyProfile,
} from './types.js';

export const IG_VISUAL_STRATEGY_VERSION = 1;

export function emptyStrategyProfile(handle: string): InstagramVisualStrategyProfile {
  return {
    profileVersion: IG_VISUAL_STRATEGY_VERSION,
    handle: handle.replace(/^@/, ''),
    acquisitionMethod: 'authenticated_public_grid',
    lastPostEnumerationAt: null,
    lastPostId: null,
    mediaStructureFingerprint: null,
    ocrConfig: 'tesseract.js-local+sharp-preprocess',
    coverageFingerprint: null,
    mediaHashes: [],
    editIndicators: [],
    sessionHealth: null,
    lastStatus: null,
    successCount: 0,
    failureCount: 0,
    consecutivePartialOrFail: 0,
    lastRunAt: null,
  };
}

export function readStrategyProfile(
  config: Record<string, unknown> | null | undefined,
  handle: string,
): InstagramVisualStrategyProfile {
  const raw = config?.instagramVisualStrategy as Partial<InstagramVisualStrategyProfile> | undefined;
  if (!raw || typeof raw !== 'object') return emptyStrategyProfile(handle);
  return {
    ...emptyStrategyProfile(handle),
    ...raw,
    profileVersion: Number(raw.profileVersion ?? IG_VISUAL_STRATEGY_VERSION),
    handle: (raw.handle ?? handle).replace(/^@/, ''),
  };
}

export function coverageFingerprint(report: InstagramVisualCoverageReport): string {
  return createHash('sha256')
    .update(
      [
        report.status,
        report.postsDiscovered,
        report.postsInspected,
        report.slidesExpected,
        report.slidesAcquired,
        report.slidesOcrSucceeded,
        report.candidatesExtracted,
        report.candidatesExpired,
      ].join('|'),
    )
    .digest('hex')
    .slice(0, 16);
}

export function mediaStructureFingerprint(input: {
  postsDiscovered: number;
  carouselCounts: number[];
  reelCount: number;
}): string {
  return createHash('sha256')
    .update(
      `${input.postsDiscovered}|c:${input.carouselCounts.join(',')}|r:${input.reelCount}`,
    )
    .digest('hex')
    .slice(0, 16);
}

export type ChangeDetectionResult = {
  structureChanged: boolean;
  reasons: string[];
};

/**
 * Detect regressions that must not be reported as healthy success.
 */
export function detectVisualStructureChange(input: {
  prior: InstagramVisualStrategyProfile;
  postsDiscovered: number;
  slidesExpected: number;
  slidesAcquired: number;
  carouselsSeen: number;
  slidesOcrAttempted: number;
  slidesOcrSucceeded: number;
  coverOnlyCarouselRegression?: boolean;
  flyerHeavyAccountZeroYield?: boolean;
  sessionExpired?: boolean;
  mediaUrlExpiryCount?: number;
}): ChangeDetectionResult {
  const reasons: string[] = [];

  if (input.sessionExpired) reasons.push('session_expired');

  if (
    input.prior.lastPostEnumerationAt &&
    input.prior.successCount >= 2 &&
    input.postsDiscovered === 0
  ) {
    reasons.push('post_count_collapse');
  }

  if (input.coverOnlyCarouselRegression) {
    reasons.push('cover_only_carousel_regression');
  }

  // Only flag missing children when a single-post gap is severe (not account-level sum noise).
  if (
    input.prior.mediaStructureFingerprint &&
    input.carouselsSeen > 0 &&
    input.slidesExpected >= input.slidesAcquired + 3 &&
    input.slidesAcquired > 0 &&
    input.slidesAcquired / Math.max(1, input.slidesExpected) < 0.5 &&
    input.coverOnlyCarouselRegression
  ) {
    reasons.push('missing_carousel_children');
  }

  if (
    input.slidesOcrAttempted >= 4 &&
    input.slidesOcrSucceeded / Math.max(1, input.slidesOcrAttempted) < 0.25
  ) {
    reasons.push('ocr_failure_spike');
  }

  if ((input.mediaUrlExpiryCount ?? 0) >= 3) {
    reasons.push('media_url_expiry');
  }

  if (input.flyerHeavyAccountZeroYield) {
    reasons.push('zero_yield_on_flyer_heavy_account');
  }

  return { structureChanged: reasons.length > 0, reasons };
}

export function updateStrategyProfile(input: {
  prior: InstagramVisualStrategyProfile;
  status: InstagramVisualCoverageStatus;
  coverage: InstagramVisualCoverageReport;
  lastPostId: string | null;
  mediaHashes: string[];
  sessionHealth: string | null;
  structureFingerprint: string;
}): InstagramVisualStrategyProfile {
  const ok = input.status === 'complete' || input.status === 'complete_no_current_events';
  const partialOrFail =
    input.status === 'partial' ||
    input.status === 'failed' ||
    input.status === 'structure_changed' ||
    input.status === 'blocked' ||
    input.status === 'session_required' ||
    input.status === 'rate_limited';

  return {
    ...input.prior,
    profileVersion: IG_VISUAL_STRATEGY_VERSION,
    lastPostEnumerationAt: new Date().toISOString(),
    lastPostId: input.lastPostId ?? input.prior.lastPostId,
    mediaStructureFingerprint: input.structureFingerprint,
    coverageFingerprint: coverageFingerprint(input.coverage),
    mediaHashes: input.mediaHashes.slice(0, 40),
    sessionHealth: input.sessionHealth,
    lastStatus: input.status,
    successCount: input.prior.successCount + (ok ? 1 : 0),
    failureCount: input.prior.failureCount + (partialOrFail && !ok ? 1 : 0),
    consecutivePartialOrFail: ok ? 0 : input.prior.consecutivePartialOrFail + 1,
    lastRunAt: new Date().toISOString(),
  };
}

export function strategyProfileForConfig(
  profile: InstagramVisualStrategyProfile,
): Record<string, unknown> {
  return { instagramVisualStrategy: profile };
}
