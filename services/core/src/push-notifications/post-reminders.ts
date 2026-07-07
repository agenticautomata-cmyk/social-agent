import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { bensonPushSettings } from '../schema.js';
import { loadByBoard } from '../content-planner/items.js';
import { loadPostingTimeAnalytics } from '../creator-analytics/posting-times.js';
import { sendBensonPush } from './send.js';
import { getLastPushSentAt, markPushTopicSent } from './preferences.js';

const TOPIC = 'post_reminders' as const;
const REMINDER_COOLDOWN_MS = 20 * 60 * 60 * 1000;

function slotMatchesNow(
  slot: { weekday: string; hour: number },
  now: Date,
  timezone: string,
): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(now);

  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const hour = Number.parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
  return slot.weekday === weekday && slot.hour === hour;
}

export async function maybePushPostReminders(): Promise<{ sent: boolean; reason: string }> {
  const settings = await db.query.bensonPushSettings.findFirst({
    where: eq(bensonPushSettings.id, 'default'),
  });
  const topics = (settings?.topics ?? {}) as Record<string, boolean>;
  if (settings && !settings.masterEnabled) return { sent: false, reason: 'master_disabled' };
  if (topics.post_reminders === false) return { sent: false, reason: 'topic_disabled' };

  const lastSent = await getLastPushSentAt(TOPIC);
  if (lastSent && Date.now() - new Date(lastSent).getTime() < REMINDER_COOLDOWN_MS) {
    return { sent: false, reason: 'cooldown' };
  }

  const todayItems = await loadByBoard('Today');
  const planned = todayItems.filter((i) => i.status === 'planned' || i.status === 'saved');
  if (planned.length === 0) return { sent: false, reason: 'nothing_planned_today' };

  const analytics = await loadPostingTimeAnalytics('default', 'tiktok');
  const timezone = analytics?.timezone ?? 'America/Chicago';
  const now = new Date();

  const recommended = analytics?.recommendedSlots?.[0];
  const inWindow = recommended
    ? slotMatchesNow(recommended, now, timezone)
    : (() => {
        const hour = Number.parseInt(
          new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            hour: 'numeric',
            hour12: false,
          }).format(now),
          10,
        );
        return hour >= 17 && hour <= 19;
      })();

  if (!inWindow) {
    return { sent: false, reason: 'not_post_window' };
  }

  const title = planned.length === 1 ? 'Time to post' : `${planned.length} picks ready to post`;
  const body =
    planned.length === 1
      ? 'You have one pick on Today — open Benson for your caption and filming cues.'
      : `You have ${planned.length} items on Today. Open Benson for captions and filming cues.`;

  const result = await sendBensonPush(
    {
      topic: TOPIC,
      title,
      body,
      url: '/planner',
    },
    { force: false },
  );

  if (result.sent > 0) {
    await markPushTopicSent(TOPIC);
    return { sent: true, reason: 'sent' };
  }

  return { sent: false, reason: result.reason ?? 'send_failed' };
}
