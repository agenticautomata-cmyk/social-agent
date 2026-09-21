/**
 * Ensure KCInsiders Substack (+ optional Facebook evidence page) are Watchlist sources,
 * and run the ordinary openings-radar check path (no force, no fixture).
 */
import { eq } from 'drizzle-orm';
import { createWatchedSource, recordSourceRun } from '../benson-scout/watchlist.js';
import { db } from '../db.js';
import { sourceWatchers } from '../schema.js';
import { isOpeningRoundupDocument } from './parse-roundup.js';
import { ingestOpeningRoundup } from './pipeline.js';
import {
  BIG_LIST_FACEBOOK_URL,
  fetchFacebookPublicPost,
  fetchSubstackFeed,
  fetchSubstackPost,
  JOYCEINKC_PROFILE,
  KCINSIDERS_SUBSTACK_FEED,
  KCINSIDERS_SUBSTACK_HOME,
} from './social-fetch.js';
import type { OpeningIngestResult } from './types.js';

export const OPENINGS_WATCHER_CONFIG_FLAG = 'openingsRadarEditorial';

export type OpeningsWatcherEnsureResult = {
  substackFeedWatcherId: string;
  substackHomeWatcherId: string | null;
  joyceProfileSourceId: string | null;
  facebookEvidenceWatcherId: string | null;
  created: string[];
  alreadyWatching: string[];
};

async function ensureWatcher(input: {
  url: string;
  monitoringMode: 'WATCH_FEED' | 'WATCH_PAGE' | 'WATCH_PUBLISHER' | 'SINGLE_ITEM';
  sourceName: string;
  configExtra?: Record<string, unknown>;
}): Promise<{ id: string; created: boolean }> {
  const result = await createWatchedSource({
    url: input.url,
    monitoringMode: input.monitoringMode,
    sourceName: input.sourceName,
  });
  const id = result.watcher.id;
  const [row] = await db.select().from(sourceWatchers).where(eq(sourceWatchers.id, id)).limit(1);
  const prior = (row?.config && typeof row.config === 'object' ? row.config : {}) as Record<
    string,
    unknown
  >;
  await db
    .update(sourceWatchers)
    .set({
      config: {
        ...prior,
        ...input.configExtra,
        [OPENINGS_WATCHER_CONFIG_FLAG]: true,
        openingsRadarRole:
          input.configExtra?.openingsRadarRole ??
          (input.monitoringMode === 'WATCH_FEED' ? 'substack_feed' : 'evidence_surface'),
      },
      sourceCategory:
        input.monitoringMode === 'WATCH_FEED' ? 'editorial_newsletter' : 'editorial_social',
      updatedAt: new Date(),
    })
    .where(eq(sourceWatchers.id, id));
  return { id, created: !result.alreadyWatching };
}

export async function ensureKcinsidersOpeningsWatchers(): Promise<OpeningsWatcherEnsureResult> {
  const created: string[] = [];
  const alreadyWatching: string[] = [];

  const feed = await ensureWatcher({
    url: KCINSIDERS_SUBSTACK_FEED,
    monitoringMode: 'WATCH_FEED',
    sourceName: 'KCinsiders Substack feed',
    configExtra: {
      openingsRadarRole: 'substack_feed',
      publisherHome: KCINSIDERS_SUBSTACK_HOME,
      joyceProfile: JOYCEINKC_PROFILE,
    },
  });
  (feed.created ? created : alreadyWatching).push(feed.id);

  const home = await ensureWatcher({
    url: KCINSIDERS_SUBSTACK_HOME,
    monitoringMode: 'WATCH_PAGE',
    sourceName: 'KCinsiders Substack',
    configExtra: { openingsRadarRole: 'substack_home' },
  });
  (home.created ? created : alreadyWatching).push(home.id);

  let facebookEvidenceWatcherId: string | null = null;
  try {
    const fb = await ensureWatcher({
      url: 'https://www.facebook.com/JoyceKC/',
      monitoringMode: 'WATCH_PAGE',
      sourceName: 'JoyceKC / KCinsiders Facebook',
      configExtra: {
        openingsRadarRole: 'facebook_evidence',
        knownBigListPostUrl: BIG_LIST_FACEBOOK_URL,
      },
    });
    facebookEvidenceWatcherId = fb.id;
    (fb.created ? created : alreadyWatching).push(fb.id);
  } catch {
    facebookEvidenceWatcherId = null;
  }

  return {
    substackFeedWatcherId: feed.id,
    substackHomeWatcherId: home.id,
    joyceProfileSourceId: null,
    facebookEvidenceWatcherId,
    created,
    alreadyWatching,
  };
}

