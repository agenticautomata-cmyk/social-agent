import {
  FOLLOWERS_5000_GIFS,
  formatFollowers5000TelegramCaption,
} from './milestone-content.js';
import { sendTelegramAnimation, sendTelegramMessage } from '../telegram-notifications/send.js';

function publicAppBase(): string {
  return (
    process.env.DASHBOARD_PUBLIC_URL?.replace(/\/$/, '') ??
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ??
    'https://benson.kckellie.com'
  );
}

export async function notifyFollowers5000Telegram(followerCount: number): Promise<{
  sent: boolean;
  reason?: string;
}> {
  const appUrl = `${publicAppBase()}/home?celebrate=followers-5000`;
  const caption = formatFollowers5000TelegramCaption(followerCount, appUrl);
  const opts = { requireOutreachEnabled: false as const };

  // Text first — always deliver the milestone even when GIF hosts fail.
  const message = await sendTelegramMessage(caption, opts);
  if (!message.sent) {
    return {
      sent: false,
      reason: message.reason ?? (message.skipped ? 'telegram_skipped' : 'send_failed'),
    };
  }

  const hero = await sendTelegramAnimation(FOLLOWERS_5000_GIFS.hero, undefined, opts);
  if (hero.sent) {
    await sendTelegramAnimation(FOLLOWERS_5000_GIFS.fireworks, undefined, opts);
    await sendTelegramAnimation(FOLLOWERS_5000_GIFS.party, '🎉 KC CREATOR STUDIO · LET\'S GO 🎉', opts);
    return { sent: true, reason: 'message_and_animations' };
  }

  console.warn('[milestone-notify] telegram message sent; animations skipped:', hero.reason);
  return { sent: true, reason: 'message_only' };
}
