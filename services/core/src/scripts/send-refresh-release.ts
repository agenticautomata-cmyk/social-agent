import { sendRefreshReleaseNotifications, type RefreshReleaseReport } from '../data-revision/release.js';

const report: RefreshReleaseReport = {
  commitHash: process.env.RELEASE_COMMIT ?? 'unknown',
  releaseTag: process.env.RELEASE_TAG ?? 'unknown',
  deployedAt: new Date(),
  migrationResult: process.env.RELEASE_MIGRATION ?? 'migration 70 applied',
  testTotals: process.env.RELEASE_TESTS ?? 'see CI output',
  tiktokTest: process.env.RELEASE_TIKTOK ?? 'pending',
  sameTabTest: process.env.RELEASE_SAME_TAB ?? 'pending',
  crossTabTest: process.env.RELEASE_CROSS_TAB ?? 'pending',
  pwaTest: process.env.RELEASE_PWA ?? 'pending',
  skipTest: process.env.RELEASE_SKIP ?? 'pending',
  reingestionTest: process.env.RELEASE_REINGEST ?? 'pending',
  snoozeTest: process.env.RELEASE_SNOOZE ?? 'pending',
  restartResult: process.env.RELEASE_RESTART ?? 'pending',
  routeStatus: process.env.RELEASE_ROUTES ?? 'pending',
  knownLimitations: [
    'Installed iOS/Android PWA may need one physical open to confirm foreground poll if browser automation cannot attach to installed shell.',
    'Global search Skip requires inventory card surfaces; dedicated search result cards inherit Skip when item renders with DiscoverySkipButton.',
  ],
  rollbackInstructions: [
    'Code: git checkout <previous-tag> && pnpm restart:clean:prod --build',
    'Migration 70: tables are additive; rollback optional — DROP TABLE creator_skipped_records; DROP TABLE benson_data_revisions;',
    'Docker: docker compose restart postgres (data retained)',
  ].join('\n'),
};

const result = await sendRefreshReleaseNotifications(report);
console.log(JSON.stringify(result, null, 2));
