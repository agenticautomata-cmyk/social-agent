import { execSync } from 'node:child_process';
import { sendBensonPush } from '../push-notifications/send.js';
import { sendTelegramMessage } from '../telegram-notifications/send.js';

export type ScoutReleaseReport = {
  commitHash: string;
  releaseTag: string;
  deployedAt: Date;
  previousRelease: string;
  migration: string;
  pilotSourcesActive: number;
  promptfooSummary: string;
  pushResult: string;
  rollbackCommands: string;
  notes: string[];
};

function gitHead(): string {
  return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
}

export function buildScoutTelegram(report: ScoutReleaseReport): string {
  const deployed = report.deployedAt.toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'full',
    timeStyle: 'long',
  });

  return [
    '🔎 BENSON RELEASE — Scout Expansion',
    '',
    `Deployed: ${deployed}`,
    `Commit: ${report.commitHash}`,
    `Tag: ${report.releaseTag}`,
    `Previous: ${report.previousRelease}`,
    `Migration: ${report.migration}`,
    `Pilot sources active: ${report.pilotSourcesActive}`,
    `Promptfoo: ${report.promptfooSummary}`,
    `Push: ${report.pushResult}`,
    '',
    'WHAT\'S NEW FOR KELLIE',
    '• Add a source once at /watchlist/add — Benson keeps watching',
    '• Choose process-once vs watch page/account/feed',
    '• Qualified discoveries flow to Early Signals and Ask Benson',
    '• Flyer OCR and PDF extraction queue when enabled',
    '• Pause, resume, or stop any watched source',
    '',
    'Watchlist: https://benson.kckellie.com/watchlist',
    'Add source: https://benson.kckellie.com/watchlist/add',
    'Early Signals: https://benson.kckellie.com/signals',
    'Admin Scout: https://benson.kckellie.com/admin/scout/health',
    '',
    'KNOWN LIMITATIONS',
    '• Instagram/Facebook account monitoring requires one-time login (LOGIN_REQUIRED until reauthorized)',
    '• Docling and PaddleOCR run off-host on this server — queues stub until SCOUT_DOCLING_URL / SCOUT_OCR_REMOTE_URL set',
    '',
    'Rollback:',
    report.rollbackCommands,
    '',
    ...report.notes.map((n) => `• ${n}`),
  ].join('\n');
}

export async function sendScoutReleaseNotifications(
  report: ScoutReleaseReport,
): Promise<{ push: { sent: boolean; reason?: string }; telegram: { sent: boolean; reason?: string } }> {
  const push = await sendBensonPush(
    {
      topic: 'studio_update',
      title: 'Benson What\'s New — Scout Expansion',
      body: 'Benson can now watch approved pages and accounts, detect new posts, read event flyers and PDFs, and turn qualified discoveries into creator actions.',
      url: '/watchlist',
    },
    { force: true },
  );

  const telegram = await sendTelegramMessage(buildScoutTelegram(report), {
    requireOutreachEnabled: false,
  });

  return {
    push: { sent: push.sent > 0, reason: push.reason },
    telegram: { sent: telegram.sent, reason: telegram.reason },
  };
}

export function defaultScoutReleaseReport(overrides?: Partial<ScoutReleaseReport>): ScoutReleaseReport {
  return {
    commitHash: gitHead(),
    releaseTag: 'release/scout-expansion-2026-07-25',
    deployedAt: new Date(),
    previousRelease: 'release/studio-voice-voicebox-2026-07-25 @ 3a94394',
    migration: '72_benson_scout_expansion.sql',
    pilotSourcesActive: 0,
    promptfooSummary: 'pending',
    pushResult: 'pending',
    rollbackCommands:
      'git checkout release/studio-voice-voicebox-2026-07-25 && ./scripts/pre-alpha-start-prod.sh',
    notes: ['See docs/scout-expansion-adr.md for upstream pins and rejected services'],
    ...overrides,
  };
}
