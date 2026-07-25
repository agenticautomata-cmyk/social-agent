import { createHash } from 'node:crypto';
import { env } from '../env.js';
import { sendTelegramMessage } from '../telegram-notifications/send.js';
import { sendBensonPush } from '../push-notifications/send.js';
import type { EarlySignal } from '../schema.js';
import type { EarlySignalView } from './types.js';
import {
  getAlertPreferences,
  recordAlertDelivery,
  updateSignal,
  wasAlertSentForHash,
} from './store.js';
import { localHourInTimezone } from '../datetime.js';

function payloadHash(signalId: string, contentHash: string): string {
  return createHash('sha256').update(`${signalId}:${contentHash}`).digest('hex').slice(0, 24);
}

function inQuietHours(now: Date, start: number | null, end: number | null): boolean {
  if (start == null || end == null) return false;
  const hour = localHourInTimezone(now);
  if (start <= end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

export function isAlertEligible(
  signal: Pick<
    EarlySignal,
    'confidenceLevel' | 'urgencyLevel' | 'city' | 'sourceCategory' | 'signalState'
  >,
  prefs: Awaited<ReturnType<typeof getAlertPreferences>>,
): { eligible: boolean; reason: string } {
  if (signal.signalState === 'dismissed' || signal.signalState === 'promoted') {
    return { eligible: false, reason: 'inactive_state' };
  }
  if (signal.urgencyLevel === 'weak_signal') {
    return { eligible: false, reason: 'weak_signal' };
  }
  if (!prefs) return { eligible: signal.urgencyLevel === 'breaking', reason: 'default_breaking_only' };

  if (prefs.breakingOnly && signal.urgencyLevel !== 'breaking') {
    return { eligible: false, reason: 'breaking_only_pref' };
  }
  if (
    !prefs.allQualified &&
    !prefs.breakingOnly &&
    prefs.highConfidence &&
    !['high', 'confirmed'].includes(signal.confidenceLevel)
  ) {
    return { eligible: false, reason: 'high_confidence_pref' };
  }
  if (prefs.cities.length > 0 && signal.city && !prefs.cities.includes(signal.city)) {
    return { eligible: false, reason: 'city_filtered' };
  }
  if (
    prefs.signalCategories.length > 0 &&
    signal.sourceCategory &&
    !prefs.signalCategories.includes(signal.sourceCategory)
  ) {
    return { eligible: false, reason: 'category_filtered' };
  }
  return { eligible: true, reason: 'qualified' };
}

export function buildTelegramAlertBody(view: EarlySignalView, appBase: string): string {
  const rec = view.contentRecommendation;
  const sources = view.evidence
    .map((e) => (e.sourceUrl ? `• ${e.sourceName ?? 'Source'}: ${e.sourceUrl}` : null))
    .filter(Boolean)
    .slice(0, 4)
    .join('\n');

  const lines = [
    '🚨 BENSON EARLY SIGNAL',
    '',
    `Business/Event:\n${view.businessName ?? view.title}`,
    '',
    `What changed:\n${view.summary}`,
    '',
    `Why it matters:\n${rec.recommendedAction ?? 'Review for creator opportunity'}`,
    '',
    `Confidence:\n${view.confidenceLevel}`,
    '',
    `Urgency:\n${view.urgencyLevel.replace(/_/g, ' ')}`,
    '',
    `Recommended action:\n${rec.recommendedAction}`,
    '',
    `How to use it:\n${rec.callToAction}`,
    '',
    sources ? `Sources:\n${sources}` : 'Sources:\nSee Benson for linked evidence',
    '',
    view.missingVerification.length
      ? `Still needs verification:\n${view.missingVerification.join('; ')}`
      : 'Still needs verification:\nNone listed',
    '',
    `Open in Benson:\n${appBase}/signals/${view.id}`,
  ];
  return lines.join('\n');
}

export function buildPushAlert(view: EarlySignalView): { title: string; body: string; url: string } {
  return {
    title: `Benson Early Signal: ${view.businessName ?? view.title}`.slice(0, 90),
    body: `${view.summary.slice(0, 140)} (${view.confidenceLevel}, ${view.urgencyLevel.replace(/_/g, ' ')})`,
    url: `/signals/${view.id}`,
  };
}

export async function deliverSignalAlerts(
  view: EarlySignalView,
  options?: { force?: boolean; test?: boolean },
): Promise<{
  push: { sent: boolean; reason?: string };
  telegram: { sent: boolean; reason?: string };
}> {
  const prefs = await getAlertPreferences();
  const now = new Date();
  if (!options?.force && !options?.test && inQuietHours(now, prefs?.quietHoursStart ?? null, prefs?.quietHoursEnd ?? null)) {
    return {
      push: { sent: false, reason: 'quiet_hours' },
      telegram: { sent: false, reason: 'quiet_hours' },
    };
  }

  const hash = payloadHash(view.id, view.metadata.contentHash as string ?? view.id);
  if (!options?.force && !options?.test && (await wasAlertSentForHash(hash))) {
    return {
      push: { sent: false, reason: 'duplicate_payload' },
      telegram: { sent: false, reason: 'duplicate_payload' },
    };
  }

  const appBase =
    process.env.DASHBOARD_PUBLIC_URL?.replace(/\/$/, '') ??
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ??
    'https://benson.kckellie.com';

  const pushPayload = buildPushAlert(view);
  const push = await sendBensonPush(
    {
      topic: 'early_signals',
      title: options?.test ? `[TEST] ${pushPayload.title}` : pushPayload.title,
      body: pushPayload.body,
      url: pushPayload.url,
    },
    { force: options?.force || options?.test },
  );

  await recordAlertDelivery({
    signalId: view.id,
    channel: 'push',
    success: push.sent > 0,
    providerResponse: push.reason ?? `sent=${push.sent}, failed=${push.failed}`,
    payloadHash: hash,
    metadata: { test: options?.test ?? false },
  });

  const telegramBody = buildTelegramAlertBody(view, appBase);
  const telegramText = options?.test ? `[TEST]\n${telegramBody}` : telegramBody;
  const telegram = await sendTelegramMessage(telegramText, { requireOutreachEnabled: false });

  await recordAlertDelivery({
    signalId: view.id,
    channel: 'telegram',
    recipient: env.TELEGRAM_CHAT_ID ? 'configured' : 'missing',
    success: telegram.sent,
    providerResponse: telegram.reason ?? 'ok',
    payloadHash: hash,
    metadata: { test: options?.test ?? false },
  });

  if ((push.sent > 0 || telegram.sent) && !options?.test) {
    await updateSignal(view.id, {
      alertSentAt: new Date(),
      alertContentHash: hash,
    });
  }

  return {
    push: { sent: push.sent > 0, reason: push.reason },
    telegram: { sent: telegram.sent, reason: telegram.reason },
  };
}
