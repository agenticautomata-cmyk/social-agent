'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { clientApiUrl } from '../../../lib/client-api';

type OutcomeSummary = {
  acceptanceRate: number | null;
  plannedToFilmedRate: number | null;
  filmedToPostedRate: number | null;
  postedToSponsorRate: number | null;
  recommendationToRevenueRate: number | null;
  totalRecommendations: number;
  completedRecommendations: number;
  ignoredCategories: Array<{ category: string; count: number }>;
  topViewCategories: Array<{ category: string; avgViews: number; count: number }>;
  recentOutcomes: Array<{
    id: string;
    title: string;
    classification: string | null;
    score: number | null;
    linkConfidence: number;
    views: number | null;
  }>;
  spendMetrics?: {
    periodDays: number;
    totalSpendUsd: number;
    dailyAverageUsd: number;
    costPerPostedVideo: number | null;
    costPerSponsorReply: number | null;
  } | null;
};

export function OutcomesAnalyticsPanel() {
  const [data, setData] = useState<OutcomeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    return fetch(clientApiUrl('/api/outcomes/summary?days=90'), { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json() as Promise<OutcomeSummary>;
      })
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (loading) return <p className="text-sm text-paper-muted italic">Loading outcome analytics…</p>;
  if (error) return <p className="text-sm text-red-300">{error}</p>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Card label="Acceptance" value={pct(data.acceptanceRate)} />
        <Card label="Plan → Film" value={pct(data.plannedToFilmedRate)} />
        <Card label="Film → Post" value={pct(data.filmedToPostedRate)} />
        <Card label="Post → Sponsor" value={pct(data.postedToSponsorRate)} />
        <Card label="→ Revenue" value={pct(data.recommendationToRevenueRate)} />
      </div>

      {data.spendMetrics ? (
        <section className="glass-panel p-4">
          <h2 className="text-sm font-semibold mb-3">
            AI spend vs outcomes ({data.spendMetrics.periodDays}d)
          </h2>
          <div className="grid sm:grid-cols-4 gap-3 text-sm">
            <Card label="Total spend" value={`$${data.spendMetrics.totalSpendUsd.toFixed(2)}`} />
            <Card label="Daily avg" value={`$${data.spendMetrics.dailyAverageUsd.toFixed(2)}`} />
            <Card
              label="Cost / posted video"
              value={
                data.spendMetrics.costPerPostedVideo != null
                  ? `$${data.spendMetrics.costPerPostedVideo.toFixed(2)}`
                  : '—'
              }
            />
            <Card
              label="Cost / sponsor reply"
              value={
                data.spendMetrics.costPerSponsorReply != null
                  ? `$${data.spendMetrics.costPerSponsorReply.toFixed(2)}`
                  : '—'
              }
            />
          </div>
        </section>
      ) : null}

      <div className="grid lg:grid-cols-2 gap-4">
        <section className="glass-panel p-4">
          <h2 className="text-sm font-semibold mb-3">Most ignored categories</h2>
          <ul className="space-y-2 text-sm">
            {data.ignoredCategories.length === 0 ? (
              <li className="text-paper-muted">No skip data yet</li>
            ) : (
              data.ignoredCategories.map((row) => (
                <li key={row.category} className="flex justify-between gap-3">
                  <span>{row.category}</span>
                  <span className="text-paper-dim tabular-nums">{row.count}</span>
                </li>
              ))
            )}
          </ul>
        </section>
        <section className="glass-panel p-4">
          <h2 className="text-sm font-semibold mb-3">Top view categories</h2>
          <ul className="space-y-2 text-sm">
            {data.topViewCategories.map((row) => (
              <li key={row.category} className="flex justify-between gap-3">
                <span>{row.category}</span>
                <span className="text-paper-dim tabular-nums">{row.avgViews.toLocaleString()} avg</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="glass-panel p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-sm font-semibold">Recent outcomes</h2>
          <Link href="/shoot" className="btn-ghost text-xs py-2 px-3 min-h-[36px]">
            Shoot mode
          </Link>
        </div>
        <ul className="space-y-2 text-sm">
          {data.recentOutcomes.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-2">
              <span>{row.title}</span>
              <span className="text-2xs text-paper-dim">
                {row.classification ?? 'pending'}
                {row.views != null ? ` · ${row.views.toLocaleString()} views` : ''}
                {row.linkConfidence < 0.9 ? ` · ${Math.round(row.linkConfidence * 100)}% link confidence` : ''}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-panel p-4">
      <div className="text-2xs uppercase tracking-wider text-paper-muted">{label}</div>
      <div className="text-2xl font-bold stat-mono mt-1">{value}</div>
    </div>
  );
}

function pct(value: number | null): string {
  return value != null ? `${value}%` : '—';
}
