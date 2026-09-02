import { and, desc, eq, gte, inArray, not, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { db } from '../db.js';
import { curatorEventLeads, curatorPostSlides, curatorSocialPosts, earlySignals, sourceWatchers } from '../schema.js';
import { findSignalByContentHash, insertSignal, updateSignal } from '../early-signals/store.js';
import {
  classifyWatchlistText,
  classifyWatchlistYield,
  collapseWatchlistFindings,
  formatWatchlistBriefLines,
  isWatchlistBriefEligible,
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
  currentlyActionable: boolean;
  dateStatus: string;
  confidence: string;
  eventDate: string | null;
  publishedAt: string | null;
  endIsoDate: string | null;
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
        dateStatus: finding.dateStatus,
        role: finding.role,
        endIsoDate: finding.endIsoDate ?? null,
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

const HIDDEN_SIGNAL_STATES = ['skipped', 'dismissed', 'merged'] as const;

function activityItemFromRow(row: typeof earlySignals.$inferSelect): WatchlistActivityItem {
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
    currentlyActionable: meta.currentlyActionable === true,
    dateStatus: typeof meta.dateStatus === 'string' ? meta.dateStatus : row.eventDate ? 'resolved' : 'uncertain',
    confidence: row.confidenceLevel === 'high' || row.confidenceLevel === 'low' ? row.confidenceLevel : 'medium',
    eventDate: row.eventDate ? row.eventDate.toISOString().slice(0, 10) : null,
    publishedAt: typeof meta.publishedAt === 'string' ? meta.publishedAt : null,
    endIsoDate: typeof meta.endIsoDate === 'string' ? meta.endIsoDate : null,
  };
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
        not(inArray(earlySignals.signalState, [...HIDDEN_SIGNAL_STATES])),
      ),
    )
    .orderBy(desc(earlySignals.createdAt))
    .limit(limit);

  const findings: WatchlistActivityItem[] = rows.map(activityItemFromRow);

  const checkedRecently = watchers.filter((w) => {
    const at = w.lastSuccessfulCheck ?? w.lastAttemptedCheck;
    return at != null && at.getTime() >= since.getTime();
  });
  const failed = watchers.filter((w) => w.healthStatus === 'failed' || w.healthStatus === 'login_required');
  const ready = watchers.filter((w) => !w.lastSuccessfulCheck && w.enabled && !w.paused);
  const quiet = checkedRecently.filter((w) => !findings.some((f) => f.watcherId === w.id));

  const briefEligible = findings.filter((f) =>
    isWatchlistBriefEligible({
      baselineKind: f.baselineKind === 'historical_baseline' ? 'historical_baseline' : 'new',
      currentlyActionable: f.currentlyActionable,
      confidence: f.confidence === 'high' || f.confidence === 'low' ? f.confidence : 'medium',
      dateStatus: f.dateStatus === 'contradictory' || f.dateStatus === 'uncertain' ? f.dateStatus : 'resolved',
      eventDate: f.eventDate,
      type: (f.type as WatchlistFindingDraft['type']) ?? 'event',
      publishedAt: f.publishedAt,
      endIsoDate: f.endIsoDate,
    }),
  );

  const briefLines = formatWatchlistBriefLines({
    sourcesChecked: checkedRecently.length,
    accepted: briefEligible.map((f) => ({
      title: f.title,
      watchedSource: f.watchedSource,
      type: f.type,
      currentlyActionable: f.currentlyActionable,
      baselineKind: f.baselineKind,
      dateStatus: f.dateStatus,
      confidence: f.confidence,
      eventDate: f.eventDate,
      publishedAt: f.publishedAt,
      endIsoDate: f.endIsoDate,
    })),
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
    .where(
      and(
        eq(earlySignals.watcherId, watcherId),
        eq(earlySignals.sourceCategory, 'curator_watchlist'),
        not(inArray(earlySignals.signalState, [...HIDDEN_SIGNAL_STATES])),
      ),
    )
    .orderBy(desc(earlySignals.createdAt))
    .limit(limit);
  return rows.map(activityItemFromRow);
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

/** Known false-positive Watchlist findings from the 2026-09-02 yield pass. Do not delete rows. */
const PRECISION_SUPPRESSIONS: Array<{
  urlFragment: string;
  types?: string[];
  reason: string;
}> = [
  {
    urlFragment: '/p/Da4Vtd8llkF',
    reason: 'false_positive: FREE ADVICE FIFA World Cup caption is not an event',
  },
  {
    urlFragment: '/p/DcWLzktD1sN',
    reason: 'false_positive: atmosphere copy is not an event or promotion without a concrete offer',
  },
  {
    urlFragment: '/p/DcoNX6xjR0k',
    reason: 'false_positive: debut reminiscence is not a promotion without a concrete development',
  },
  {
    urlFragment: '/p/DbcGQcKu9md',
    types: ['opening_closing'],
    reason: 'false_positive: COME OUT AN MEET AN GREET is not an opening/closing',
  },
  {
    urlFragment: '/p/DcpBspFAGLL',
    types: ['promotion_sale', 'participation_call'],
    reason: 'redundant: ticket-sale announcement is not a promotion or participation call',
  },
  {
    urlFragment: '/reel/DcjRivYhHQr',
    reason: 'false_positive: throwback caption must not enter Discover review',
  },
  {
    urlFragment: '/reel/DcT3UM5iOIT',
    types: ['promotion_sale'],
    reason: 'false_positive: home-builder reel is not a concrete promotion',
  },
  {
    urlFragment: '/reel/DcMV9y8CqON',
    types: ['opening_closing'],
    reason: 'false_positive: staycation hotel reel is not an opening/closing',
  },
  {
    urlFragment: '/reel/Dcv_1TXONkA',
    types: ['opening_closing'],
    reason: 'false_positive: first-look caption is not an opening/closing',
  },
  {
    urlFragment: '/reel/DctvyNEM07C',
    types: ['promotion_sale'],
    reason: 'false_positive: concert hype is not a concrete promotion',
  },
  {
    urlFragment: '/reel/DcToioTCkU7',
    types: ['promotion_sale', 'participation_call'],
    reason: 'redundant: tickets on sale is not a discount promotion or participation call',
  },
  {
    urlFragment: '/p/DcBmfbTRkML',
    types: ['product_menu_launch'],
    reason: 'false_positive: cocktail atmosphere copy is not a named product launch',
  },
  {
    urlFragment: '/reel/DchhnTdiedU',
    reason: 'stale: Hot Country Nights date correction for 8.27.26 is already passed',
  },
  {
    urlFragment: '/p/DcmlfSAT3Uh',
    types: ['promotion_sale'],
    reason: 'redundant: storm cancellation is a schedule change, not a promotion',
  },
];

const BLUE_ROOM_DATE_REPAIRS: Array<{
  urlFragment: string;
  nameMatch: string;
  correctDate: string;
  previousDate: string;
  reason: string;
}> = [
  {
    urlFragment: '/p/Dcwr0RuDpXY',
    nameMatch: 'melton',
    correctDate: '2026-09-07',
    previousDate: '2026-09-05',
    reason:
      'weekday_contradiction: Monday Night Jam was stored as 2026-09-05 (Saturday). Publication 2026-09-01 (Tuesday Chicago) resolves next Monday to 2026-09-07.',
  },
  {
    urlFragment: '/p/Dcwr0RuDpXY',
    nameMatch: 'paganova',
    correctDate: '2026-09-05',
    previousDate: '2026-09-03',
    reason:
      'weekday_contradiction: Saturday Paganova was stored as 2026-09-03 (Thursday). Publication 2026-09-01 resolves next Saturday to 2026-09-05.',
  },
];

export async function applyWatchlistPrecisionSuppression(): Promise<{
  skipped: number;
  alreadySkipped: number;
  leadsRepaired: number;
}> {
  let skipped = 0;
  let alreadySkipped = 0;
  for (const rule of PRECISION_SUPPRESSIONS) {
    const rows = await db
      .select()
      .from(earlySignals)
      .where(
        and(
          eq(earlySignals.sourceCategory, 'curator_watchlist'),
          sql`${earlySignals.sourceUrl} ilike ${`%${rule.urlFragment}%`}`,
          rule.types ? inArray(earlySignals.signalType, rule.types) : undefined,
        ),
      );
    for (const row of rows) {
      if (row.verificationStatus === 'confirmed') continue;
      if (row.signalState === 'skipped' || row.signalState === 'dismissed') {
        alreadySkipped += 1;
        continue;
      }
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      await updateSignal(row.id, {
        signalState: 'skipped',
        metadata: {
          ...meta,
          skippedAt: new Date().toISOString(),
          sourceScreen: 'watchlist_precision_repair',
          skipNotDismiss: true,
          skipReason: rule.reason,
        },
      });
      skipped += 1;
    }
  }

  let leadsRepaired = 0;
  for (const repair of BLUE_ROOM_DATE_REPAIRS) {
    const leads = await db
      .select()
      .from(curatorEventLeads)
      .where(sql`${curatorEventLeads.discoveredViaPostUrl} ilike ${`%${repair.urlFragment}%`}`);
    for (const lead of leads) {
      if (!lead.eventName.toLowerCase().includes(repair.nameMatch)) continue;
      const current = lead.eventDate?.slice(0, 10) ?? null;
      if (current === repair.correctDate) continue;
      const summary = (lead.researchSummary ?? {}) as Record<string, unknown>;
      const meta = (lead.metadata ?? {}) as Record<string, unknown>;
      await db
        .update(curatorEventLeads)
        .set({
          eventDate: repair.correctDate,
          researchSummary: {
            ...summary,
            previousEventDate: current ?? repair.previousDate,
            dateRepairReason: repair.reason,
            dateRepairedAt: new Date().toISOString(),
          },
          metadata: {
            ...meta,
            previousEventDate: current ?? repair.previousDate,
            dateRepairReason: repair.reason,
          },
          updatedAt: new Date(),
        })
        .where(eq(curatorEventLeads.id, lead.id));
      leadsRepaired += 1;
    }
  }

  for (const repair of BLUE_ROOM_DATE_REPAIRS) {
    const signalRows = await db
      .select()
      .from(earlySignals)
      .where(sql`lower(${earlySignals.title}) like ${`%${repair.nameMatch}%`}`);
    for (const row of signalRows) {
      const iso = row.eventDate ? row.eventDate.toISOString().slice(0, 10) : null;
      if (iso === repair.correctDate) continue;
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      await updateSignal(row.id, {
        eventDate: new Date(`${repair.correctDate}T12:00:00Z`),
        metadata: {
          ...meta,
          previousEventDate: iso ?? repair.previousDate,
          dateRepairReason: repair.reason,
        },
      });
    }
  }

  const truckRows = await db
    .select()
    .from(earlySignals)
    .where(sql`${earlySignals.sourceUrl} ilike ${'%/p/DcwWRQkKGwa%'}`);
  for (const row of truckRows) {
    const nd = (row.normalizedData ?? {}) as Record<string, unknown>;
    if (nd.currentlyActionable === true && nd.endIsoDate === '2026-09-07') continue;
    await updateSignal(row.id, {
      normalizedData: {
        ...nd,
        currentlyActionable: true,
        endIsoDate: '2026-09-07',
        dateRepairReason: 'window_end: Labor Day Sept 7 remains current on 2026-09-02',
      },
    });
  }

  return { skipped, alreadySkipped, leadsRepaired };
}

