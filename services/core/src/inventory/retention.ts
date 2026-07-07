import { sql } from 'drizzle-orm';
import { contentItems } from '../schema.js';

/** Drop ingested rows more than this many days after the event (or discovery if no event date). */
export const INGEST_RETENTION_DAYS_PAST_EVENT = 10;

/** SQL fragment: ingested row is within the retention window. */
export function ingestedWithinRetentionWindow() {
  const days = INGEST_RETENTION_DAYS_PAST_EVENT;
  return sql`(
    (
      COALESCE(${contentItems.eventEndsAt}, ${contentItems.eventStartsAt}) IS NOT NULL
      AND COALESCE(${contentItems.eventEndsAt}, ${contentItems.eventStartsAt}) >= NOW() - (${days}::int * INTERVAL '1 day')
    )
    OR (
      COALESCE(${contentItems.eventEndsAt}, ${contentItems.eventStartsAt}) IS NULL
      AND ${contentItems.discoveredAt} >= NOW() - (${days}::int * INTERVAL '1 day')
    )
  )`;
}
