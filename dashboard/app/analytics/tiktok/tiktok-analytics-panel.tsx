'use client';

import { useEffect, useState } from 'react';
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

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

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

function VideoTable({ title, videos }: { title: string; videos: VideoWithMetrics[] }) {
  return (
    <section className="border-2 border-paper-edge">
      <h3 className="text-sm font-bold lowercase px-4 py-3 border-b border-paper-edge bg-paper">
        {title}
      </h3>
      {videos.length === 0 ? (
        <p className="text-xs text-paper-muted italic p-4">// no videos yet — import data first</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-paper-muted border-b border-paper-edge">
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

function TrendBars({ title, points }: { title: string; points: TrendPoint[] }) {
  const maxViews = Math.max(...points.map((p) => p.totalViews), 1);

  return (
    <section className="border-2 border-paper-edge p-4 space-y-3">
      <h3 className="text-sm font-bold lowercase">{title}</h3>
      {points.length === 0 ? (
        <p className="text-xs text-paper-muted italic">// not enough history yet</p>
      ) : (
        <div className="space-y-2">
          {points.map((p) => (
            <div key={p.period} className="grid grid-cols-[80px_1fr_80px] gap-3 items-center text-2xs">
              <span className="text-paper-muted truncate">{p.period}</span>
              <div className="h-3 bg-paper-edge">
                <div
                  className="h-full bg-paper-ink"
                  style={{ width: `${Math.max(4, (p.totalViews / maxViews) * 100)}%` }}
                />
              </div>
              <span className="tabular-nums text-right">{formatNumber(p.totalViews)}</span>
            </div>
          ))}
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
  const [data, setData] = useState<CreatorAnalyticsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API}/api/analytics/tiktok`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
        return res.json() as Promise<CreatorAnalyticsDashboard>;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load TikTok analytics');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
      {data.demoMode && (
        <p className="text-xs text-paper-muted border border-dashed border-paper-edge px-4 py-3">
          demo mode active — showing {data.summary.totalVideos} sample videos for @
          {data.account?.username ?? 'kelliekc'}. no tiktok oauth connected.
        </p>
      )}

      <div className="flex items-center gap-4 text-sm text-paper-muted">
        <span>
          account: @{data.account?.username ?? 'kelliekc'}
          {data.account?.displayName ? ` (${data.account.displayName})` : ''}
        </span>
        <span>·</span>
        <span>{data.summary.totalVideos} videos</span>
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
              ? new Date(data.summary.dataThrough).toLocaleDateString()
              : '—'
          }
        />
      </div>

      <Recommendations items={data.recommendations} />

      <VideoTable title="top videos by engagement" videos={data.topVideos} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <DimensionTable
          title="top categories"
          rows={data.topCategories}
          emptyLabel="// tag content_category on import to unlock"
        />
        <DimensionTable
          title="top locations"
          rows={data.topLocations}
          emptyLabel="// tag location_tag on import to unlock"
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
          emptyLabel="// tag sponsor_tag on import to unlock"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <TrendBars title="growth trend (views by period)" points={data.growthTrend} />
        <TrendBars title="engagement trend" points={data.engagementTrend} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <PatternSection title="repeatable winners" tone="win" patterns={data.repeatableWinners} />
        <PatternSection title="underperformers" tone="lose" patterns={data.underperformers} />
      </div>
    </div>
  );
}
