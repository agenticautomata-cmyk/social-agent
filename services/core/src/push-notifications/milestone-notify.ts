import {
  FOLLOWERS_10000_GIFS,
  VIEWS_1000000_GIFS,
  formatFollowers10000TelegramCaption,
  formatViews1000000TelegramCaption,
} from './milestone-content.js';
import { sendTelegramAnimation, sendTelegramMessage } from '../telegram-notifications/send.js';

function publicAppBase(): string {
  return (
    process.env.DASHBOARD_PUBLIC_URL?.replace(/\/$/, '') ??
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ??
    'http://localhost:3000'
  );
}

export async function notifyFollowers10000Telegram(followerCount: number): Promise<{
  sent: boolean;
  reason?: string;
}> {
  const appUrl = `${publicAppBase()}/home?celebrate=followers-10000`;
  const caption = formatFollowers10000TelegramCaption(followerCount, appUrl);
  const opts = { requireOutreachEnabled: false as const };

  const text = await sendTelegramMessage(caption, opts);
  if (!text.sent) {
    return { sent: false, reason: text.reason ?? 'telegram_text_failed' };
  }

  const hero = await sendTelegramAnimation(FOLLOWERS_10000_GIFS.hero, undefined, opts);
  if (hero.sent) {
    await sendTelegramAnimation(FOLLOWERS_10000_GIFS.fireworks, undefined, opts);
    await sendTelegramAnimation(FOLLOWERS_10000_GIFS.party, '🎉 KC CREATOR STUDIO · 10K 🎉', opts);
    return { sent: true };
  }

  console.warn('[milestone-notify] telegram message sent; animations skipped:', hero.reason);
  return { sent: true, reason: 'animations_skipped' };
}

/** Push+Telegram only — no dashboard celebration deep link. */
export async function notifyViews1000000Telegram(viewCount: number): Promise<{
  sent: boolean;
  reason?: string;
}> {
  const caption = formatViews1000000TelegramCaption(viewCount);
  const opts = { requireOutreachEnabled: false as const };

  const text = await sendTelegramMessage(caption, opts);
  if (!text.sent) {
    return { sent: false, reason: text.reason ?? 'telegram_text_failed' };
  }

  const hero = await sendTelegramAnimation(VIEWS_1000000_GIFS.hero, undefined, opts);
  if (hero.sent) {
    await sendTelegramAnimation(VIEWS_1000000_GIFS.fireworks, undefined, opts);
    await sendTelegramAnimation(
      VIEWS_1000000_GIFS.party,
      '🚀 KC CREATOR STUDIO · 1M VIEWS 🚀',
      opts,
    );
    return { sent: true };
  }

  console.warn('[milestone-notify] 1M views telegram message sent; animations skipped:', hero.reason);
  return { sent: true, reason: 'animations_skipped' };
}
