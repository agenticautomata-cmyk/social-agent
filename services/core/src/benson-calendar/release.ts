import { execSync } from 'node:child_process';
import { sendBensonPush } from '../push-notifications/send.js';
import { sendTelegramMessage } from '../telegram-notifications/send.js';
import { GOOGLE_CALENDAR_OAUTH_SCOPES } from '../google-calendar-oauth/scopes.js';
import { BENSON_DEDICATED_CALENDAR_NAME } from '../google-calendar-oauth/constants.js';

export type CalendarReleaseReport = {
  commitHash: string;
  releaseTag: string;
  deployedAt: Date;
  previousRelease: string;
  migration: string;
  oauthScopes: readonly string[];
  acceptancePassed: boolean;
  pushResult: string;
  rollbackCommands: string;
  notes: string[];
};

function gitHead(): string {
  return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
}

export function buildCalendarTelegram(report: CalendarReleaseReport): string {
  const deployed = report.deployedAt.toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'full',
    timeStyle: 'long',
  });

  return [
    '📅 BENSON RELEASE — Google Calendar Connected',
    '',
    `Deployed: ${deployed}`,
    `Commit: ${report.commitHash}`,
    `Tag: ${report.releaseTag}`,
    `Previous: ${report.previousRelease}`,
    `Migration: ${report.migration}`,
    '',
    'OAUTH SCOPES',
    ...report.oauthScopes.map((s) => `• ${s}`),
    '',
    `Dedicated calendar: ${BENSON_DEDICATED_CALENDAR_NAME}`,
    `Production acceptance: ${report.acceptancePassed ? 'PASSED' : 'PENDING'}`,
    `Push: ${report.pushResult}`,
    '',
    'LINKS',
    '• Calendar: https://benson.kckellie.com/calendar',
    '• Settings: https://benson.kckellie.com/calendar/settings',
    '',
    'Rollback:',
    report.rollbackCommands,
    '',
    ...report.notes.map((n) => `• ${n}`),
  ].join('\n');
}

export async function sendCalendarReleaseNotifications(
  report: CalendarReleaseReport,
): Promise<{ push: { sent: boolean; reason?: string }; telegram: { sent: boolean; reason?: string } }> {
  if (!report.acceptancePassed) {
    const blocked = await sendTelegramMessage(
      [
        '⚠️ BENSON CALENDAR RELEASE — blocked pending live OAuth acceptance',
        '',
        'Complete authorization at https://benson.kckellie.com/calendar/settings',
        'Then run: pnpm calendar:acceptance',
      ].join('\n'),
      { requireOutreachEnabled: false },
    );
    return {
      push: { sent: false, reason: 'acceptance not passed' },
      telegram: { sent: blocked.sent, reason: blocked.reason },
    };
  }

  const push = await sendBensonPush(
    {
      topic: 'studio_update',
      title: 'Benson What\'s New — Google Calendar Connected',
      body: 'Benson can now manage creator plans internally and export selected confirmed items to the KC Kellie — Benson Google Calendar.',
      url: '/calendar',
    },
    { force: true },
  );

  const telegram = await sendTelegramMessage(buildCalendarTelegram(report), {
    requireOutreachEnabled: false,
  });

  return {
    push: { sent: push.sent > 0, reason: push.reason },
    telegram: { sent: telegram.sent, reason: telegram.reason },
  };
}

export function defaultCalendarReleaseReport(
  overrides?: Partial<CalendarReleaseReport>,
): CalendarReleaseReport {
  return {
    commitHash: gitHead(),
    releaseTag: 'release/calendar-google-oauth-2026-07-26',
    deployedAt: new Date(),
    previousRelease: 'release/scout-expansion-2026-07-25',
    migration: '73_creator_calendar.sql',
    oauthScopes: GOOGLE_CALENDAR_OAUTH_SCOPES,
    acceptancePassed: false,
    pushResult: 'pending',
    rollbackCommands:
      'git checkout release/scout-expansion-2026-07-25 && ./scripts/pre-alpha-start-prod.sh',
    notes: [
      'Calendar OAuth is separate from Gmail',
      'Export requires confirmed future items only',
      `Dedicated calendar: ${BENSON_DEDICATED_CALENDAR_NAME}`,
    ],
    ...overrides,
  };
}
