/**
 * Projection-free weekend calendar read for Benson voice.
 * Queries durable creator_calendar_items only. Does not refresh or rebuild Calendar.
 */
import { and, asc, eq, gte, isNotNull, lte, ne, or } from 'drizzle-orm';
import { db } from '../db.js';
import { creatorCalendarItems, type CreatorCalendarItem } from '../schema.js';
import { getCreatorTimezone } from '../datetime.js';
import { startOfLocalDayKey, endOfLocalDayKey } from '../creator-agent/temporal-state.js';
import { loadByBoard } from '../content-planner/items.js';
import { mapCalendarItemView } from '../creator-calendar/items.js';
import { calendarSuggestionIsDisplayable } from '../creator-calendar/population/eligibility.js';
import { dedupeActiveCalendarViews } from '../creator-calendar/population/merge.js';
import {
  listActiveCalendarCategorySnoozes,
  shouldHideUnselectedSuggestionForSnooze,
  type CalendarCategorySnoozeView,
} from '../creator-calendar/category-snooze.js';
import {
  eventFallsInChicagoWeekend,
  getChicagoWeekendDayKeys,
} from '../creator-calendar/weekend-things-to-do.js';
import type { CalendarItemView } from '../creator-calendar/types.js';
import { formatWeekendCalendarSpeech, speakClockTime, speakWeekday, stripVoiceUnsafeText } from './formatter.js';
import {
  type VoiceCalendarItem,
  type VoiceWeekendCalendarResponse,
} from './types.js';

export type WeekendCalendarReadDeps = {
  loadRows: (from: Date, to: Date) => Promise<CreatorCalendarItem[]>;
  loadWeekendSelectedIds: () => Promise<Set<string>>;
  loadSnoozes: () => Promise<CalendarCategorySnoozeView[]>;
};

async function loadDurableWeekendCalendarRows(from: Date, to: Date): Promise<CreatorCalendarItem[]> {
  return db
    .select()
    .from(creatorCalendarItems)
    .where(
      and(
        lte(creatorCalendarItems.startAt, to),
        or(
          gte(creatorCalendarItems.startAt, from),
          and(isNotNull(creatorCalendarItems.endAt), gte(creatorCalendarItems.endAt, from)),
        ),
        ne(creatorCalendarItems.planningStatus, 'completed'),
        ne(creatorCalendarItems.planningStatus, 'expired'),
        ne(creatorCalendarItems.planningStatus, 'dismissed'),
        ne(creatorCalendarItems.planningStatus, 'cancelled'),
        eq(creatorCalendarItems.itemType, 'public_event'),
      ),
    )
    .orderBy(asc(creatorCalendarItems.startAt));
}

async function loadWeekendSelectedIds(): Promise<Set<string>> {
  const rows = await loadByBoard('Weekend').catch(() => []);
  return new Set(
    rows
      .filter((row) => row.status !== 'skipped' && row.status !== 'covered')
      .map((row) => row.contentItemId),
  );
}

function withSelection(view: CalendarItemView, weekendIds: Set<string>): CalendarItemView {
  const contentId =
    view.sourceRecordType === 'content_item' && view.sourceRecordId ? view.sourceRecordId : null;
  const selected = view.planningStatus === 'confirmed' || (contentId ? weekendIds.has(contentId) : false);
  return { ...view, selected };
}

export function selectDisplayableWeekendViews(
  views: CalendarItemView[],
  snoozes: CalendarCategorySnoozeView[],
  now: Date,
): CalendarItemView[] {
  let next = views.filter((view) =>
    eventFallsInChicagoWeekend(view.startAt, view.endAt, now),
  );
  next = next.filter((view) => {
    if (view.planningStatus !== 'suggested') return true;
    return calendarSuggestionIsDisplayable({
      title: view.title,
      location: view.location,
    });
  });
  next = dedupeActiveCalendarViews(next);
  if (snoozes.length) {
    next = next.filter((view) => !shouldHideUnselectedSuggestionForSnooze(view, snoozes, now));
  }
  next.sort((a, b) => a.startAt.localeCompare(b.startAt) || a.title.localeCompare(b.title));
  return next;
}

export function compactVoiceCalendarItem(view: CalendarItemView, timezone: string): VoiceCalendarItem {
  return {
    title: stripVoiceUnsafeText(view.title),
    day: speakWeekday(view.startAt, timezone),
    time: speakClockTime(view.startAt, timezone, view.allDay),
    venue: view.location ? stripVoiceUnsafeText(view.location) : null,
    verification: view.verificationState === 'verified' ? 'verified' : 'unverified',
  };
}

export function buildWeekendCalendarVoice(
  views: CalendarItemView[],
  snoozes: CalendarCategorySnoozeView[],
  now: Date = new Date(),
): VoiceWeekendCalendarResponse {
  const timezone = getCreatorTimezone();
  const displayable = selectDisplayableWeekendViews(views, snoozes, now);
  const items = displayable.map((view) => compactVoiceCalendarItem(view, timezone));
  return {
    operation: 'weekend_calendar',
    count: items.length,
    ready: items.length > 0,
    items,
    speech: formatWeekendCalendarSpeech({ count: items.length, items }),
  };
}

export const defaultWeekendCalendarDeps: WeekendCalendarReadDeps = {
  loadRows: loadDurableWeekendCalendarRows,
  loadWeekendSelectedIds,
  loadSnoozes: () => listActiveCalendarCategorySnoozes().catch(() => []),
};

export async function loadWeekendCalendarVoice(
  now: Date = new Date(),
  deps: WeekendCalendarReadDeps = defaultWeekendCalendarDeps,
): Promise<VoiceWeekendCalendarResponse> {
  const timezone = getCreatorTimezone();
  const weekend = getChicagoWeekendDayKeys(now);
  const from = startOfLocalDayKey(weekend.friday, timezone);
  const to = endOfLocalDayKey(weekend.sunday, timezone);
  const [rows, weekendIds, snoozes] = await Promise.all([
    deps.loadRows(from, to),
    deps.loadWeekendSelectedIds(),
    deps.loadSnoozes(),
  ]);
  const views = rows.map((row) => withSelection(mapCalendarItemView(row), weekendIds));
  return buildWeekendCalendarVoice(views, snoozes, now);
}
