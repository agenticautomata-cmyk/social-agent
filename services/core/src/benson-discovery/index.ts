import { desc } from 'drizzle-orm';
import { db } from '../db.js';
import { bensonDiscoveries } from '../schema.js';
import { loadSkipMatchers, isSkippedByMatchers } from '../creator-skip/index.js';
import { runBensonLocalDiscovery, type DiscoveryItem, type DiscoveryRunResult } from './run.js';
import { shapeDiscoveryForHome } from '../pre-alpha/home-scout-surface.js';

export type BensonDiscoverySnapshot = {
  id: string;
  createdAt: string;
  searchQueries: string[];
  summary: string;
  items: DiscoveryItem[];
  createdCount: number;
  updatedCount: number;
  scoredCount: number;
  /** Home-safe surface — null when batch is stale or only raw scout prose. */
  homeSurface: ReturnType<typeof shapeDiscoveryForHome>['surface'];
  homeHandledNote: string | null;
  homeSuppressedReason: string | null;
};

function discoveryItemIsSkipped(
  item: DiscoveryItem,
  matchers: Awaited<ReturnType<typeof loadSkipMatchers>>,
): boolean {
  if (!item.contentItemId) return false;
  return isSkippedByMatchers(matchers, {
    id: item.contentItemId,
    title: item.title,
    eventDate: item.eventStartsAt,
    locationName: item.location,
    sourceUrl: item.sourceUrl,
  });
}

export async function getLatestDiscovery(): Promise<BensonDiscoverySnapshot | null> {
  const [row, matchers] = await Promise.all([
    db
      .select()
      .from(bensonDiscoveries)
      .orderBy(desc(bensonDiscoveries.createdAt))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    loadSkipMatchers(),
  ]);

  if (!row) return null;

  const rawItems = (row.itemsFound ?? []) as DiscoveryItem[];
  const items = rawItems.filter((item) => !discoveryItemIsSkipped(item, matchers));
  const createdAt = row.createdAt.toISOString();
  const shaped = shapeDiscoveryForHome({
    createdAt,
    summary: row.summary,
    items: items.map((i) => ({
      contentItemId: i.contentItemId,
      title: i.title,
      location: i.location,
      eventStartsAt: i.eventStartsAt,
      sourceUrl: i.sourceUrl,
    })),
    createdCount: row.createdCount,
  });

  return {
    id: row.id,
    createdAt,
    searchQueries: shaped.surface ? [] : (row.searchQueries ?? []),
    // Never return raw web-search markdown to clients.
    summary: shaped.surface?.blurb ?? '',
    items: shaped.surface?.items ?? [],
    createdCount: row.createdCount,
    updatedCount: row.updatedCount,
    scoredCount: row.scoredCount,
    homeSurface: shaped.surface,
    homeHandledNote: shaped.handledNote,
    homeSuppressedReason: shaped.suppressedReason,
  };
}

export { runBensonLocalDiscovery, type DiscoveryRunResult, type DiscoveryItem };
