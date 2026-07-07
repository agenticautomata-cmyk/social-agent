import { createHash } from 'node:crypto';
import { and, desc, eq, gte, like } from 'drizzle-orm';
import { db } from '../db.js';
import { sources } from '../schema.js';
import { loadIngestedInventoryItems } from '../inventory/load-ingested.js';
import { computeCommandCenter } from '../inventory/command-center.js';
import type { InventoryItem } from '../inventory/normalize.js';
import { getLastLiveRefreshSummary, countNewItemsSince } from '../source-ingestion/last-refresh.js';
import { resolveFeedUrl } from '../source-ingestion/source-meta.js';
import { resolveTikTokAnalyticsContext } from '../creator-analytics/tiktok-context.js';
import { env } from '../env.js';
import type {
  OperationalFreshness,
  OperationalFreshnessItem,
  OperationalScrapeSource,
} from './types.js';

const ASK_BENSON_WINDOW_MS = 48 * 60 * 60 * 1000;
const SCRAPE_SOURCE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const RECENT_CONNECT_MS = 7 * 24 * 60 * 60 * 1000;

function toFreshnessItem(item: InventoryItem): OperationalFreshnessItem {
  return {
    id: item.id,
    title: item.title,
    category: item.category,
    eventDate: item.eventDate,
    createdAt: item.createdAt,
    sourceName: item.sourceName,
  };
}

function rankAskBensonToday(items: InventoryItem[], now: Date, limit: number): OperationalFreshnessItem[] {
  const cutoff = now.getTime() - ASK_BENSON_WINDOW_MS;
  return items
    .filter((item) => item.ingest?.startsWith('ask_benson'))
    .filter((item) => {
      const created = new Date(item.createdAt).getTime();
      return !Number.isNaN(created) && created >= cutoff;
    })
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
    .slice(0, limit)
    .map(toFreshnessItem);
}

async function loadRecentBensonScrapeSources(now: Date, limit: number): Promise<OperationalScrapeSource[]> {
  const cutoff = new Date(now.getTime() - SCRAPE_SOURCE_WINDOW_MS);
  const rows = await db
    .select()
    .from(sources)
    .where(and(eq(sources.type, 'scrape'), like(sources.name, '[Benson] %'), gte(sources.createdAt, cutoff)))
    .orderBy(desc(sources.createdAt))
    .limit(limit);

  return rows.map((source) => {
    const config = (source.config ?? {}) as Record<string, unknown>;
    return {
      id: source.id,
      name: source.name,
      feedUrl: resolveFeedUrl(config, source.type),
      createdAt: source.createdAt.toISOString(),
    };
  });
}

export function computeOperationalSnapshotVersion(freshness: OperationalFreshness): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        askCount: freshness.askBensonToday.length,
        askLatest: freshness.askBensonToday[0]?.createdAt ?? 'none',
        discoveredCount: freshness.discoveredToday.length,
        discoveredLatest: freshness.discoveredToday[0]?.createdAt ?? 'none',
        scrapeCount: freshness.newScrapeSources.length,
        tiktokConnectedAt: freshness.tiktokConnection.connectedAt ?? 'none',
        tiktokLastSync: freshness.tiktokConnection.lastSuccessfulSyncAt ?? 'none',
        lastRefresh: freshness.lastSourceRefresh.lastRefreshAt ?? 'none',
        newSinceRefresh: freshness.lastSourceRefresh.newItemsSinceRefresh,
      }),
    )
    .digest('hex')
    .slice(0, 16);
}

export function extractStoredOperationalSnapshotVersion(
  inputSnapshot: unknown,
): string | null {
  if (!inputSnapshot || typeof inputSnapshot !== 'object') return null;
  const version = (inputSnapshot as Record<string, unknown>).operationalSnapshotVersion;
  return typeof version === 'string' ? version : null;
}

export async function buildOperationalFreshness(options?: {
  now?: Date;
}): Promise<OperationalFreshness> {
  const now = options?.now ?? new Date();
  const [items, refreshBatch, tiktokCtx, newScrapeSources] = await Promise.all([
    loadIngestedInventoryItems(),
    getLastLiveRefreshSummary(),
    resolveTikTokAnalyticsContext(env.DEMO_MODE),
    loadRecentBensonScrapeSources(now, 8),
  ]);

  const briefing = computeCommandCenter(items, { now, limit: 6 });
  const newSince = await countNewItemsSince(refreshBatch.lastRefreshAt);

  const connectedAt = tiktokCtx.connectedAt;
  const recentlyConnected =
    tiktokCtx.connected &&
    connectedAt != null &&
    Date.now() - new Date(connectedAt).getTime() <= RECENT_CONNECT_MS;

  return {
    generatedAt: now.toISOString(),
    askBensonToday: rankAskBensonToday(items, now, 6),
    discoveredToday: briefing.sections.discoveredToday.items.map((card) => ({
      id: card.id,
      title: card.title,
      category: card.category,
      eventDate: null,
      createdAt: null,
      sourceName: card.sourceName,
    })),
    newScrapeSources,
    tiktokConnection: {
      status: tiktokCtx.connectionStatus,
      connected: tiktokCtx.connected,
      platformUsername: tiktokCtx.platformUsername,
      connectedAt,
      lastSuccessfulSyncAt: tiktokCtx.lastSuccessfulSyncAt,
      recentlyConnected,
    },
    lastSourceRefresh: {
      lastRefreshAt: refreshBatch.lastRefreshAt,
      itemsDiscovered: refreshBatch.itemsDiscovered,
      newItemsSinceRefresh: newSince,
    },
  };
}
