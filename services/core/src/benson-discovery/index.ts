import { desc } from 'drizzle-orm';
import { db } from '../db.js';
import { bensonDiscoveries } from '../schema.js';
import { loadSkipMatchers, isSkippedByMatchers } from '../creator-skip/index.js';
import { runBensonLocalDiscovery, type DiscoveryItem, type DiscoveryRunResult } from './run.js';

export type BensonDiscoverySnapshot = {
  id: string;
  createdAt: string;
  searchQueries: string[];
  summary: string;
  items: DiscoveryItem[];
  createdCount: number;
  updatedCount: number;
  scoredCount: number;
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

  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    searchQueries: row.searchQueries ?? [],
    summary: row.summary,
    items,
    createdCount: row.createdCount,
    updatedCount: row.updatedCount,
    scoredCount: row.scoredCount,
  };
}

export { runBensonLocalDiscovery, type DiscoveryRunResult, type DiscoveryItem };
