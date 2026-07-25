import { and, eq, isNotNull, not, or, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { contentItems, sources } from '../schema.js';
import { contentItemsChronologicalOrder } from '../content-order.js';
import { ingestedWithinRetentionWindow } from './retention.js';
import { isAudienceFreshContent, isKcSippsRoundup, contentPublishedAt } from './content-freshness.js';
import { normalizeInventoryItem, type InventoryItem } from './normalize.js';
import { inventoryItemIsCreatorFacing, filterCreatorFacingRecords } from '../creator-agent/filters.js';
import type { MapOpportunitySource } from './map-opportunities.js';

function parseLocationCandidates(
  value: unknown,
): MapOpportunitySource['locationCandidates'] {
  if (!Array.isArray(value)) return null;
  return value
    .map((candidate) => {
      if (!candidate || typeof candidate !== 'object') return null;
      const row = candidate as Record<string, unknown>;
      const latitude = Number(row.latitude);
      const longitude = Number(row.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
      return {
        placeId: String(row.placeId ?? ''),
        displayName: String(row.displayName ?? ''),
        formattedAddress: String(row.formattedAddress ?? ''),
        latitude,
        longitude,
        googleMapsUrl: String(row.googleMapsUrl ?? ''),
        score: Number(row.score ?? 0),
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate != null);
}

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

  const normalized = rows.map(({ item, sourceName, sourceType }) =>
    normalizeInventoryItem(item, sourceName, sourceType),
  );

  const audienceFresh = normalized.filter((item) => {
    if (!inventoryItemIsCreatorFacing(item)) return false;
    if (isKcSippsRoundup(item)) {
      const published = contentPublishedAt(item);
      if (!published) return false;
      const ageDays = (Date.now() - published.getTime()) / (24 * 60 * 60 * 1000);
      if (ageDays > 21) return false;
    }
    return isAudienceFreshContent(item);
  });

  return filterCreatorFacingRecords(
    audienceFresh.map((item) => ({
      ...item,
      businessName: item.businessName ?? item.title,
      summary: item.summary,
    })),
  );
}

/** Ingested inventory rows enriched with stored location candidates for map rendering. */
export async function loadMapOpportunitySources(): Promise<MapOpportunitySource[]> {
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

  return rows
    .map(({ item, sourceName, sourceType }) => ({
      ...normalizeInventoryItem(item, sourceName, sourceType),
      locationCandidates: parseLocationCandidates(item.locationCandidates),
    }))
    .filter((item) => {
      if (isKcSippsRoundup(item)) {
        const published = contentPublishedAt(item);
        if (!published) return false;
        const ageDays = (Date.now() - published.getTime()) / (24 * 60 * 60 * 1000);
        if (ageDays > 21) return false;
      }
      return isAudienceFreshContent(item);
    });
}
