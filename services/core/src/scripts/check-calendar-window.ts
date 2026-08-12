#!/usr/bin/env -S pnpm exec tsx
import { db } from '../db.js';
import { creatorCalendarItems } from '../schema.js';
import { gte, lte, and } from 'drizzle-orm';
import { getLocalCalendarDay, isPriorCreatorCalendarDay } from '../datetime.js';

const rows = await db
  .select({
    id: creatorCalendarItems.id,
    title: creatorCalendarItems.title,
    startAt: creatorCalendarItems.startAt,
    endAt: creatorCalendarItems.endAt,
    planningStatus: creatorCalendarItems.planningStatus,
    allDay: creatorCalendarItems.allDay,
  })
  .from(creatorCalendarItems)
  .where(
    and(
      gte(creatorCalendarItems.startAt, new Date('2026-07-15')),
      lte(creatorCalendarItems.startAt, new Date('2026-08-10')),
    ),
  )
  .orderBy(creatorCalendarItems.startAt);

for (const r of rows) {
  const kcDay = getLocalCalendarDay(r.startAt);
  const isPast = isPriorCreatorCalendarDay(r.startAt);
  console.log(
    r.startAt.toISOString(),
    '| kcDay=', kcDay,
    '| past=', isPast,
    '|', r.planningStatus,
    '| allDay=', r.allDay,
    '|', r.title,
  );
}
console.log(`total: ${rows.length}`);
process.exit(0);
