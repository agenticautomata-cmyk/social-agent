import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { calendarCategorySnoozes } from '../schema.js';
import { emitDataChange } from '../data-revision/index.js';
import { getCreatorTimezone } from '../datetime.js';
import {
  CALENDAR_CATEGORY_LABELS,
  isCalendarSnoozeCategory,
  type CalendarSnoozeCategory,
  type CalendarSnoozeDuration,
} from './population/calendar-category.js';

export type CalendarCategorySnoozeView = {
  category: CalendarSnoozeCategory;
  label: string;
  until: string | null;
  untilLabel: string;
};

export function snoozeUntilFromDuration(duration: CalendarSnoozeDuration, now = new Date()): Date | null {
  if (duration === 'indefinite') return null;
  const days = duration === '7d' ? 7 : 30;
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

export function formatSnoozeUntilLabel(until: Date | null, timezone = getCreatorTimezone()): string {
  if (!until) return 'until I turn it back on';
  const label = until.toLocaleDateString('en-US', {
    timeZone: timezone,
    month: 'short',
    day: 'numeric',
  });
  return `until ${label}`;
}

function isActiveUntil(until: Date | null, now: Date): boolean {
  return until == null || until.getTime() > now.getTime();
}

export function isCalendarCategorySnoozed(
  category: string | null | undefined,
  snoozes: CalendarCategorySnoozeView[],
  now = new Date(),
): boolean {
  if (!category) return false;
  const hit = snoozes.find((row) => row.category === category);
  if (!hit) return false;
  if (!hit.until) return true;
  return new Date(hit.until).getTime() > now.getTime();
}

export function shouldHideUnselectedSuggestionForSnooze(
  view: {
    planningStatus: string;
    selected: boolean;
    calendarCategory: string | null;
  },
  snoozes: CalendarCategorySnoozeView[],
  now = new Date(),
): boolean {
  if (view.selected) return false;
  if (view.planningStatus !== 'suggested') return false;
  return isCalendarCategorySnoozed(view.calendarCategory, snoozes, now);
}

function toView(row: {
  categoryKey: string;
  label: string;
  until: Date | null;
}): CalendarCategorySnoozeView | null {
  if (!isCalendarSnoozeCategory(row.categoryKey)) return null;
  return {
    category: row.categoryKey,
    label: row.label || CALENDAR_CATEGORY_LABELS[row.categoryKey],
    until: row.until ? row.until.toISOString() : null,
    untilLabel: formatSnoozeUntilLabel(row.until),
  };
}

export async function listActiveCalendarCategorySnoozes(now = new Date()): Promise<CalendarCategorySnoozeView[]> {
  const rows = await db.select().from(calendarCategorySnoozes);
  const out: CalendarCategorySnoozeView[] = [];
  for (const row of rows) {
    if (!isActiveUntil(row.until, now)) continue;
    const view = toView(row);
    if (view) out.push(view);
  }
  return out;
}

export async function sleepCalendarCategory(
  category: string,
  duration: CalendarSnoozeDuration,
  now = new Date(),
): Promise<CalendarCategorySnoozeView> {
  if (!isCalendarSnoozeCategory(category)) {
    throw new Error(`Unsupported calendar snooze category: ${category}`);
  }
  const until = snoozeUntilFromDuration(duration, now);
  const label = CALENDAR_CATEGORY_LABELS[category];
  const [row] = await db
    .insert(calendarCategorySnoozes)
    .values({
      categoryKey: category,
      label,
      until,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: calendarCategorySnoozes.categoryKey,
      set: { label, until, updatedAt: now },
    })
    .returning();
  if (!row) throw new Error('Failed to save category snooze');

  await emitDataChange({
    eventType: 'calendar_change',
    domains: ['calendar'],
    completedAt: new Date().toISOString(),
    source: 'creator-calendar.category-snooze',
    recordIds: [category],
    success: true,
  });

  const view = toView(row);
  if (!view) throw new Error('Failed to map category snooze');
  return view;
}

export async function wakeCalendarCategory(category: string): Promise<boolean> {
  const result = await db
    .delete(calendarCategorySnoozes)
    .where(eq(calendarCategorySnoozes.categoryKey, category))
    .returning({ categoryKey: calendarCategorySnoozes.categoryKey });
  if (result.length === 0) return false;

  await emitDataChange({
    eventType: 'calendar_change',
    domains: ['calendar'],
    completedAt: new Date().toISOString(),
    source: 'creator-calendar.category-wake',
    recordIds: [category],
    success: true,
  });
  return true;
}
