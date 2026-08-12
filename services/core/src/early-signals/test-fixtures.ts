import type { SourceWatcher } from '../schema.js';

/** Default Scout expansion columns for SourceWatcher test/probe fixtures. */
export const SCOUT_WATCHER_DEFAULTS = {
  submittedUrl: null,
  canonicalSourceUrl: null,
  publisherUrl: null,
  platform: null,
  jurisdiction: 'Kansas City, MO',
  monitoringMode: 'WATCH_PAGE',
  approvalStatus: 'approved',
  adaptiveFrequency: true,
  paused: false,
  sourceReliability: null,
  creatorLeadPotential: null,
  signalToNoiseScore: null,
  lastAttemptedCheck: null,
  lastNewItemDetected: null,
  lastMaterialChange: null,
  latestContentDate: null,
  sessionStatus: 'none',
  authenticationRequired: false,
  robotsReviewStatus: 'pending',
  extractionConfig: {},
  selectorConfig: {},
  createdBy: 'system',
  watcherKind: 'generic',
  canonicalKey: null,
} satisfies Partial<SourceWatcher>;

export function watcherFixture(partial: Omit<SourceWatcher, keyof typeof SCOUT_WATCHER_DEFAULTS> & Partial<typeof SCOUT_WATCHER_DEFAULTS>): SourceWatcher {
  return { ...SCOUT_WATCHER_DEFAULTS, ...partial } as SourceWatcher;
}
