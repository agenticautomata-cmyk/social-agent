import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { db } from '../db.js';
import { curatorPostSlides, curatorSocialPosts, earlySignals, sourceWatchers } from '../schema.js';
import { findSignalByContentHash, insertSignal } from '../early-signals/store.js';
import {
  classifyWatchlistText,
  classifyWatchlistYield,
  collapseWatchlistFindings,
  formatWatchlistBriefLines,
  routeWatchlistFinding,
  type WatchlistFindingDraft,
  type WatchlistYieldClass,
} from './watchlist-intelligence.js';

const WATCHLIST_SIGNAL_TYPES = [
  'event',
  'opening_closing',
  'schedule_change',
  'promotion_sale',
  'product_menu_launch',
  'participation_call',
  'collaboration',
  'community_news',
  'venue_business_update',
  'other_verified_update',
  'curator_event_lead',
  'permit',
  'opening',
  'closing',
  'planning',
] as const;

export type WatchlistActivityItem = {
  id: string;
  type: string;
  title: string;
  summary: string;
  sourceUrl: string | null;
  watchedSource: string;
  watcherId: string | null;
  route: string;
  baselineKind: string;
  createdAt: string;
  verificationStatus: string;
};

export type WatchlistActivitySummary = {
  sourcesChecked: number;
  acceptedCount: number;
  awaitingReview: number;
  quietSources: number;
  failedSources: string[];
  readySources: string[];
  findings: WatchlistActivityItem[];
  nothingNew: string[];
  briefLines: string[];
};

function contentHashForFinding(finding: WatchlistFindingDraft): string {
  return createHash('sha256').update(`watchlist-finding:${finding.canonicalKey}`).digest('hex');
}

export async function persistWatchlistFindings(
  findings: WatchlistFindingDraft[],
  watcherId: string,
): Promise<{ stored: number; duplicates: number }> {
  let stored = 0;
  let duplicates = 0;
  for (const finding of collapseWatchlistFindings(findings)) {
    const route = routeWatchlistFinding(finding);
    if (route === 'suppressed') {
      duplicates += 1;
      continue;
    }
    const contentHash = contentHashForFinding(finding);
    const existing = await findSignalByContentHash(contentHash);
    if (existing) {
      duplicates += 1;
      continue;
    }
    await insertSignal({
      signalType: finding.type,
      title: finding.title.slice(0, 200),
      summary: finding.summary.slice(0, 2000),
      sourceUrl: finding.sourceUrl,
      sourceName: finding.watchedSource,
      sourceCategory: 'curator_watchlist',
      eventDate: finding.eventDate ? new Date(`${finding.eventDate}T12:00:00Z`) : null,
      rawText: finding.evidence,
      contentHash,
      watcherId,
      confidenceLevel: finding.confidence === 'high' ? 'high' : finding.confidence === 'low' ? 'low' : 'medium',
      confidenceScore: finding.confidence === 'high' ? '0.8' : finding.confidence === 'low' ? '0.35' : '0.55',
      urgencyLevel: finding.currentlyActionable ? 'early_opportunity' : 'planning_lead',
      urgencyScore: finding.currentlyActionable ? '0.6' : '0.3',
      verificationStatus: finding.currentlyActionable ? 'unverified' : 'unverified',
      signalState: route === 'discover_review' || route === 'calendar_eligible' ? 'needs_verification' : 'needs_verification',
      normalizedData: {
        watchlistFinding: true,
        findingType: finding.type,
        watchedSource: finding.watchedSource,
        originatingUrl: finding.sourceUrl,
        retrievedAt: finding.retrievedAt,
        publishedAt: finding.publishedAt,
        canonicalKey: finding.canonicalKey,
        route,
        baselineKind: finding.baselineKind,
        currentlyActionable: finding.currentlyActionable,
        evidence: finding.evidence,
      },
    });
    stored += 1;
  }
  return { stored, duplicates };
}

export function classifyAndCollectWatchlistFindings(input: {
  text: string;
  sourceUrl: string;
  watchedSource: string;
  retrievedAt: string;
  publishedAt?: string | null;
  firstCheckBaseline?: boolean;
  knownCanonicalKeys?: Set<string>;
  now?: Date;
}): WatchlistFindingDraft[] {
  return classifyWatchlistText(input).accepted;
}

