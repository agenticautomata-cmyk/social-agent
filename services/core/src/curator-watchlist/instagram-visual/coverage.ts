/**
 * Concrete Instagram visual coverage reporting.
 * Replaces vague "produced usable records" with countable inspection metrics.
 * Healthy must not conceal incomplete carousel/image coverage.
 */

import type {
  InstagramVisualBounds,
  InstagramVisualCoverageReport,
  InstagramVisualCoverageStatus,
  VisualEventCandidate,
} from './types.js';

export function emptyCoverageReport(
  handle: string,
  profileUrl: string,
  bounds: InstagramVisualBounds,
): InstagramVisualCoverageReport {
  return {
    status: 'failed',
    handle,
    profileUrl,
    postsDiscovered: 0,
    postsInspected: 0,
    postsSkipped: 0,
    postsFailed: 0,
    imagesAcquired: 0,
    carouselsSeen: 0,
    slidesExpected: 0,
    slidesAcquired: 0,
    imagesOcrEligible: 0,
    slidesOcrAttempted: 0,
    slidesOcrSucceeded: 0,
    slidesOcrFailed: 0,
    slidesOcrSkipped: 0,
    slidesOcrSkipReason: null,
    slidesOcrCached: 0,
    reelsSeen: 0,
    videoMediaAcquired: 0,
    framesSampled: 0,
    framesAttempted: 0,
    framesCompleted: 0,
    likelyEventPosts: 0,
    candidatesExtracted: 0,
    candidatesFuture: 0,
    candidatesExpired: 0,
    candidatesReview: 0,
    candidatesRejected: 0,
    duplicatesSkipped: 0,
    unreadablePosts: 0,
    incompleteReason: null,
    lastFullCoverageAt: null,
    visionEscalations: 0,
    visionCostLoggedUsd: 0,
    bounds,
    postNotes: [],
    summaryLine: '',
  };
}

export function summarizeCandidates(candidates: VisualEventCandidate[]): {
  extracted: number;
  future: number;
  expired: number;
  review: number;
  rejected: number;
  duplicates: number;
} {
  let extracted = 0;
  let future = 0;
  let expired = 0;
  let review = 0;
  let rejected = 0;
  let duplicates = 0;
  for (const c of candidates) {
    if (c.decisionStage === 'duplicate') {
      duplicates += 1;
      continue;
    }
    if (c.decisionStage === 'rejected') {
      rejected += 1;
      if (c.temporalClass === 'expired' || c.rejectionReason === 'expired') expired += 1;
      continue;
    }
    if (c.decisionStage === 'review') {
      review += 1;
      // Review future candidates still count as current/supported when dated
      if (c.temporalClass === 'future' || (c.eventDate && c.temporalClass === 'review')) {
        future += 1;
      }
      continue;
    }
    extracted += 1;
    if (c.temporalClass === 'future') future += 1;
    else if (c.temporalClass === 'expired') expired += 1;
  }
  return { extracted, future, expired, review, rejected, duplicates };
}

export function deriveCoverageStatus(input: {
  sessionOk: boolean;
  rateLimited?: boolean;
  blocked?: boolean;
  structureChanged?: boolean;
  postsDiscovered: number;
  postsInspected: number;
  slidesExpected: number;
  slidesAcquired: number;
  imagesOcrEligible?: number;
  slidesOcrAttempted: number;
  slidesOcrFailed?: number;
  unreadablePosts: number;
  candidatesFuture: number;
  candidatesExtracted: number;
  candidatesReview?: number;
  incompleteReason?: string | null;
}): InstagramVisualCoverageStatus {
  if (!input.sessionOk) return 'session_required';
  if (input.blocked) return 'blocked';
  if (input.rateLimited) return 'rate_limited';
  if (input.structureChanged) return 'structure_changed';
  if (input.postsDiscovered <= 0) return 'failed';

  const slideGap = input.slidesExpected > 0 && input.slidesAcquired < input.slidesExpected;
  const ocrEligible = input.imagesOcrEligible ?? input.slidesAcquired;
  const ocrGap =
    ocrEligible > 0 && input.slidesOcrAttempted < Math.min(ocrEligible, 1);
  const ocrFailures = (input.slidesOcrFailed ?? 0) > 0;

  if (slideGap || (ocrGap && !input.incompleteReason?.includes('non_image'))) {
    if (input.incompleteReason) return 'partial';
    return 'partial';
  }

  // Supported future events (extracted or dated review) prevent complete_no_current_events
  const hasSupportedFuture = input.candidatesFuture > 0 || input.candidatesExtracted > 0;

  if (ocrFailures && hasSupportedFuture) {
    return 'complete_with_warnings';
  }
  if (ocrFailures && !hasSupportedFuture) {
    return 'partial';
  }

  if (input.incompleteReason && hasSupportedFuture) {
    return 'complete_with_warnings';
  }
  if (input.incompleteReason) {
    return 'partial';
  }

  if (input.postsInspected > 0 && !hasSupportedFuture) {
    return 'complete_no_current_events';
  }

  if (input.postsInspected > 0) return 'complete';
  return 'partial';
}

