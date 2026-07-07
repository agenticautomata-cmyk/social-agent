import { env } from '../env.js';

export type TelegramSendResult = {
  sent: boolean;
  skipped: boolean;
  reason?: string;
};

export type TelegramSendOptions = {
  /** When false, sends whenever bot token + chat id are configured (milestones, etc.). */
  requireOutreachEnabled?: boolean;
};

function telegramCredentials(): { token: string; chatId: string } | null {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) return null;
  return { token, chatId };
}

function outreachGate(options?: TelegramSendOptions): TelegramSendResult | null {
  if (options?.requireOutreachEnabled === false) return null;
  if (!env.TELEGRAM_OUTREACH_ENABLED) {
    return { sent: false, skipped: true, reason: 'telegram_disabled' };
  }
  return null;
}

export async function sendTelegramMessage(
  text: string,
  options?: TelegramSendOptions,
): Promise<TelegramSendResult> {
  const gated = outreachGate(options);
  if (gated) return gated;

  const creds = telegramCredentials();
  if (!creds) {
    return { sent: false, skipped: true, reason: 'telegram_not_configured' };
  }

  const res = await fetch(`https://api.telegram.org/bot${creds.token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: creds.chatId,
      text,
      disable_web_page_preview: false,
    }),
  });

  const json = (await res.json()) as { ok?: boolean; description?: string };
  if (!res.ok || !json.ok) {
    console.warn('[telegram] send failed:', json.description ?? res.status);
    return { sent: false, skipped: false, reason: json.description ?? 'send_failed' };
  }

  return { sent: true, skipped: false };
}

export async function sendTelegramAnimation(
  animationUrl: string,
  caption?: string,
  options?: TelegramSendOptions,
): Promise<TelegramSendResult> {
  const gated = outreachGate(options);
  if (gated) return gated;

  const creds = telegramCredentials();
  if (!creds) {
    return { sent: false, skipped: true, reason: 'telegram_not_configured' };
  }

  const res = await fetch(`https://api.telegram.org/bot${creds.token}/sendAnimation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: creds.chatId,
      animation: animationUrl,
      caption: caption ?? undefined,
    }),
  });

  const json = (await res.json()) as { ok?: boolean; description?: string };
  if (!res.ok || !json.ok) {
    console.warn('[telegram] animation failed:', json.description ?? res.status);
    return { sent: false, skipped: false, reason: json.description ?? 'send_failed' };
  }

  return { sent: true, skipped: false };
}