export function isOpeningsRadarWatcher(watcher: {
  config?: unknown;
  sourceUrl?: string | null;
  sourceName?: string | null;
}): boolean {
  const cfg = (watcher.config && typeof watcher.config === 'object' ? watcher.config : {}) as Record<
    string,
    unknown
  >;
  if (cfg[OPENINGS_WATCHER_CONFIG_FLAG] === true) return true;
  const url = (watcher.sourceUrl ?? '').toLowerCase();
  const name = (watcher.sourceName ?? '').toLowerCase();
  return (
    url.includes('kcinsiders.substack.com') ||
    url.includes('facebook.com/joycekc') ||
    name.includes('kcinsiders')
  );
}

export type OpeningsWatcherCheckReport = {
  watcherId: string;
  role: string;
  ok: boolean;
  feedItemsExamined: number;
  roundupsRecognized: number;
  runs: OpeningIngestResult[];
  facebookBigList?: OpeningIngestResult | null;
  error?: string;
  inspectionSummary: string;
};

/**
 * Ordinary scheduled/manual check for openings-capable watchers.
 * No force:true, no fixture injection, no direct DB insertion of establishments.
 */
export async function runOpeningsRadarWatcherCheck(
  watcherId: string,
  triggerType: 'manual' | 'scheduled' = 'manual',
): Promise<OpeningsWatcherCheckReport> {
  const [watcherRow] = await db
    .select()
    .from(sourceWatchers)
    .where(eq(sourceWatchers.id, watcherId))
    .limit(1);
  if (!watcherRow) {
    return {
      watcherId,
      role: 'unknown',
      ok: false,
      feedItemsExamined: 0,
      roundupsRecognized: 0,
      runs: [],
      error: 'Source not found',
      inspectionSummary: 'Source not found',
    };
  }

  const cfg = (watcherRow.config && typeof watcherRow.config === 'object'
    ? watcherRow.config
    : {}) as Record<string, unknown>;
  const role = String(
    cfg.openingsRadarRole ??
      (/facebook\.com\/joycekc/i.test(watcherRow.sourceUrl)
        ? 'facebook_evidence'
        : 'substack_feed'),
  );
  const sourceUrl = watcherRow.sourceUrl;
  const runs: OpeningIngestResult[] = [];
  let feedItemsExamined = 0;
  let roundupsRecognized = 0;
  let facebookBigList: OpeningIngestResult | null = null;

  try {
    if (role === 'facebook_evidence' || /facebook\.com\/joycekc/i.test(sourceUrl)) {
      // Evidence surface: re-fetch known BIG LIST post via public embed (not a fixture).
      const knownUrl = String(cfg.knownBigListPostUrl ?? BIG_LIST_FACEBOOK_URL);
      const fetched = await fetchFacebookPublicPost(knownUrl);
      if (fetched.access === 'fetched' && fetched.text) {
        roundupsRecognized += 1;
        facebookBigList = await ingestOpeningRoundup({
          subject: fetched.title ?? "The BIG LIST: Who's Opening, Where & When",
          bodyText: fetched.text,
          urls: [],
          socialPostUrl: knownUrl,
          senderName: 'Joyce Smith / KCinsiders',
          senderEmail: null,
          receivedAt: fetched.publishedAt ? new Date(fetched.publishedAt) : new Date('2026-09-20T16:39:00Z'),
          channel: 'social',
          fetchArticle: false,
          force: false,
        });
        runs.push(facebookBigList);
      }

      const summary =
        facebookBigList && facebookBigList.entriesParsed > 0
          ? `Facebook BIG LIST: parsed ${facebookBigList.entriesParsed}, created ${facebookBigList.locationsCreated}, updated ${facebookBigList.locationsUpdated}`
          : fetched.access === 'fetched'
            ? 'Facebook post fetched but not recognized as openings roundup'
            : `Facebook fetch ${fetched.access}: ${fetched.blockedReason ?? ''}`;

      await finalizeWatcherRun({
        watcherId,
        triggerType,
        ok: true,
        summary,
        newCount: facebookBigList?.locationsCreated ?? 0,
        itemCount: facebookBigList?.entriesParsed ?? 0,
      });

      return {
        watcherId,
        role,
        ok: true,
        feedItemsExamined: 1,
        roundupsRecognized,
        runs,
        facebookBigList,
        inspectionSummary: summary,
      };
    }

    // Default: Substack feed / home — fetch RSS, then full post bodies for roundup candidates
    const feed = await fetchSubstackFeed(KCINSIDERS_SUBSTACK_FEED);
    if (feed.access !== 'fetched') {
      const summary = `Substack feed blocked: ${feed.blockedReason ?? 'unknown'}`;
      await finalizeWatcherRun({
        watcherId,
        triggerType,
        ok: false,
        summary,
        failure: summary,
      });
      return {
        watcherId,
        role,
        ok: false,
        feedItemsExamined: 0,
        roundupsRecognized: 0,
        runs: [],
        error: summary,
        inspectionSummary: summary,
      };
    }

    feedItemsExamined = feed.items.length;
    for (const itemFeed of feed.items) {
      const preview = `${itemFeed.title}\n${itemFeed.summary ?? ''}`;
      // Prefer clear multi-establishment roundups. Skip soft teasers / single-spotlight posts
      // that mention "opening" without a numbered/bulleted list structure.
      const titleLooksRoundup =
        /\b(big list|who.?s opening|list of .+ openings|openings?,?\s+closings?|restaurant .+ openings)\b/i.test(
          itemFeed.title,
        );
      if (!titleLooksRoundup && !isOpeningRoundupDocument(itemFeed.title, preview)) {
        continue;
      }
      const post = await fetchSubstackPost(itemFeed.url);
      if (post.access !== 'fetched' || !post.text) continue;
      if (!isOpeningRoundupDocument(post.title ?? itemFeed.title, post.text)) continue;
      // Require at least 3 establishment-shaped blocks to avoid photo-caption noise
      const { parseOpeningRoundup } = await import('./parse-roundup.js');
      const previewEntries = parseOpeningRoundup({
        subject: post.title ?? itemFeed.title,
        text: post.text,
        publicationYear: post.publishedAt ? new Date(post.publishedAt).getFullYear() : undefined,
      });
      if (previewEntries.length < 3) continue;
      roundupsRecognized += 1;
      const result = await ingestOpeningRoundup({
        subject: post.title ?? itemFeed.title,
        bodyText: post.text,
        urls: [post.url],
        senderName: 'Joyce Smith',
        senderEmail: 'kcinsiders@substack.com',
        receivedAt: post.publishedAt ? new Date(post.publishedAt) : undefined,
        channel: 'article',
        fetchArticle: false,
        force: false,
      });
      runs.push(result);
    }

    const created = runs.reduce((n, r) => n + r.locationsCreated, 0);
    const updated = runs.reduce((n, r) => n + r.locationsUpdated, 0);
    const parsed = runs.reduce((n, r) => n + r.entriesParsed, 0);
    const summary = `Substack openings check: ${feedItemsExamined} feed items, ${roundupsRecognized} roundups, parsed ${parsed}, created ${created}, updated ${updated}`;

    await finalizeWatcherRun({
      watcherId,
      triggerType,
      ok: true,
      summary,
      newCount: created,
      itemCount: parsed,
    });

    return {
      watcherId,
      role,
      ok: true,
      feedItemsExamined,
      roundupsRecognized,
      runs,
      inspectionSummary: summary,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'openings watcher failed';
    await finalizeWatcherRun({
      watcherId,
      triggerType,
      ok: false,
      summary: message,
      failure: message,
    });
    return {
      watcherId,
      role,
      ok: false,
      feedItemsExamined,
      roundupsRecognized,
      runs,
      error: message,
      inspectionSummary: message,
    };
  }
}

async function finalizeWatcherRun(input: {
  watcherId: string;
  triggerType: 'manual' | 'scheduled';
  ok: boolean;
  summary: string;
  failure?: string;
  newCount?: number;
  itemCount?: number;
}) {
  const now = new Date();
  const [row] = await db.select().from(sourceWatchers).where(eq(sourceWatchers.id, input.watcherId)).limit(1);
  const prior = (row?.config && typeof row.config === 'object' ? row.config : {}) as Record<string, unknown>;
  await db
    .update(sourceWatchers)
    .set({
      lastAttemptedCheck: now,
      lastSuccessfulCheck: input.ok ? now : row?.lastSuccessfulCheck ?? null,
      lastFailureAt: input.ok ? null : now,
      lastFailureMessage: input.ok ? null : (input.failure ?? input.summary).slice(0, 400),
      healthStatus: input.ok ? (input.newCount && input.newCount > 0 ? 'healthy' : 'healthy') : 'degraded',
      consecutiveFailureCount: input.ok ? 0 : (row?.consecutiveFailureCount ?? 0) + 1,
      config: {
        ...prior,
        [OPENINGS_WATCHER_CONFIG_FLAG]: true,
        statusExplanation: input.summary,
        lastCheckOutcome: input.ok ? 'ok' : 'error',
        lastCheckCompletedOk: input.ok,
        lastCompletedCheckAt: now.toISOString(),
      },
      updatedAt: now,
    })
    .where(eq(sourceWatchers.id, input.watcherId));

  await recordSourceRun({
    watcherId: input.watcherId,
    triggerType: input.triggerType,
    finalFetchMethod: 'openings_radar_editorial',
    itemCount: input.itemCount ?? 0,
    newCount: input.newCount ?? 0,
    qualifiedCount: input.newCount ?? 0,
    sanitizedFailure: input.ok ? undefined : input.failure,
    metadata: { inspectionSummary: input.summary, openingsRadar: true },
  });
}
