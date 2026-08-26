/**
 * Suppress parent-article calendar projections that are editorial containers,
 * not concrete events. Preserves discovery content_items and does not delete
 * child events.
 */
import { and, eq, ilike, inArray, or } from 'drizzle-orm';
import { db } from '../db.js';
import { contentItems, creatorCalendarItems } from '../schema.js';
import {
  classifyEditorialContainer,
  looksLikeEditorialContainerTitle,
} from '../ask-benson/editorial-container.js';
import { isCalendarParentContainerItem } from '../creator-calendar/population/eligibility.js';

export const KNOWN_PARENT_ARTICLE_TITLES = [
  'Where to Eat, Shop, Play, and Spend a Day in 20 KC Metro Neighborhoods',
  'Spend a Day in Parkville: Where to Eat, Shop, and Explore',
  'Family Shows in Kansas City | Schedule 2026–2027',
  'Events in Overland Park — Downtown OP',
];

function titleLooksLikeParent(title: string): boolean {
  if (KNOWN_PARENT_ARTICLE_TITLES.some((known) => known.toLowerCase() === title.trim().toLowerCase())) {
    return true;
  }
  if (looksLikeEditorialContainerTitle(title)) return true;
  return classifyEditorialContainer({ title }).isContainer;
}

export type ParentArticleRepairReport = {
  scannedContent: number;
  stampedContent: number;
  scannedCalendar: number;
  cancelledCalendar: number;
  examples: Array<{ before: string; after: string; id: string }>;
};

export async function repairParentArticleCalendarProjections(): Promise<ParentArticleRepairReport> {
  const report: ParentArticleRepairReport = {
    scannedContent: 0,
    stampedContent: 0,
    scannedCalendar: 0,
    cancelledCalendar: 0,
    examples: [],
  };

  const contentRows = await db
    .select({
      id: contentItems.id,
      topic: contentItems.topic,
      sourceUrl: contentItems.sourceUrl,
      eventStartsAt: contentItems.eventStartsAt,
      metadata: contentItems.metadata,
    })
    .from(contentItems)
    .where(
      or(
        ...KNOWN_PARENT_ARTICLE_TITLES.map((title) => ilike(contentItems.topic, title)),
        ilike(contentItems.topic, '%where to eat, shop%'),
        ilike(contentItems.topic, '%spend a day in%'),
        ilike(contentItems.topic, '%family shows%schedule%'),
        ilike(contentItems.topic, 'events in overland park%'),
      ),
    );

  report.scannedContent = contentRows.length;
  for (const row of contentRows) {
    if (!titleLooksLikeParent(row.topic)) continue;
    const meta = { ...((row.metadata ?? {}) as Record<string, unknown>) };
    const before = `${row.topic} | eventStartsAt=${row.eventStartsAt?.toISOString() ?? 'null'} | calendarEligible=${String(meta.calendarEligible ?? 'unset')}`;
    meta.editorialContainer = true;
    meta.calendarEligible = false;
    meta.parentArticleRepair = '2026-08-19';
    await db
      .update(contentItems)
      .set({
        eventStartsAt: null,
        metadata: meta,
        updatedAt: new Date(),
      })
      .where(eq(contentItems.id, row.id));
    report.stampedContent += 1;
    report.examples.push({
      id: row.id,
      before,
      after: `${row.topic} | eventStartsAt=null | calendarEligible=false`,
    });
  }

  const calendarRows = await db
    .select({
      id: creatorCalendarItems.id,
      title: creatorCalendarItems.title,
      planningStatus: creatorCalendarItems.planningStatus,
      startAt: creatorCalendarItems.startAt,
      sourceRecordId: creatorCalendarItems.sourceRecordId,
    })
    .from(creatorCalendarItems)
    .where(
      and(
        inArray(creatorCalendarItems.planningStatus, ['suggested', 'tentative']),
        or(
          ...KNOWN_PARENT_ARTICLE_TITLES.map((title) => ilike(creatorCalendarItems.title, title)),
          ilike(creatorCalendarItems.title, '%where to eat, shop%'),
          ilike(creatorCalendarItems.title, '%spend a day in%'),
          ilike(creatorCalendarItems.title, '%family shows%schedule%'),
          ilike(creatorCalendarItems.title, 'events in overland park%'),
        ),
      ),
    );

  report.scannedCalendar = calendarRows.length;
  for (const row of calendarRows) {
    if (!titleLooksLikeParent(row.title)) continue;
    if (isCalendarParentContainerItem({
      title: row.title,
      sourceUrl: null,
      summary: null,
      metadata: {},
      eventDate: row.startAt.toISOString(),
      category: null,
      ingest: null,
      sourceName: null,
    }) === false && !KNOWN_PARENT_ARTICLE_TITLES.includes(row.title)) {
      continue;
    }
    await db
      .update(creatorCalendarItems)
      .set({
        planningStatus: 'cancelled',
        updatedAt: new Date(),
        notes: 'Suppressed: parent editorial/container page, not a concrete event.',
      })
      .where(eq(creatorCalendarItems.id, row.id));
    report.cancelledCalendar += 1;
    report.examples.push({
      id: row.id,
      before: `calendar "${row.title}" ${row.planningStatus} ${row.startAt.toISOString()}`,
      after: `calendar cancelled (parent container)`,
    });
  }

  return report;
}

const isMain = process.argv[1]?.includes('repair-parent-article-calendar');
if (isMain) {
  const report = await repairParentArticleCalendarProjections();
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}
