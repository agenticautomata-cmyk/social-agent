/**
 * Safe re-evaluation of open suggested calendar rows against canonical
 * public-event eligibility. Dry-run by default.
 *
 * Preserves: confirmed/planned/user-selected, Google-synced, skip/dismiss/suppress
 * tombstones. Expires/hides stale & newly ineligible suggestions with a reason.
 *
 * Usage:
 *   pnpm exec tsx src/scripts/reeval-public-event-suggestions.ts --dry-run
 *   pnpm exec tsx src/scripts/reeval-public-event-suggestions.ts --apply
 */
import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { db } from '../db.js';
import { contentItems, creatorCalendarItems, sources } from '../schema.js';
import { normalizeInventoryItem } from '../inventory/normalize.js';
import { evaluatePublicEventEligibility } from '../inventory/public-event-eligibility.js';
import {
  evaluateInventoryCalendarEligibility,
  inventoryCalendarAllDay,
} from '../creator-calendar/population/eligibility.js';
import {
  calendarInventoryExtractedTemporalSelect,
  temporalEvidenceFromCalendarRow,
} from '../creator-calendar/population/inventory-temporal-evidence.js';
import { inventoryLoadContentItemSelect } from '../inventory/inventory-load-projection.js';

const apply = process.argv.includes('--apply');
const dryRun = !apply;

type ChangeRow = {
  calendarId: string;
  title: string;
  startAt: string;
  action: 'expire' | 'fix_all_day' | 'skip_protected';
  reason: string;
};

const report = {
  dryRun,
  scannedSuggested: 0,
  protectedSkipped: 0,
  wouldExpire: 0,
  wouldFixAllDay: 0,
  appliedExpire: 0,
  appliedFixAllDay: 0,
  changes: [] as ChangeRow[],
};

const now = new Date();

const suggested = await db
  .select()
  .from(creatorCalendarItems)
  .where(
    and(
      eq(creatorCalendarItems.planningStatus, 'suggested'),
      isNull(creatorCalendarItems.dismissedAt),
      eq(creatorCalendarItems.sourceRecordType, 'content_item'),
      isNotNull(creatorCalendarItems.sourceRecordId),
    ),
  );

report.scannedSuggested = suggested.length;

const contentIds = [
  ...new Set(suggested.map((r) => r.sourceRecordId).filter((id): id is string => Boolean(id))),
];

const contentRows =
  contentIds.length === 0
    ? []
    : await db
        .select({
          ...inventoryLoadContentItemSelect,
          ...calendarInventoryExtractedTemporalSelect,
          sourceName: sources.name,
          sourceType: sources.type,
        })
        .from(contentItems)
        .leftJoin(sources, eq(sources.id, contentItems.sourceId))
        .where(inArray(contentItems.id, contentIds));

const byId = new Map(
  contentRows.map(
    ({
      sourceName,
      sourceType,
      calendarExtractedEventDate,
      calendarExtractedEventEndDate,
      calendarExtractedStartTime,
      calendarExtractedTitle,
      ...item
    }) => [
      item.id,
      normalizeInventoryItem(item, sourceName, sourceType, {
        temporalEvidence: temporalEvidenceFromCalendarRow({
          calendarExtractedEventDate,
          calendarExtractedEventEndDate,
          calendarExtractedStartTime,
          calendarExtractedTitle,
        }),
      }),
    ],
  ),
);

for (const row of suggested) {
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  if (row.userEditedAt) {
    report.protectedSkipped += 1;
    report.changes.push({
      calendarId: row.id,
      title: row.title,
      startAt: row.startAt.toISOString(),
      action: 'skip_protected',
      reason: 'user_edited',
    });
    continue;
  }
  if (meta.googleEventId || meta.syncedToGoogle === true) {
    report.protectedSkipped += 1;
    report.changes.push({
      calendarId: row.id,
      title: row.title,
      startAt: row.startAt.toISOString(),
      action: 'skip_protected',
      reason: 'google_synced_meta',
    });
    continue;
  }

  const inventory = row.sourceRecordId ? byId.get(row.sourceRecordId) : null;
  let expireReason: string | null = null;

  if (!inventory) {
    expireReason = 'missing_content_item';
  } else {
    const cal = evaluateInventoryCalendarEligibility(inventory, now);
    if (!cal.ok) {
      expireReason = `calendar:${cal.detail ?? cal.reason}`;
    } else {
      const pub = evaluatePublicEventEligibility(inventory, now);
      if (!pub.laneEligibility.calendar_suggestion) {
        expireReason = `public_event:${pub.rejectionReasonCode ?? 'ineligible'}`;
      }
    }
  }

  if (expireReason) {
    report.wouldExpire += 1;
    report.changes.push({
      calendarId: row.id,
      title: row.title,
      startAt: row.startAt.toISOString(),
      action: 'expire',
      reason: expireReason,
    });
    if (apply) {
      await db
        .update(creatorCalendarItems)
        .set({
          planningStatus: 'expired',
          status: 'expired',
          expiredAt: now,
          updatedAt: now,
          dismissReason: null,
          metadata: {
            ...meta,
            publicEventReeval: {
              at: now.toISOString(),
              action: 'expire',
              reason: expireReason,
            },
          },
        })
        .where(eq(creatorCalendarItems.id, row.id));
      report.appliedExpire += 1;
    }
    continue;
  }

  if (inventory && !row.allDay) {
    const start = new Date(inventory.eventDate ?? row.startAt);
    const shouldAllDay = inventoryCalendarAllDay(inventory, start);
    if (shouldAllDay) {
      report.wouldFixAllDay += 1;
      report.changes.push({
        calendarId: row.id,
        title: row.title,
        startAt: row.startAt.toISOString(),
        action: 'fix_all_day',
        reason: 'missing_trustworthy_clock',
      });
      if (apply) {
        await db
          .update(creatorCalendarItems)
          .set({
            allDay: true,
            updatedAt: now,
            metadata: {
              ...meta,
              publicEventReeval: {
                at: now.toISOString(),
                action: 'fix_all_day',
                reason: 'missing_trustworthy_clock',
              },
            },
          })
          .where(eq(creatorCalendarItems.id, row.id));
        report.appliedFixAllDay += 1;
      }
    } else if (
      inventory.eventDate &&
      Math.abs(new Date(inventory.eventDate).getTime() - row.startAt.getTime()) > 60_000
    ) {
      // Refresh mutable suggestion start from corrected inventory clock.
      report.wouldFixAllDay += 1;
      report.changes.push({
        calendarId: row.id,
        title: row.title,
        startAt: row.startAt.toISOString(),
        action: 'fix_all_day',
        reason: `refresh_start_at:${inventory.eventDate}`,
      });
      if (apply) {
        await db
          .update(creatorCalendarItems)
          .set({
            startAt: new Date(inventory.eventDate),
            endAt: inventory.eventEndDate ? new Date(inventory.eventEndDate) : row.endAt,
            allDay: false,
            updatedAt: now,
            metadata: {
              ...meta,
              publicEventReeval: {
                at: now.toISOString(),
                action: 'refresh_start_at',
                reason: 'inventory_clock_corrected',
                from: row.startAt.toISOString(),
                to: inventory.eventDate,
              },
            },
          })
          .where(eq(creatorCalendarItems.id, row.id));
        report.appliedFixAllDay += 1;
      }
    }
  }
}

console.log(JSON.stringify(report, null, 2));
process.exit(0);
