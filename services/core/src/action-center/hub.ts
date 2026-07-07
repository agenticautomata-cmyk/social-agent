import { collectActionCenterItems, sectionize } from './collect.js';
import { buildNotifications, groupByPriority, sortActionItems } from './priorities.js';
import type { ActionCenterResponse } from './types.js';

export async function computeActionCenter(options?: {
  now?: Date;
  demoMode?: boolean;
  excludeCategories?: string[];
}): Promise<ActionCenterResponse> {
  const raw = await collectActionCenterItems(options?.now, {
    excludeCategories: options?.excludeCategories,
  });
  const sorted = sortActionItems(raw);
  const sections = sectionize(sorted);
  const notifications = buildNotifications(sorted);
  const priorities = groupByPriority(sorted);

  const doNow = [
    ...priorities.critical.slice(0, 5),
    ...priorities.important.slice(0, 5),
  ].slice(0, 8);

  return {
    demoMode: options?.demoMode ?? false,
    generatedAt: new Date().toISOString(),
    sections,
    notifications,
    priorities,
    doNow,
    counts: {
      total: sorted.length,
      overdue: notifications.overdue.length,
      dueToday: notifications.dueToday.length,
    },
  };
}
