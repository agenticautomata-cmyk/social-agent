/** Inspection accounting for one Instagram Watchlist run. Pure — no Playwright. */

export type InstagramWatchSkip = { url: string; reason: string };
export type InstagramWatchFailure = { url: string; reason: string };

export type InstagramWatchInspection = {
  profileOpened: boolean;
  postsDiscovered: number;
  alreadyKnown: number;
  newlyInspected: number;
  extracted: number;
  skipped: InstagramWatchSkip[];
  failed: InstagramWatchFailure[];
  /** Visual coverage fields — optional for backward compatibility. */
  slidesExpected?: number;
  slidesAcquired?: number;
  slidesOcrSucceeded?: number;
  carouselsSeen?: number;
  candidatesExpired?: number;
  candidatesReview?: number;
  coverageStatus?: string | null;
  incompleteReason?: string | null;
};

export function emptyInstagramWatchInspection(
  overrides?: Partial<InstagramWatchInspection>,
): InstagramWatchInspection {
  return {
    profileOpened: false,
    postsDiscovered: 0,
    alreadyKnown: 0,
    newlyInspected: 0,
    extracted: 0,
    skipped: [],
    failed: [],
    ...overrides,
  };
}

export function formatInstagramWatchInspectionSummary(
  inspection: InstagramWatchInspection,
  error?: string | null,
): string {
  if (!inspection.profileOpened) {
    return error?.trim() || 'Could not open the Instagram profile';
  }
  if (inspection.postsDiscovered === 0) {
    return error?.trim() || 'Opened the profile but found no recent posts to inspect';
  }
  const failed = inspection.failed.length;
  const extraSkipped = inspection.skipped.filter((s) => s.reason !== 'already_processed').length;
  let line = `Checked ${inspection.postsDiscovered} recent posts · ${inspection.alreadyKnown} already processed · ${inspection.newlyInspected} new`;
  if (failed > 0) line += ` · ${failed} failed`;
  if (extraSkipped > 0) line += ` · ${extraSkipped} skipped`;
  if (
    inspection.slidesExpected != null &&
    inspection.slidesAcquired != null &&
    inspection.slidesExpected > 0
  ) {
    line += ` · slides ${inspection.slidesAcquired}/${inspection.slidesExpected}`;
  }
  if (inspection.slidesOcrSucceeded != null) {
    line += ` · ocr ${inspection.slidesOcrSucceeded}`;
  }
  if (inspection.extracted != null && inspection.extracted > 0) {
    line += ` · ${inspection.extracted} candidate${inspection.extracted === 1 ? '' : 's'}`;
  }
  if (inspection.candidatesExpired) {
    line += ` · ${inspection.candidatesExpired} expired`;
  }
  if (inspection.candidatesReview) {
    line += ` · ${inspection.candidatesReview} review`;
  }
  if (inspection.coverageStatus) {
    line += ` · coverage=${inspection.coverageStatus}`;
  }
  if (inspection.incompleteReason) {
    line += ` · incomplete: ${inspection.incompleteReason}`;
  }
  return line;
}

/**
 * A successful watch means Benson actually inspected the profile grid.
 * Empty discovery or every discovered post failing capture is not success.
 */
export function instagramWatchInspectionSucceeded(inspection: InstagramWatchInspection): boolean {
  if (!inspection.profileOpened || inspection.postsDiscovered <= 0) return false;
  return inspection.alreadyKnown + inspection.newlyInspected > 0;
}

export function isInstagramAccountWatchSource(watcher: {
  platform?: string | null;
  adapterType?: string | null;
  watcherKind?: string | null;
  extractionConfig?: unknown;
  monitoringMode?: string | null;
}): boolean {
  if ((watcher.platform ?? '').toLowerCase() !== 'instagram') return false;
  if (watcher.monitoringMode === 'SINGLE_ITEM') return false;
  const extraction = watcher.extractionConfig as { curatorPipeline?: boolean } | null;
  return (
    watcher.adapterType === 'social_account' ||
    watcher.watcherKind === 'curator' ||
    Boolean(extraction?.curatorPipeline)
  );
}
