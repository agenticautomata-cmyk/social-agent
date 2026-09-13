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
    slidesOcrAttempted: 0,
    slidesOcrSucceeded: 0,
    slidesOcrCached: 0,
    reelsSeen: 0,
    framesSampled: 0,
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
  slidesOcrAttempted: number;
  unreadablePosts: number;
  candidatesFuture: number;
  candidatesExtracted: number;
  incompleteReason?: string | null;
}): InstagramVisualCoverageStatus {
  if (!input.sessionOk) return 'session_required';
  if (input.blocked) return 'blocked';
  if (input.rateLimited) return 'rate_limited';
  if (input.structureChanged) return 'structure_changed';
  if (input.postsDiscovered <= 0) return 'failed';

  const slideGap = input.slidesExpected > 0 && input.slidesAcquired < input.slidesExpected;
  const ocrGap =
    input.slidesAcquired > 0 && input.slidesOcrAttempted < Math.min(input.slidesAcquired, 1);
  if (slideGap || ocrGap || input.incompleteReason) {
    return 'partial';
  }

  if (
    input.postsInspected > 0 &&
    input.candidatesFuture === 0 &&
    input.candidatesExtracted === 0
  ) {
    return 'complete_no_current_events';
  }

  if (input.postsInspected > 0) return 'complete';
  return 'partial';
}

export function formatCoverageSummary(report: InstagramVisualCoverageReport): string {
  const parts = [
    `status=${report.status}`,
    `posts ${report.postsInspected}/${report.postsDiscovered} inspected`,
    `slides ${report.slidesAcquired}/${report.slidesExpected}`,
    `ocr ${report.slidesOcrSucceeded}/${report.slidesOcrAttempted}` +
      (report.slidesOcrCached ? ` (${report.slidesOcrCached} cached)` : ''),
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
    slidesOcrAttempted: report.slidesOcrAttempted,
    unreadablePosts: report.unreadablePosts,
    candidatesFuture: report.candidatesFuture,
    candidatesExtracted: report.candidatesExtracted,
    incompleteReason: report.incompleteReason,
  });

  const next = {
    ...report,
    status,
    lastFullCoverageAt:
      status === 'complete' || status === 'complete_no_current_events'
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
