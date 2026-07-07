import { computeActionCenter } from '../action-center/hub.js';
import { env } from '../env.js';
import { sendBensonPush } from './send.js';
import { getLastPushSentAt } from './preferences.js';

const MIN_ACTION_REMINDER_GAP_MS = 12 * 60 * 60 * 1000;

export async function maybePushActionReminders(): Promise<void> {
  const lastSent = await getLastPushSentAt('action_reminders');
  if (lastSent && Date.now() - lastSent.getTime() < MIN_ACTION_REMINDER_GAP_MS) {
    return;
  }

  const hub = await computeActionCenter({ demoMode: env.DEMO_MODE });
  const overdue = hub.notifications.overdue.length;
  const dueToday = hub.notifications.dueToday.length;
  const intakeCount = [
    ...hub.notifications.overdue,
    ...hub.notifications.dueToday,
    ...hub.notifications.dueThisWeek,
  ].filter((item) => item.entityType === 'intake').length;

  if (overdue === 0 && dueToday === 0 && intakeCount === 0) {
    return;
  }

  const parts: string[] = [];
  if (overdue > 0) parts.push(`${overdue} overdue`);
  if (dueToday > 0) parts.push(`${dueToday} due today`);

  if (parts.length > 0) {
    await sendBensonPush({
      topic: 'action_reminders',
      title: 'Benson · actions',
      body: parts.join(' · '),
      url: '/actions',
    });
  }

  if (intakeCount > 0) {
    await sendBensonPush({
      topic: 'share_intake',
      title: 'Benson · share intake',
      body: `${intakeCount} shared item${intakeCount === 1 ? '' : 's'} need review`,
      url: '/intake',
    });
  }
}
