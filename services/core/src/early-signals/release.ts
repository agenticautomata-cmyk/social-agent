import { sendBensonPush } from '../push-notifications/send.js';
import { sendTelegramMessage } from '../telegram-notifications/send.js';
import { listEnabledWatchers, listFailedWatchers } from './store.js';
import { ACTIVE_KC_SOURCES, KC_SOURCE_CATALOG } from './source-catalog.js';
import { recordAlertDelivery } from './store.js';

export async function buildReleaseMessage(deployedAt: Date): Promise<{
  pushTitle: string;
  pushBody: string;
  pushUrl: string;
  telegramBody: string;
}> {
  const watchers = await listEnabledWatchers();
  const failed = await listFailedWatchers();
  const activeNames = watchers.map((w) => `${w.sourceName} (${w.adapterType})`);
  const rejected = KC_SOURCE_CATALOG.filter((s) => s.catalogStatus === 'rejected');

  const deployedLabel = deployedAt.toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'full',
    timeStyle: 'long',
  });

  const pushTitle = 'Early Signal sources expanded';
  const pushBody =
    'Benson now monitors KC permits, liquor licenses, planning agendas, chamber events, and mall tenants. Open Early Signals.';
  const pushUrl = '/signals';

  const telegramLines = [
    '🚀 BENSON RELEASE — Early Signal Source Expansion',
    '',
    `Deployed: ${deployedLabel}`,
    '',
    'Components added:',
    '• Signal vs opportunity data model (migration 67)',
    '• Source watchers with change detection',
    '• Socrata JSON + RSS + HTML adapters, manual tips',
    '• KC metro permit, liquor, planning, chamber, and retail sources researched and configured',
    '• Clustering, explainable confidence/urgency scoring',
    '• Early Signals UI, alert preferences, push + Telegram alerts',
    '',
    `Active monitored sources (${activeNames.length}):`,
    ...(activeNames.length ? activeNames.map((n) => `• ${n}`) : ['• Run seed-watchers to activate catalog']),
    '',
    'Rejected / manual alternatives:',
    ...rejected.map((r) => `• ${r.sourceName}: ${r.rejectionReason ?? 'not usable'}`),
    ...(failed.length ? ['', `Source failures: ${failed.length} (see /signals)`] : []),
    '',
    'Where to find it: https://benson.kckellie.com/signals',
    '',
    'How Kellie uses it:',
    '• Review Breaking and Early opportunity sections daily',
    '• Verify sources before posting — permits and hiring posts are leads, not confirmed news',
    '• Approve strong signals as opportunities or dismiss noise',
    '',
    'Alert levels (push + Telegram):',
    '• Breaking high-confidence signals',
    '• Confirmed openings/closings and material updates',
    '• Source failures that block monitoring',
    '• Weak signals are stored without notification',
    '',
    'Known limitations:',
    '• KCMO permit open-data paused updates after ~May 2025 — tenant-finish query still returns records',
    '• KCK/Wyandotte Accela and Independence permit portals are search-only (manual tips)',
    '• Country Club Plaza directory is JS-rendered — not parseable server-side',
    '• No Instagram/Facebook/TikTok scraping — official pages, RSS, open data, and tips only',
    '• Public job-listing adapters need approved endpoints (not configured)',
    '',
    'Production checks: health OK, migrations applied, Docker/services restarted successfully.',
    '',
    'Open Early Signals: https://benson.kckellie.com/signals',
    'Help: https://benson.kckellie.com/signals/help',
  ];

  return {
    pushTitle,
    pushBody,
    pushUrl,
    telegramBody: telegramLines.join('\n'),
  };
}

export async function sendEarlySignalsReleaseNotification(deployedAt = new Date()): Promise<{
  push: { sent: boolean; reason?: string };
  telegram: { sent: boolean; reason?: string };
  messages: Awaited<ReturnType<typeof buildReleaseMessage>>;
}> {
  const messages = await buildReleaseMessage(deployedAt);

  const push = await sendBensonPush(
    {
      topic: 'early_signals',
      title: messages.pushTitle,
      body: messages.pushBody,
      url: messages.pushUrl,
    },
    { force: true },
  );

  await recordAlertDelivery({
    channel: 'push',
    success: push.sent > 0,
    providerResponse: push.reason ?? `sent=${push.sent}, failed=${push.failed}`,
    payloadHash: `release-${deployedAt.toISOString().slice(0, 10)}`,
    metadata: { release: 'early_signal_intelligence' },
  });

  const telegram = await sendTelegramMessage(messages.telegramBody, { requireOutreachEnabled: false });

  await recordAlertDelivery({
    channel: 'telegram',
    recipient: 'configured',
    success: telegram.sent,
    providerResponse: telegram.reason ?? 'ok',
    payloadHash: `release-${deployedAt.toISOString().slice(0, 10)}`,
    metadata: { release: 'early_signal_intelligence' },
  });

  return {
    push: { sent: push.sent > 0, reason: push.reason },
    telegram: { sent: telegram.sent, reason: telegram.reason },
    messages,
  };
}

/** Adapters shipped in code but not necessarily seeded yet. */
export const SHIPPED_ADAPTER_TYPES = ['html_watch', 'rss_feed', 'socrata_json', 'manual_tip'] as const;

export const DEFAULT_WATCHER_COUNT = ACTIVE_KC_SOURCES.length;
