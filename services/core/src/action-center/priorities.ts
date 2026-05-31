import type { ActionCenterItem, BensonPriority } from './types.js';
import type { DueBucket } from './dates.js';

const PRIORITY_ORDER: Record<BensonPriority, number> = {
  critical: 0,
  important: 1,
  suggested: 2,
};

export function assignPriority(
  item: Pick<ActionCenterItem, 'dueBucket' | 'section' | 'meta'>,
): BensonPriority {
  if (item.dueBucket === 'overdue') return 'critical';

  if (item.dueBucket === 'due_today') return 'important';

  if (item.section === 'content_waiting_for_approval') return 'important';

  if (item.section === 'pending_sponsor_emails') {
    const status = item.meta?.status;
    if (status === 'needs_approval' || status === 'scheduled') return 'important';
  }

  if (item.section === 'sponsor_opportunities_needing_updates') {
    const status = item.meta?.status;
    if (status === 'negotiating' || status === 'proposal_sent') return 'important';
  }

  return 'suggested';
}

export function sortActionItems(items: ActionCenterItem[]): ActionCenterItem[] {
  return [...items].sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (pa !== 0) return pa;
    const bucketOrder: Record<DueBucket, number> = {
      overdue: 0,
      due_today: 1,
      due_this_week: 2,
      later: 3,
      none: 4,
    };
    const bb = bucketOrder[a.dueBucket] - bucketOrder[b.dueBucket];
    if (bb !== 0) return bb;
    if (a.dueAt && b.dueAt) return a.dueAt.localeCompare(b.dueAt);
    return a.title.localeCompare(b.title);
  });
}

export function groupByPriority(items: ActionCenterItem[]): {
  critical: ActionCenterItem[];
  important: ActionCenterItem[];
  suggested: ActionCenterItem[];
} {
  const critical: ActionCenterItem[] = [];
  const important: ActionCenterItem[] = [];
  const suggested: ActionCenterItem[] = [];

  for (const item of items) {
    if (item.priority === 'critical') critical.push(item);
    else if (item.priority === 'important') important.push(item);
    else suggested.push(item);
  }

  return {
    critical: sortActionItems(critical),
    important: sortActionItems(important),
    suggested: sortActionItems(suggested),
  };
}

export function buildNotifications(items: ActionCenterItem[]): {
  overdue: ActionCenterItem[];
  dueToday: ActionCenterItem[];
  dueThisWeek: ActionCenterItem[];
} {
  return {
    overdue: sortActionItems(items.filter((i) => i.dueBucket === 'overdue')),
    dueToday: sortActionItems(items.filter((i) => i.dueBucket === 'due_today')),
    dueThisWeek: sortActionItems(
      items.filter((i) => i.dueBucket === 'due_this_week'),
    ),
  };
}
