import { and, eq, isNotNull, not, or, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { contentItems, sources } from '../schema.js';
import { contentItemsChronologicalOrder } from '../content-order.js';
import { ingestedWithinRetentionWindow } from './retention.js';
import { normalizeInventoryItem, type InventoryItem } from './normalize.js';

/** Real KC-ingested rows only — excludes demo pipeline items and legacy mock reddit. */
export async function loadIngestedInventoryItems(): Promise<InventoryItem[]> {
  const rows = await db
    .select({
      item: contentItems,
      sourceName: sources.name,
      sourceType: sources.type,
    })
    .from(contentItems)
    .leftJoin(sources, eq(sources.id, contentItems.sourceId))
    .where(
      and(
        isNotNull(contentItems.sourceId),
        or(
          isNotNull(contentItems.sourceExternalId),
          isNotNull(contentItems.sourceUrl),
        ),
        not(sql`${contentItems.sourceExternalId} LIKE 'mock_%'`),
        not(sql`COALESCE(${contentItems.sourceUrl}, '') LIKE '%/comments/mock%'`),
        ingestedWithinRetentionWindow(),
      ),
    )
    .orderBy(...contentItemsChronologicalOrder);

  return rows.map(({ item, sourceName, sourceType }) =>
    normalizeInventoryItem(item, sourceName, sourceType),
  );
}