export async function listWatchlistActivity(limit = 20): Promise<WatchlistActivitySummary> {
  const watchers = await db.select().from(sourceWatchers);
  const since = new Date(Date.now() - 36 * 60 * 60 * 1000);
  const rows = await db
    .select()
    .from(earlySignals)
    .where(
      and(
        eq(earlySignals.sourceCategory, 'curator_watchlist'),
        inArray(earlySignals.signalType, [...WATCHLIST_SIGNAL_TYPES]),
        gte(earlySignals.createdAt, since),
      ),
    )
    .orderBy(desc(earlySignals.createdAt))
    .limit(limit);

  const findings: WatchlistActivityItem[] = rows.map((row) => {
    const meta = (row.normalizedData ?? {}) as Record<string, unknown>;
    return {
      id: row.id,
      type: row.signalType,
      title: row.title,
      summary: row.summary ?? '',
      sourceUrl: row.sourceUrl,
      watchedSource: row.sourceName ?? 'Watched source',
      watcherId: row.watcherId,
      route: typeof meta.route === 'string' ? meta.route : 'early_signals',
      baselineKind: typeof meta.baselineKind === 'string' ? meta.baselineKind : 'new',
      createdAt: row.createdAt.toISOString(),
      verificationStatus: row.verificationStatus,
    };
  });

  const checkedRecently = watchers.filter((w) => {
    const at = w.lastSuccessfulCheck ?? w.lastAttemptedCheck;
    return at != null && at.getTime() >= since.getTime();
  });
  const failed = watchers.filter((w) => w.healthStatus === 'failed' || w.healthStatus === 'login_required');
  const ready = watchers.filter((w) => !w.lastSuccessfulCheck && w.enabled && !w.paused);
  const quiet = checkedRecently.filter((w) => !findings.some((f) => f.watcherId === w.id));

  const briefLines = formatWatchlistBriefLines({
    sourcesChecked: checkedRecently.length,
    accepted: findings.map((f) => ({ title: f.title, watchedSource: f.watchedSource, type: f.type })),
    awaitingReview: findings.filter((f) => f.verificationStatus !== 'confirmed').length,
    failedSources: failed.map((w) => w.sourceName),
    quietSources: quiet.length,
  });

  return {
    sourcesChecked: checkedRecently.length,
    acceptedCount: findings.length,
    awaitingReview: findings.filter((f) => f.verificationStatus !== 'confirmed').length,
    quietSources: quiet.length,
    failedSources: failed.map((w) => w.sourceName),
    readySources: ready.map((w) => w.sourceName),
    findings,
    nothingNew: quiet.map((w) => w.sourceName),
    briefLines,
  };
}

export async function listWatchlistFindingsForWatcher(
  watcherId: string,
  limit = 20,
): Promise<WatchlistActivityItem[]> {
  const rows = await db
    .select()
    .from(earlySignals)
    .where(and(eq(earlySignals.watcherId, watcherId), eq(earlySignals.sourceCategory, 'curator_watchlist')))
    .orderBy(desc(earlySignals.createdAt))
    .limit(limit);
  return rows.map((row) => {
    const meta = (row.normalizedData ?? {}) as Record<string, unknown>;
    return {
      id: row.id,
      type: row.signalType,
      title: row.title,
      summary: row.summary ?? '',
      sourceUrl: row.sourceUrl,
      watchedSource: row.sourceName ?? 'Watched source',
      watcherId: row.watcherId,
      route: typeof meta.route === 'string' ? meta.route : 'early_signals',
      baselineKind: typeof meta.baselineKind === 'string' ? meta.baselineKind : 'new',
      createdAt: row.createdAt.toISOString(),
      verificationStatus: row.verificationStatus,
    };
  });
}

export async function backfillWatchlistFindingsFromStoredPosts(limit = 80): Promise<{
  examined: number;
  stored: number;
}> {
  const posts = await db
    .select()
    .from(curatorSocialPosts)
    .orderBy(desc(curatorSocialPosts.createdAt))
    .limit(limit);
  let stored = 0;
  for (const post of posts) {
    const slides = await db
      .select({ text: curatorPostSlides.ocrText })
      .from(curatorPostSlides)
      .where(eq(curatorPostSlides.postId, post.id));
    const text = [post.caption, ...slides.map((s) => s.text)]
      .filter((part): part is string => Boolean(part && part.trim()))
      .join('\n');
    const accepted = classifyAndCollectWatchlistFindings({
      text,
      sourceUrl: post.postUrl,
      watchedSource: `@${post.profileHandle.replace(/^@/, '')}`,
      retrievedAt: new Date().toISOString(),
      publishedAt: post.publishedAt?.toISOString() ?? null,
      firstCheckBaseline: false,
    });
    const result = await persistWatchlistFindings(accepted, post.watcherId);
    stored += result.stored;
  }
  return { examined: posts.length, stored };
}

export function yieldClassForWatcher(input: {
  displayHealth: string;
  lastSuccessfulCheck: string | null;
  acceptedCount: number;
}): WatchlistYieldClass {
  return classifyWatchlistYield({
    ...input,
    lastAcceptedAt: null,
  });
}

