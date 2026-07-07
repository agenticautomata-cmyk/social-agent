import { asc, sql } from 'drizzle-orm';
import { contentItems } from './schema.js';

/** Soonest event first; undated rows last, then oldest created first. */
export const contentItemsChronologicalOrder = [
  sql`${contentItems.eventStartsAt} asc nulls last`,
  asc(contentItems.createdAt),
] as const;

export function eventDateSortKey(value: string | Date | null | undefined): number {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const t = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
}

function startOfLocalDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * Sort tiers: soonest upcoming first; undated before far-future; past events last.
 * Lower tier sorts first; within tier, ascending event timestamp.
 */
export function upcomingInventorySortTuple(
  eventDate: string | Date | null | undefined,
  now: Date = new Date(),
): [tier: number, timestamp: number] {
  const timestamp = eventDateSortKey(eventDate);
  if (timestamp === Number.MAX_SAFE_INTEGER) {
    return [4, Number.MAX_SAFE_INTEGER];
  }

  const daysOut = (timestamp - startOfLocalDay(now)) / (24 * 60 * 60 * 1000);
  if (daysOut < 0) return [6, timestamp];
  if (daysOut <= 1) return [0, timestamp];
  if (daysOut <= 7) return [1, timestamp];
  if (daysOut <= 14) return [2, timestamp];
  if (daysOut <= 30) return [3, timestamp];
  return [5, timestamp];
}

export function compareEventChronological(
  aEventDate: string | Date | null | undefined,
  bEventDate: string | Date | null | undefined,
  aCreatedAt: string,
  bCreatedAt: string,
  now: Date = new Date(),
): number {
  const [aTier, aTime] = upcomingInventorySortTuple(aEventDate, now);
  const [bTier, bTime] = upcomingInventorySortTuple(bEventDate, now);
  if (aTier !== bTier) return aTier - bTier;
  if (aTime !== bTime) return aTime - bTime;
  return bCreatedAt.localeCompare(aCreatedAt);
}
