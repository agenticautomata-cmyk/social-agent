import { sendBensonPush } from '../push-notifications/send.js';
import { sendTelegramMessage } from '../telegram-notifications/send.js';

export type RefreshReleaseReport = {
  commitHash: string;
  releaseTag: string;
  deployedAt: Date;
  migrationResult: string;
  testTotals: string;
  tiktokTest: string;
  sameTabTest: string;
  crossTabTest: string;
  pwaTest: string;
  skipTest: string;
  reingestionTest: string;
  snoozeTest: string;
  restartResult: string;
  routeStatus: string;
  knownLimitations: string[];
  rollbackInstructions: string;
};

export function buildRefreshReleaseTelegram(report: RefreshReleaseReport): string {
  const deployedLabel = report.deployedAt.toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'full',
    timeStyle: 'long',
  });

  return [
    '🚀 BENSON RELEASE — Global Refresh Propagation + Discovery Skip',
    '',
    `Commit: ${report.commitHash}`,
    `Tag: ${report.releaseTag}`,
    `Deployed: ${deployedLabel}`,
    '',
    'Root cause fixed:',
    '• Home kept stale TikTok warnings because client pages fetched once and sync did not bump shared revisions or notify open tabs.',
    '',
    'Mechanism:',
    '• Domain-level benson_data_revisions + emitDataChange after successful material updates',
    '• BensonDataRefreshProvider: revision polling, BroadcastChannel, PWA foreground poll',
    '• creator_skipped_records with occurrence fingerprints (Skip ≠ Dismiss ≠ Suppress)',
    '',
    `Migration 70: ${report.migrationResult}`,
    `Tests: ${report.testTotals}`,
    '',
    'Production validation:',
    `• TikTok stale refresh: ${report.tiktokTest}`,
    `• Same-tab Home refresh: ${report.sameTabTest}`,
    `• Cross-tab propagation: ${report.crossTabTest}`,
    `• PWA foreground: ${report.pwaTest}`,
    `• Skip persistence: ${report.skipTest}`,
    `• Source re-ingestion: ${report.reingestionTest}`,
    `• Snooze: ${report.snoozeTest}`,
    `• Restart/recovery: ${report.restartResult}`,
    `• Routes: ${report.routeStatus}`,
    '',
    'Known limitations:',
    ...report.knownLimitations.map((l) => `• ${l}`),
    '',
    'Rollback:',
    report.rollbackInstructions,
    '',
    'Open Home: https://benson.kckellie.com/home',
  ].join('\n');
}

export async function sendRefreshReleaseNotifications(report: RefreshReleaseReport): Promise<{
  push: { sent: boolean; reason?: string };
  telegram: { sent: boolean; reason?: string };
}> {
  const body = buildRefreshReleaseTelegram(report);
  const push = await sendBensonPush(
    {
      topic: 'studio_update',
      title: 'Benson refresh + Skip shipped',
      body: 'Home now updates after TikTok sync and discoveries have a clear Skip action.',
      url: '/home',
    },
    { force: true },
  );
  const telegram = await sendTelegramMessage(body, { requireOutreachEnabled: false });
  return {
    push: { sent: push.sent > 0, reason: push.reason },
    telegram: { sent: telegram.sent, reason: telegram.reason },
  };
}
