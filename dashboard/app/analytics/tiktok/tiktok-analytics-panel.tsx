'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  AnalyticsRecommendation,
  CreatorAnalyticsDashboard,
  DimensionPerformance,
  PatternCard,
  TrendPoint,
  VideoWithMetrics,
} from '../../../lib/creator-analytics-types';
import {
  formatNumber,
  formatPercent,
  recommendationLabel,
} from '../../../lib/creator-analytics-types';
import { formatDate, formatDateTime } from '../../../lib/datetime';
import { clientApiUrl, clientApiLongRunningUrl, parseApiJsonResponse } from '../../../lib/client-api';
import { useBensonDataRefresh } from '../../../lib/benson-data-refresh';
import { statusLabel, type TikTokConnectionStatus } from '../../../lib/tiktok-oauth-types';

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border-2 border-paper-edge p-4 bg-paper">
      <div className="text-2xs uppercase tracking-wider text-paper-muted">{label}</div>
      <div className="text-2xl font-bold tabular-nums mt-1">{value}</div>
      {sub ? <div className="text-2xs text-paper-dim mt-1">{sub}</div> : null}
    </div>
  );
}

function DimensionTable({
  title,
  rows,
  emptyLabel,
}: {
  title: string;
  rows: DimensionPerformance[];
  emptyLabel: string;
}) {
  return (
    <section className="border-2 border-paper-edge">
      <h3 className="text-sm font-bold lowercase px-4 py-3 border-b border-paper-edge bg-paper">
        {title}
      </h3>
      {rows.length === 0 ? (
        <p className="text-xs text-paper-muted italic p-4">{emptyLabel}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-paper-muted border-b border-paper-edge">
                <th className="px-4 py-2 font-normal">name</th>
                <th className="px-4 py-2 font-normal">videos</th>
                <th className="px-4 py-2 font-normal">avg views</th>
                <th className="px-4 py-2 font-normal">engagement</th>
                <th className="px-4 py-2 font-normal">index</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b border-paper-edge/60 hover:bg-paper/80">
                  <td className="px-4 py-2 lowercase">{row.label}</td>
                  <td className="px-4 py-2 tabular-nums">{row.videoCount}</td>
                  <td className="px-4 py-2 tabular-nums">{formatNumber(row.avgViews)}</td>
                  <td className="px-4 py-2 tabular-nums">{formatPercent(row.avgEngagementRate)}</td>
                  <td className="px-4 py-2 tabular-nums">{row.performanceIndex}×</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function VideoTable({
  title,
  videos,
  showPublished = false,
  emptyLabel = '// no videos yet — import data first',
}: {
  title: string;
  videos: VideoWithMetrics[];
  showPublished?: boolean;
  emptyLabel?: string;
}) {
  return (
    <section className="border-2 border-paper-edge">
      <h3 className="text-sm font-bold lowercase px-4 py-3 border-b border-paper-edge bg-paper">
        {title}
      </h3>
      {videos.length === 0 ? (
        <p className="text-xs text-paper-muted italic p-4">{emptyLabel}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-paper-muted border-b border-paper-edge">
                {showPublished ? <th className="px-4 py-2 font-normal">published</th> : null}
                <th className="px-4 py-2 font-normal">title</th>
                <th className="px-4 py-2 font-normal">category</th>
                <th className="px-4 py-2 font-normal">location</th>
                <th className="px-4 py-2 font-normal">views</th>
                <th className="px-4 py-2 font-normal">engagement</th>
                <th className="px-4 py-2 font-normal">index</th>
              </tr>
            </thead>
            <tbody>
              {videos.map((v) => (
                <tr key={v.id} className="border-b border-paper-edge/60 hover:bg-paper/80">
                  {showPublished ? (
                    <td className="px-4 py-2 tabular-nums whitespace-nowrap text-paper-muted">
                      {formatDate(v.publishedAt)}
                    </td>
                  ) : null}
                  <td className="px-4 py-2 max-w-xs truncate">
                    {v.postUrl ? (
                      <a
                        href={v.postUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-accent lowercase"
                      >
                        {(v.title ?? v.caption ?? v.videoId).toLowerCase()}
                      </a>
                    ) : (
                      (v.title ?? v.caption ?? v.videoId).toLowerCase()
                    )}
                  </td>
                  <td className="px-4 py-2 lowercase">{v.contentCategory?.replace(/_/g, ' ') ?? '—'}</td>
                  <td className="px-4 py-2 lowercase">{v.locationTag ?? '—'}</td>
                  <td className="px-4 py-2 tabular-nums">{formatNumber(v.views)}</td>
                  <td className="px-4 py-2 tabular-nums">{formatPercent(v.engagementRate)}</td>
                  <td className="px-4 py-2 tabular-nums">{v.performanceIndex}×</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ConnectionStatusBanner({
  connectionStatus,
  data,
  syncBusy,
  syncMsg,
  onSync,
}: {
  connectionStatus: TikTokConnectionStatus | null;
  data: CreatorAnalyticsDashboard;
  syncBusy: boolean;
  syncMsg: string | null;
  onSync: () => void;
}) {
  const conn = data.connection;
  const status = connectionStatus ?? (conn?.status as TikTokConnectionStatus | undefined) ?? 'disconnected';
  const isConnected = status === 'connected';
  const isLive = data.dataSource === 'live';
  const username =
    conn?.platformUsername ??
    (conn?.platformUserId ? `user ${conn.platformUserId}` : data.account?.username ?? 'kelliekc');

  const tone =
    isConnected && isLive
      ? 'border-green-700/50 bg-green-50/40'
      : isConnected
        ? 'border-accent/60 bg-paper'
        : data.demoMode
          ? 'border-dashed border-paper-edge bg-paper'
          : 'border-accent bg-paper';

  return (
    <section className={`border-2 px-4 py-4 space-y-3 ${tone}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`inline-flex items-center gap-2 text-sm font-bold lowercase ${
            isConnected ? 'text-green-800' : 'text-paper-ink'
          }`}
        >
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${
              isConnected ? 'bg-green-600' : 'bg-paper-muted'
            }`}
            aria-hidden
          />
          {statusLabel(status)}
        </span>
        {isLive ? (
          <span className="text-2xs uppercase tracking-wider border border-green-700/40 px-2 py-0.5 text-green-800">
            live data
          </span>
        ) : isConnected ? (
          <span className="text-2xs uppercase tracking-wider border border-accent/40 px-2 py-0.5 text-accent">
            sync needed
          </span>
        ) : data.demoMode ? (
          <span className="text-2xs uppercase tracking-wider border border-paper-edge px-2 py-0.5 text-paper-muted">
            demo mode
          </span>
        ) : null}
        {conn?.platformUsername ? (
          <span className="text-sm text-paper-soft">@{conn.platformUsername}</span>
        ) : (
          <span className="text-sm text-paper-muted">{username}</span>
        )}
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-2xs text-paper-muted">
        {conn?.connectedAt ? <span>connected {formatDateTime(conn.connectedAt)}</span> : null}
        {conn?.lastSuccessfulSyncAt ? (
          <span>last sync {formatDateTime(conn.lastSuccessfulSyncAt)}</span>
        ) : isConnected ? (
          <span>no sync yet</span>
        ) : null}
        {conn?.expiresAt ? <span>token expires {formatDateTime(conn.expiresAt)}</span> : null}
        {isLive ? <span>{data.summary.totalVideos} videos in analytics</span> : null}
      </div>

      {isConnected && !isLive ? (
        <div className="space-y-2">
          <p className="text-xs text-paper-soft">
            TikTok account is linked — run sync to load live video metrics.
          </p>
          <button
            type="button"
            disabled={syncBusy}
            onClick={onSync}
            className="min-h-[44px] border-2 border-paper-ink px-4 py-2 text-sm font-bold disabled:opacity-50"
          >
            {syncBusy ? 'syncing…' : 'sync tiktok now'}
          </button>
          {syncMsg ? <p className="text-2xs text-paper-muted">{syncMsg}</p> : null}
        </div>
      ) : null}

      {!isConnected && data.demoMode ? (
        <p className="text-xs text-paper-muted">
          Connect TikTok in{' '}
          <a href="/analytics/tiktok/settings" className="underline hover:text-accent">
            settings
          </a>{' '}
          for live analytics. Manual CSV import still works.
        </p>
      ) : null}
    </section>
  );
}

function TrendBars({
  title,
  points,
  metric,
  formula,
}: {
  title: string;
  points: TrendPoint[];
  metric: 'views' | 'engagement';
  formula?: string;
}) {
  const values = points.map((p) => (metric === 'views' ? p.totalViews : p.totalEngagement));
  const max = Math.max(...values, 1);

  return (
    <section className="border-2 border-paper-edge p-4 space-y-3">
      <div>
        <h3 className="text-sm font-bold lowercase">{title}</h3>
        {formula && <p className="text-2xs text-paper-muted mt-1">{formula}</p>}
      </div>
      {points.length === 0 ? (
        <p className="text-xs text-paper-muted italic">// not enough history yet</p>
      ) : (
        <div className="space-y-2">
          {points.map((p) => {
            const value = metric === 'views' ? p.totalViews : p.totalEngagement;
            return (
              <div key={p.period} className="grid grid-cols-[80px_1fr_80px] gap-3 items-center text-2xs">
                <span className="text-paper-muted truncate">{p.period}</span>
                <div className="h-3 bg-paper-edge">
                  <div
                    className="h-full bg-paper-ink"
                    style={{ width: `${Math.max(4, (value / max) * 100)}%` }}
                  />
                </div>
                <span className="tabular-nums text-right">{formatNumber(value)}</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function PatternSection({
  title,
  tone,
  patterns,
}: {
  title: string;
  tone: 'win' | 'lose';
  patterns: PatternCard[];
}) {
  return (
    <section className="border-2 border-paper-edge p-4 space-y-3">
      <h3 className="text-sm font-bold lowercase">{title}</h3>
      {patterns.length === 0 ? (
        <p className="text-xs text-paper-muted italic">// need more tagged videos to detect patterns</p>
      ) : (
        <div className="space-y-3">
          {patterns.map((p) => (
            <article
              key={p.label}
              className={`border px-3 py-2 text-xs ${
                tone === 'win' ? 'border-green-700/40' : 'border-amber-700/40'
              }`}
            >
              <div className="font-bold lowercase">{p.label}</div>
              <div className="text-paper-muted mt-1">
                {p.videoCount} videos · {formatNumber(p.avgViews)} avg views · {p.performanceIndex}×
                baseline · {formatPercent(p.avgEngagementRate)} engagement
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function Recommendations({ items }: { items: AnalyticsRecommendation[] }) {
  return (
    <section className="border-2 border-paper-ink p-5 space-y-4 bg-paper">
      <h3 className="text-lg font-bold lowercase">benson recommendations</h3>
      {items.length === 0 ? (
        <p className="text-sm text-paper-muted italic">
          // import more tagged videos to unlock data-driven recommendations
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((rec, idx) => (
            <article key={`${rec.type}-${idx}`} className="border border-paper-edge p-4 space-y-2">
              <div className="text-2xs uppercase tracking-wider text-paper-muted">
                {recommendationLabel(rec.type)} · {Math.round(rec.confidence * 100)}% confidence
              </div>
              <p className="text-sm leading-relaxed">{rec.message}</p>
              <div className="text-2xs text-paper-dim">
                n={rec.evidence.sampleSize} · {rec.evidence.performanceIndex}× baseline
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function TikTokAnalyticsPanel() {
  const { notifyLocalChange } = useBensonDataRefresh();
  const [data, setData] = useState<CreatorAnalyticsDashboard | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<TikTokConnectionStatus | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    return Promise.all([
      fetch(clientApiUrl('/api/analytics/tiktok'), { cache: 'no-store' }).then(async (res) => {
        const parsed = await parseApiJsonResponse<CreatorAnalyticsDashboard>(res);
        if (!parsed.ok) throw new Error(parsed.error);
        return parsed.data;
      }),
      fetch(clientApiUrl('/api/analytics/tiktok/status'), { cache: 'no-store' })
        .then((res) => (res.ok ? res.json() : null))
        .then((json: { status?: TikTokConnectionStatus } | null) => json?.status ?? null),
    ])
      .then(([dashboard, status]) => {
        setData(dashboard);
        setConnectionStatus(status);
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Failed to load TikTok analytics';
        setError(
          /failed to fetch/i.test(message)
            ? 'Could not reach Benson analytics. Check your connection and try again.'
            : message,
        );
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const isLive = data?.dataSource === 'live';

  async function runSync() {
    setSyncBusy(true);
    setSyncMsg(null);
    try {
      const res = await fetch(clientApiLongRunningUrl('/api/analytics/sync'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'tiktok' }),
      });
      const parsed = await parseApiJsonResponse<{
        error?: string;
        results?: Array<{
          ok: boolean;
          provider?: string;
          error?: string;
          reason?: string;
          imported?: number;
        }>;
      }>(res);
      if (!parsed.ok) throw new Error(parsed.error);
      const json = parsed.data;
      const tiktok =
        json.results?.find((r) => r.provider === 'tiktok') ??
        json.results?.find((r) => 'ok' in r);
      if (tiktok && !tiktok.ok) throw new Error(tiktok.error ?? 'TikTok sync failed');
      setSyncMsg(
        tiktok?.imported != null
          ? `Sync complete — ${tiktok.imported} videos imported from TikTok`
          : 'Sync complete',
      );
      notifyLocalChange(['analytics', 'home_briefing', 'recommendations']);
      await reload();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sync failed';
      setSyncMsg(
        /failed to fetch/i.test(message)
          ? 'Could not reach Benson to sync TikTok. Try again on Wi‑Fi.'
          : message,
      );
    } finally {
      setSyncBusy(false);
    }
  }

  const isConnected = connectionStatus === 'connected';
  const recentVideos = data?.recentVideos ?? [];

  if (loading) {
    return <p className="text-sm text-paper-muted italic">// loading tiktok analytics...</p>;
  }

  if (error) {
    return (
      <p className="text-sm text-red-700 border border-red-300 p-4">
        // tiktok analytics error: {error}
      </p>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-10">
      <ConnectionStatusBanner
        connectionStatus={connectionStatus}
        data={data}
        syncBusy={syncBusy}
        syncMsg={syncMsg}
        onSync={() => void runSync()}
      />

      {isLive && isConnected ? (
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <button
            type="button"
            disabled={syncBusy}
            onClick={() => void runSync()}
            className="border border-paper-edge px-3 py-1.5 hover:border-paper-ink disabled:opacity-50"
          >
            {syncBusy ? 'syncing…' : 'refresh from tiktok'}
          </button>
          {syncMsg ? <span className="text-paper-muted">{syncMsg}</span> : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-4 text-sm text-paper-muted">
        <span>
          account:{' '}
          {data.account?.usernameAvailable
            ? `@${data.account.username}`
            : data.connection?.platformUserId
              ? `user ${data.connection.platformUserId} (username unavailable)`
              : `@${data.account?.username ?? 'kelliekc'}`}
          {data.account?.displayName ? ` (${data.account.displayName})` : ''}
        </span>
        <span>·</span>
        <span>{data.summary.totalVideos} videos</span>
        <span>·</span>
        <span>
          followers:{' '}
          {data.followersAvailable && data.followersCount != null
            ? formatNumber(data.followersCount)
            : 'unavailable from current TikTok API permissions'}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="total views" value={formatNumber(data.summary.totalViews)} />
        <KpiCard label="median views" value={formatNumber(data.summary.medianViews)} />
        <KpiCard
          label="avg engagement"
          value={formatPercent(data.summary.avgEngagementRate)}
        />
        <KpiCard
          label="data through"
          value={
            data.summary.dataThrough
              ? formatDate(data.summary.dataThrough)
              : '—'
          }
        />
      </div>

      <VideoTable
        title="recent videos"
        videos={recentVideos}
        showPublished
        emptyLabel="// no videos yet — connect and sync, or import a CSV"
      />

      <Recommendations items={data.recommendations} />

      <VideoTable title="top videos by engagement" videos={data.topVideos} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <DimensionTable
          title="top categories"
          rows={data.topCategories}
          emptyLabel="// auto-tags from captions appear after sync — run sync if empty"
        />
        <DimensionTable
          title="top locations"
          rows={data.topLocations}
          emptyLabel="// KC neighborhoods and location tags from captions"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <DimensionTable
          title="top posting times"
          rows={data.topPostingTimes}
          emptyLabel="// posting times derived from published_at"
        />
        <DimensionTable
          title="sponsor performance"
          rows={data.sponsorPerformance}
          emptyLabel="// sponsor angles inferred from content type"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <TrendBars
          title="views trend"
          points={data.growthTrend}
          metric="views"
          formula={data.trendLabels?.views}
        />
        <TrendBars
          title="engagement trend"
          points={data.engagementTrend}
          metric="engagement"
          formula={data.trendLabels?.engagement}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <PatternSection title="repeatable winners" tone="win" patterns={data.repeatableWinners} />
        <PatternSection title="underperformers" tone="lose" patterns={data.underperformers} />
      </div>
    </div>
  );
}
