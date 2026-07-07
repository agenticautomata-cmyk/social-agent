import type { InventoryItem } from '../inventory/normalize.js';
import { addDays, startOfWeekMonday, toDateOnlyString } from './dates.js';
import { loadAllPlannerItems } from './items.js';
import { recordsToPlannerCards, type PlannerCard } from './hub.js';
import { enrichPlannerCards, type PlannerCardWithSponsors } from '../benson-intelligence/planner-sponsors.js';
import { getCreatorTimezone } from '../datetime.js';

export type WeeklyDayColumn = {
  date: string;
  label: string;
  weekday: string;
  items: PlannerCardWithSponsors[];
};

export type WeeklyPlanResponse = {
  weekStart: string;
  weekEnd: string;
  days: WeeklyDayColumn[];
  unscheduled: PlannerCardWithSponsors[];
};

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function itemsById(items: InventoryItem[]): Map<string, InventoryItem> {
  return new Map(items.map((item) => [item.id, item]));
}

export async function computeWeeklyPlan(
  items: InventoryItem[],
  options?: { now?: Date },
): Promise<WeeklyPlanResponse> {
  const now = options?.now ?? new Date();
  const weekStart = startOfWeekMonday(now);
  const weekEnd = addDays(weekStart, 6);
  const lookup = itemsById(items);
  const plannerMap = await loadAllPlannerItems();

  const activeRecords = [...plannerMap.values()].filter(
    (r) => r.status === 'planned' || r.status === 'considering' || r.plannedDate,
  );

  const cards = recordsToPlannerCards(activeRecords, lookup);
  const byDate = new Map<string, PlannerCard[]>();
  const unscheduled: PlannerCard[] = [];

  for (const card of cards) {
    const date = card.planner.plannedDate;
    if (!date) {
      unscheduled.push(card);
      continue;
    }
    const list = byDate.get(date) ?? [];
    list.push(card);
    byDate.set(date, list);
  }

  const days: WeeklyDayColumn[] = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(weekStart, i);
    const dateStr = toDateOnlyString(d);
    const dayItems = await enrichPlannerCards(
      (byDate.get(dateStr) ?? []).sort((a, b) => a.planner.priority - b.planner.priority),
    );
    days.push({
      date: dateStr,
      weekday: WEEKDAY_LABELS[i]!,
      label: d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: getCreatorTimezone(),
      }),
      items: dayItems,
    });
  }

  const enrichedUnscheduled = await enrichPlannerCards(unscheduled);

  return {
    weekStart: toDateOnlyString(weekStart),
    weekEnd: toDateOnlyString(weekEnd),
    days,
    unscheduled: enrichedUnscheduled,
  };
}
