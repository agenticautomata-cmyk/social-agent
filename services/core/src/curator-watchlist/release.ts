import { execSync } from 'node:child_process';
import { sendBensonPush } from '../push-notifications/send.js';
import { sendTelegramMessage } from '../telegram-notifications/send.js';

export type CuratorWatchlistReleaseReport = {
  commitHash: string;
  releaseTag: string;
  deployedAt: Date;
  migration: string;
  watchedProfile: string;
  postsProcessed: number;
  slidesProcessed: number;
  eventsExtracted: number;
  verified: number;
  partiallyVerified: number;
  conflicted: number;
  expired: number;
  duplicates: number;
  testTotals: string;
  coreTestsPass: number;
  dashboardTestsPass: number;
  restartResults: string;
  instagramLimitations: string[];
  exampleLeads: Array<{ name: string; status: string; date: string | null }>;
};

function gitHead(): string {
  return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
}

export function buildCuratorWatchlistTelegram(report: CuratorWatchlistReleaseReport): string {
  const deployed = report.deployedAt.toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'full',
    timeStyle: 'long',
  });

  return [
    '📡 BENSON RELEASE — Local Curator Watchlists',
    '',
    `Deployed: ${deployed}`,
    `Commit: ${report.commitHash}`,
    `Tag: ${report.releaseTag}`,
    `Migration: ${report.migration}`,
    '',
    'WATCHED PROFILE',
    report.watchedProfile,
    '',
    'PROCESSING TOTALS',
    `Posts: ${report.postsProcessed}`,
    `Slides OCR: ${report.slidesProcessed}`,
    `Events extracted: ${report.eventsExtracted}`,
    `Verified: ${report.verified}`,
    `Partially verified: ${report.partiallyVerified}`,
    `Conflicted: ${report.conflicted}`,
    `Expired: ${report.expired}`,
    `Duplicates skipped: ${report.duplicates}`,
    '',
    'EXAMPLE LEADS',
    ...report.exampleLeads.slice(0, 5).map(
      (l) => `• ${l.name} (${l.status})${l.date ? ` — ${l.date}` : ''}`,
    ),
    '',
    'ATTRIBUTION',
    '• Every lead shows “Discovered via @handle”',
    '• Facts-only summaries — no curator graphic/caption reuse',
    '',
    'TESTS',
    report.testTotals,
    '',
    'RESTART',
    report.restartResults,
    '',
    'INSTAGRAM LIMITATIONS',
    ...report.instagramLimitations.map((l) => `• ${l}`),
    '',
    'Watchlist: https://benson.kckellie.com/watchlist',
  ].join('\n');
}

export async function sendCuratorWatchlistReleaseNotifications(
  report: CuratorWatchlistReleaseReport,
): Promise<{ push: { sent: boolean; reason?: string }; telegram: { sent: boolean; reason?: string } }> {
  const push = await sendBensonPush(
    {
      topic: 'studio_update',
      title: "Benson What's New — Local Curator Watchlists",
      body: 'Benson can now monitor trusted KC roundup creators, extract every listed event, verify the details and turn strong leads into creator-ready opportunities.',
      url: '/watchlist',
    },
    { force: true },
  );

  const telegram = await sendTelegramMessage(buildCuratorWatchlistTelegram(report), {
    requireOutreachEnabled: false,
  });

  return {
    push: { sent: push.sent > 0, reason: push.reason },
    telegram: { sent: telegram.sent, reason: telegram.reason },
  };
}

export function defaultCuratorReleaseReport(
  overrides?: Partial<CuratorWatchlistReleaseReport>,
): CuratorWatchlistReleaseReport {
  return {
    commitHash: gitHead(),
    releaseTag: 'release/curator-watchlist-2026-07-26',
    deployedAt: new Date(),
    migration: '76_curator_watchlist_intelligence.sql',
    watchedProfile: 'https://www.instagram.com/jasfoodjourney/',
    postsProcessed: 0,
    slidesProcessed: 0,
    eventsExtracted: 0,
    verified: 0,
    partiallyVerified: 0,
    conflicted: 0,
    expired: 0,
    duplicates: 0,
    testTotals: 'pending',
    coreTestsPass: 0,
    dashboardTestsPass: 0,
    restartResults: 'pending',
    instagramLimitations: [
      'Profile monitoring requires SCOUT_INSTAGRAM_PROFILE_DIR with authenticated storage-state.json',
      'Public scraping without session may hit login walls — watcher pauses cleanly',
      'Stories/highlights only when session can access them — not claimed otherwise',
      'No likes, follows, comments, or DMs — read-only discovery',
    ],
    exampleLeads: [],
    ...overrides,
  };
}