export function formatCoverageSummary(report: InstagramVisualCoverageReport): string {
  const ocrEligible = report.imagesOcrEligible || report.slidesOcrAttempted;
  const parts = [
    `status=${report.status}`,
    `posts ${report.postsInspected}/${report.postsDiscovered} inspected`,
    `slides ${report.slidesAcquired}/${report.slidesExpected}`,
    `ocr ${report.slidesOcrSucceeded}/${report.slidesOcrAttempted}` +
      (ocrEligible && ocrEligible !== report.slidesAcquired
        ? ` (eligible ${ocrEligible}/${report.slidesAcquired})`
        : '') +
      (report.slidesOcrCached ? ` (${report.slidesOcrCached} cached)` : '') +
      (report.slidesOcrSkipped
        ? ` skipped=${report.slidesOcrSkipped}${report.slidesOcrSkipReason ? `:${report.slidesOcrSkipReason}` : ''}`
        : ''),
    `candidates ${report.candidatesExtracted} future=${report.candidatesFuture} expired=${report.candidatesExpired} review=${report.candidatesReview}`,
  ];
  if (report.duplicatesSkipped) parts.push(`dupes ${report.duplicatesSkipped}`);
  if (report.incompleteReason) parts.push(`incomplete: ${report.incompleteReason}`);
  return parts.join(' · ');
}

export function finalizeCoverageReport(
  report: InstagramVisualCoverageReport,
  opts?: {
    sessionOk?: boolean;
    rateLimited?: boolean;
    blocked?: boolean;
    structureChanged?: boolean;
  },
): InstagramVisualCoverageReport {
  const status = deriveCoverageStatus({
    sessionOk: opts?.sessionOk ?? true,
    rateLimited: opts?.rateLimited,
    blocked: opts?.blocked,
    structureChanged: opts?.structureChanged,
    postsDiscovered: report.postsDiscovered,
    postsInspected: report.postsInspected,
    slidesExpected: report.slidesExpected,
    slidesAcquired: report.slidesAcquired,
    imagesOcrEligible: report.imagesOcrEligible,
    slidesOcrAttempted: report.slidesOcrAttempted,
    slidesOcrFailed: report.slidesOcrFailed,
    unreadablePosts: report.unreadablePosts,
    candidatesFuture: report.candidatesFuture,
    candidatesExtracted: report.candidatesExtracted,
    candidatesReview: report.candidatesReview,
    incompleteReason: report.incompleteReason,
  });

  const next = {
    ...report,
    status,
    lastFullCoverageAt:
      status === 'complete' ||
      status === 'complete_no_current_events' ||
      status === 'complete_with_warnings'
        ? new Date().toISOString()
        : report.lastFullCoverageAt,
  };
  next.summaryLine = formatCoverageSummary(next);
  return next;
}

/**
 * Map visual coverage status → Watchlist health_status storage value.
 * Never map incomplete carousel coverage to healthy.
 */
export function coverageStatusToHealthStatus(
  status: InstagramVisualCoverageStatus,
): 'healthy' | 'no_change' | 'degraded' | 'failed' | 'blocked' | 'login_required' | 'no_yield' {
  switch (status) {
    case 'complete':
    case 'complete_with_warnings':
      return 'healthy';
    case 'complete_no_current_events':
      return 'no_change';
    case 'partial':
    case 'structure_changed':
      return 'degraded';
    case 'session_required':
      return 'login_required';
    case 'blocked':
    case 'rate_limited':
      return 'blocked';
    case 'failed':
    default:
      return 'failed';
  }
}
