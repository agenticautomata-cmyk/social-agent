import { sql } from 'drizzle-orm';
import { contentItems } from '../../schema.js';
import type { InventoryTemporalEvidence } from '../../inventory/normalize.js';

/**
 * Thin jsonb text paths from raw_payload.extracted for Calendar population and Weekend List.
 * Does not select or hydrate the full raw_payload blob.
 */
export const calendarInventoryExtractedTemporalSelect = {
  calendarExtractedEventDate: sql<string | null>`(${contentItems.rawPayload} -> 'extracted' ->> 'eventDate')`,
  calendarExtractedEventEndDate: sql<string | null>`(${contentItems.rawPayload} -> 'extracted' ->> 'eventEndDate')`,
  calendarExtractedStartTime: sql<string | null>`(${contentItems.rawPayload} -> 'extracted' ->> 'startTime')`,
  calendarExtractedTitle: sql<string | null>`(${contentItems.rawPayload} -> 'extracted' ->> 'title')`,
} as const;

function asNullableString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Map Calendar SELECT aliases into load-time temporal evidence (not persisted). */
export function temporalEvidenceFromCalendarRow(row: {
  calendarExtractedEventDate?: unknown;
  calendarExtractedEventEndDate?: unknown;
  calendarExtractedStartTime?: unknown;
  calendarExtractedTitle?: unknown;
}): InventoryTemporalEvidence {
  return {
    eventDate: asNullableString(row.calendarExtractedEventDate),
    eventEndDate: asNullableString(row.calendarExtractedEventEndDate),
    startTime: asNullableString(row.calendarExtractedStartTime),
    title: asNullableString(row.calendarExtractedTitle),
  };
}
