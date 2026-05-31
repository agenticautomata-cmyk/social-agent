import { eq, and, isNotNull } from 'drizzle-orm';
import { db } from '../db.js';
import { featureFlags } from '../feature-flags.js';
import {
  sources,
  scanRuns,
  contentItems,
  type Source,
  type NewContentItem,
} from '../schema.js';
import {
  loadRedditPosts,
  parseRedditSourceConfig,
  type NormalizedRedditPost,
} from '../providers/reddit.js';

export type ScanSourceResult = {
  sourceId: string;
  scanRunId: string;
  itemsFound: number;
  itemsCreated: number;
  itemsSkipped: number;
  error?: string;
};

export type ScanAllResult = {
  results: ScanSourceResult[];
  totalCreated: number;
};

async function insertRedditOpportunity(
  source: Source,
  post: NormalizedRedditPost,
): Promise<'created' | 'skipped'> {
  const existing = await db.query.contentItems.findFirst({
    where: and(
      eq(contentItems.sourceId, source.id),
      eq(contentItems.sourceExternalId, post.externalId),
    ),
  });
  if (existing) return 'skipped';

  const now = new Date();
  const row: NewContentItem = {
    campaignId: source.campaignId,
    type: 'industry_insight',
    language: 'en',
    state: 'planned',
    topic: post.title.slice(0, 500) || '(untitled reddit post)',
    hook: `r/${post.subreddit}`,
    script: post.body ? post.body.slice(0, 4000) : null,
    sourceId: source.id,
    sourceExternalId: post.externalId,
    sourceUrl: post.permalink,
    discoveredAt: now,
    locationName: post.locationHint,
    rawPayload: post as unknown as Record<string, unknown>,
    metadata: {
      ingest: 'reddit_rss',
      opportunityCategory: post.category,
      reddit: {
        subreddit: post.subreddit,
        publishedAt: post.publishedAt.toISOString(),
        locationClues: post.locationClues,
        url: post.permalink,
      },
    },
  };

  await db.insert(contentItems).values(row);
  return 'created';
}

async function scanRedditSource(source: Source): Promise<ScanSourceResult> {
  const config = parseRedditSourceConfig(source.config);
  const [run] = await db
    .insert(scanRuns)
    .values({
      sourceId: source.id,
      campaignId: source.campaignId,
      status: 'running',
    })
    .returning({ id: scanRuns.id });

  let itemsFound = 0;
  let itemsCreated = 0;
  let itemsSkipped = 0;
  let error: string | undefined;

  try {
    const posts = await loadRedditPosts(config);
    itemsFound = posts.length;

    for (const post of posts) {
      const outcome = await insertRedditOpportunity(source, post);
      if (outcome === 'created') itemsCreated++;
      else itemsSkipped++;
    }

    await db
      .update(sources)
      .set({
        lastScanAt: new Date(),
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(sources.id, source.id));

    await db
      .update(scanRuns)
      .set({
        status: 'success',
        finishedAt: new Date(),
        itemsFound,
        itemsCreated,
        itemsSkipped,
        payload: { format: 'rss', subreddit: config.subreddit, sort: config.sort },
      })
      .where(eq(scanRuns.id, run!.id));
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    await db
      .update(sources)
      .set({ lastError: error, updatedAt: new Date() })
      .where(eq(sources.id, source.id));
    await db
      .update(scanRuns)
      .set({
        status: 'failed',
        finishedAt: new Date(),
        itemsFound,
        itemsCreated,
        itemsSkipped,
        error,
      })
      .where(eq(scanRuns.id, run!.id));
  }

  return {
    sourceId: source.id,
    scanRunId: run!.id,
    itemsFound,
    itemsCreated,
    itemsSkipped,
    error,
  };
}

export async function scanSource(sourceId: string): Promise<ScanSourceResult> {
  const source = await db.query.sources.findFirst({ where: eq(sources.id, sourceId) });
  if (!source) throw new Error(`source not found: ${sourceId}`);
  if (!source.active) throw new Error(`source inactive: ${sourceId}`);
  if (source.type !== 'reddit') throw new Error(`unsupported source type: ${source.type}`);
  return scanRedditSource(source);
}

export async function scanAllActiveSources(opts?: {
  campaignId?: string;
  sourceId?: string;
}): Promise<ScanAllResult> {
  if (!featureFlags.enableKcScanner) {
    throw new Error('ENABLE_KC_SCANNER is not enabled');
  }

  const conditions = [eq(sources.active, true), eq(sources.type, 'reddit')];
  const allSources = await db.select().from(sources).where(and(...conditions));

  let targets = allSources;
  if (opts?.campaignId) {
    targets = targets.filter((s) => s.campaignId === opts.campaignId);
  }
  if (opts?.sourceId) {
    targets = targets.filter((s) => s.id === opts.sourceId);
  }

  const results: ScanSourceResult[] = [];
  for (const source of targets) {
    results.push(await scanRedditSource(source));
  }

  return {
    results,
    totalCreated: results.reduce((n, r) => n + r.itemsCreated, 0),
  };
}

export async function listIngestedContentIds(sourceId?: string): Promise<number> {
  const rows = await db
    .select({ id: contentItems.id })
    .from(contentItems)
    .where(
      sourceId
        ? and(eq(contentItems.sourceId, sourceId), isNotNull(contentItems.sourceExternalId))
        : isNotNull(contentItems.sourceId),
    );
  return rows.length;
}
