/**
 * Source Refresh — durable inventory produced by a single source.
 * Strict provenance: content_items.sourceId must equal the requested source.
 * Reuses Today clarity/lane CTAs; does not change scoring or ingestion.
 */

import { and, desc, eq, isNotNull, not, or, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { contentItems, sources } from '../schema.js';
import { inventoryLoadContentItemSelect } from '../inventory/inventory-load-projection.js';
import { normalizeInventoryItem, type InventoryItem } from '../inventory/normalize.js';
import { loadSkippedContentIdsForItems } from '../creator-skip/index.js';
import {
  buildTodayClarityFields,
  type TodayClarityCardFields,
} from '../inventory/today-clarity.js';

export type SourceItemFreshness = {
  lifecycleStatus: string | null;
  locationStatus: string | null;
  locationVerifiedAt: string | null;
  label: string;
};

export type SourceInventoryItemCard = {
  id: string;
  sourceId: string;
  title: string;
  displayTitle: string;
  businessName: string | null;
  venue: string | null;
  whereLabel: string | null;
  whenLabel: string | null;
  whySummary: string;
  lane: TodayClarityCardFields['lane'];
  laneLabel: string;
  sourceName: string | null;
  sourceUrl: string | null;
  viewSourceUrl: string | null;
  freshness: SourceItemFreshness;
  primaryAction: TodayClarityCardFields['primaryAction'];
  showMarkCovered: boolean;
  showSave: boolean;
  state: string;
  eventDate: string | null;
  discoveredAt: string | null;
};

function freshnessLabel(item: InventoryItem): SourceItemFreshness {
  const lifecycle = item.lifecycleStatus?.trim() || null;
  const location = item.locationStatus?.trim() || null;
  const parts: string[] = [];
  if (lifecycle) parts.push(lifecycle.replace(/_/g, ' '));
  if (location && location !== 'unresolved') {
    parts.push(
      location === 'resolved' || location === 'resolved_verified'
        ? 'location verified'
        : `location ${location.replace(/_/g, ' ')}`,
    );
  } else if (location === 'unresolved') {
    parts.push('location unresolved');
  }
  if (item.state && item.state !== 'new') parts.push(item.state.replace(/_/g, ' '));
  return {
    lifecycleStatus: lifecycle,
    locationStatus: location,
    locationVerifiedAt: item.locationVerifiedAt,
    label: parts.length > 0 ? parts.join(' · ') : 'ingested',
  };
}

/** Pure mapper — used by listDurableItemsForSource and unit tests. */
export function buildSourceInventoryItemCard(
  item: InventoryItem,
  sourceId: string,
): SourceInventoryItemCard {
  const clarity = buildTodayClarityFields(item);
  return {
    id: item.id,
    sourceId,
    title: item.title,
    displayTitle: clarity.displayTitle,
    businessName: item.businessName,
    venue: item.venue,
    whereLabel: clarity.whereLabel,
    whenLabel: clarity.whenLabel,
    whySummary: clarity.whySummary,
    lane: clarity.lane,
    laneLabel: clarity.laneLabel,
    sourceName: item.sourceName,
    sourceUrl: item.sourceUrl,
    viewSourceUrl: clarity.viewSourceUrl,
    freshness: freshnessLabel(item),
    primaryAction: clarity.primaryAction,
    showMarkCovered: clarity.showMarkCovered,
    showSave: clarity.showSave,
    state: item.state,
    eventDate: item.eventDate,
    discoveredAt: item.discoveredAt,
  };
}

/** Keep only rows whose FK sourceId matches the requested source. */
export function filterItemsBySourceProvenance<T extends { rowSourceId: string | null }>(
  rows: T[],
  sourceId: string,
): T[] {
  return rows.filter((row) => row.rowSourceId === sourceId);
}

export function viewSourceItemsLabel(count: number): string {
  if (count <= 0) return '';
  return count === 1 ? 'View 1 item' : `View ${count} items`;
}

/** Batch durable item counts keyed by sourceId (strict FK provenance). */
export async function countDurableItemsBySource(): Promise<Map<string, number>> {
  const rows = await db
    .select({
      sourceId: contentItems.sourceId,
      count: sql<number>`count(*)::int`,
    })
    .from(contentItems)
    .where(
      and(
        isNotNull(contentItems.sourceId),
        or(
          isNotNull(contentItems.sourceExternalId),
          isNotNull(contentItems.sourceUrl),
        ),
        not(sql`${contentItems.sourceExternalId} LIKE 'mock_%'`),
        not(sql`COALESCE(${contentItems.sourceUrl}, '') LIKE '%/comments/mock%'`),
      ),
    )
    .groupBy(contentItems.sourceId);

  const map = new Map<string, number>();
  for (const row of rows) {
    if (!row.sourceId) continue;
    map.set(row.sourceId, Number(row.count) || 0);
  }
  return map;
}

/**
 * Durable inventory for one source. Only rows whose content_items.sourceId
 * equals the requested id — never attach another source's items.
 */
export async function listDurableItemsForSource(
  sourceId: string,
  opts?: { limit?: number; includeSkipped?: boolean },
): Promise<{
  sourceId: string;
  sourceName: string | null;
  count: number;
  items: SourceInventoryItemCard[];
}> {
  const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 200);

  const [sourceRow] = await db
    .select({ id: sources.id, name: sources.name })
    .from(sources)
    .where(eq(sources.id, sourceId))
    .limit(1);
  if (!sourceRow) {
    return { sourceId, sourceName: null, count: 0, items: [] };
  }

  const rows = await db
    .select({
      ...inventoryLoadContentItemSelect,
      sourceName: sources.name,
      sourceType: sources.type,
      rowSourceId: contentItems.sourceId,
    })
    .from(contentItems)
    .leftJoin(sources, eq(sources.id, contentItems.sourceId))
    .where(
      and(
        eq(contentItems.sourceId, sourceId),
        or(
          isNotNull(contentItems.sourceExternalId),
          isNotNull(contentItems.sourceUrl),
        ),
        not(sql`${contentItems.sourceExternalId} LIKE 'mock_%'`),
        not(sql`COALESCE(${contentItems.sourceUrl}, '') LIKE '%/comments/mock%'`),
      ),
    )
    .orderBy(desc(contentItems.discoveredAt), desc(contentItems.createdAt))
    .limit(limit);

  // Provenance hard-check: never surface a row whose FK drifted.
  const normalized = filterItemsBySourceProvenance(rows, sourceId).map(
    ({ sourceName, sourceType, rowSourceId: _rowSourceId, ...item }) =>
      normalizeInventoryItem(item, sourceName, sourceType),
  );

  let items = normalized;
  if (!opts?.includeSkipped) {
    const skipped = await loadSkippedContentIdsForItems(items).catch(() => new Set<string>());
    if (skipped.size > 0) {
      items = items.filter((item) => !skipped.has(item.id));
    }
  }

  return {
    sourceId,
    sourceName: sourceRow.name,
    count: items.length,
    items: items.map((item) => buildSourceInventoryItemCard(item, sourceId)),
  };
}
