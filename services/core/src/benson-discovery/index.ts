import { desc } from 'drizzle-orm';
import { db } from '../db.js';
import { bensonDiscoveries } from '../schema.js';
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

export async function getLatestDiscovery(): Promise<BensonDiscoverySnapshot | null> {
  const [row] = await db
    .select()
    .from(bensonDiscoveries)
    .orderBy(desc(bensonDiscoveries.createdAt))
    .limit(1);

  if (!row) return null;

  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    searchQueries: row.searchQueries ?? [],
    summary: row.summary,
    items: (row.itemsFound ?? []) as DiscoveryItem[],
    createdCount: row.createdCount,
    updatedCount: row.updatedCount,
    scoredCount: row.scoredCount,
  };
}

export { runBensonLocalDiscovery, type DiscoveryRunResult, type DiscoveryItem };
