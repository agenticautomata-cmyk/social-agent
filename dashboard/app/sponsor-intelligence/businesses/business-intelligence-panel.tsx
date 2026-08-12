'use client';

import { clientApiOrigin } from '../../../lib/client-api';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  formatDate,
  formatLabel,
  formatNumber,
  type VideoBusinessAggregate,
  type VideoBusinessIntelligenceResponse,
  type RecentBusinessMention,
} from '../../../lib/video-business-intelligence-types';

const API = clientApiOrigin();

function BusinessTypeBadge({ type }: { type: 'local' | 'chain' }) {
  return (
    <span
      className={`text-2xs uppercase tracking-wider px-1.5 py-0.5 border ${
        type === 'local'
          ? 'border-emerald-700/40 text-emerald-800'
          : 'border-paper-edge text-paper-muted'
      }`}
    >
      {type}
    </span>
  );
}

function BusinessLink({ slug, name }: { slug: string; name: string }) {
  return (
    <Link href={`/sponsor-intelligence/businesses/${slug}`} className="link font-medium lowercase">
      {name.toLowerCase()}
    </Link>
  );
}

function AggregateTable({
  rows,
  showScore = false,
}: {
  rows: VideoBusinessAggregate[];
  showScore?: boolean;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-paper-muted lowercase">no businesses yet.</p>;
  }

  return (
    <div className="overflow-x-auto border-2 border-paper-edge">
      <table className="w-full text-xs lowercase">
        <thead className="bg-paper-warm text-2xs uppercase tracking-wider text-paper-muted">
          <tr>
            <th className="text-left px-3 py-2">business</th>
            <th className="text-left px-3 py-2">type</th>
            {showScore && <th className="text-right px-3 py-2">score</th>}
            <th className="text-right px-3 py-2">videos</th>
            <th className="text-right px-3 py-2">views</th>
            <th className="text-right px-3 py-2">engagement</th>
            <th className="text-right px-3 py-2">avg views</th>
            <th className="text-left px-3 py-2">location</th>
            <th className="text-left px-3 py-2">category</th>
            <th className="text-left px-3 py-2">first</th>
            <th className="text-left px-3 py-2">last</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.slug} className="border-t border-paper-edge hover:bg-paper-warm/50">
              <td className="px-3 py-2">
                <BusinessLink slug={row.slug} name={row.businessName} />
              </td>
              <td className="px-3 py-2">
                <BusinessTypeBadge type={row.businessType} />
              </td>
              {showScore && (
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-emerald-800">
                  {row.sponsorScore.toFixed(1)}
                </td>
              )}
              <td className="px-3 py-2 text-right tabular-nums">{row.videoCount}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.totalViews)}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatNumber(row.totalEngagement)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatNumber(row.avgViewsPerMention)}
              </td>
              <td className="px-3 py-2">{formatLabel(row.primaryLocation)}</td>
              <td className="px-3 py-2">{formatLabel(row.primaryCategory)}</td>
              <td className="px-3 py-2 whitespace-nowrap">{formatDate(row.firstMentionDate)}</td>
              <td className="px-3 py-2 whitespace-nowrap">{formatDate(row.lastMentionDate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RecentMentionsTable({ rows }: { rows: RecentBusinessMention[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-paper-muted lowercase">no recent mentions.</p>;
  }

  return (
    <div className="overflow-x-auto border-2 border-paper-edge">
      <table className="w-full text-xs lowercase">
        <thead className="bg-paper-warm text-2xs uppercase tracking-wider text-paper-muted">
          <tr>
            <th className="text-left px-3 py-2">business</th>
            <th className="text-left px-3 py-2">video</th>
            <th className="text-left px-3 py-2">posted</th>
            <th className="text-right px-3 py-2">views</th>
            <th className="text-right px-3 py-2">engagement</th>
            <th className="text-left px-3 py-2">category</th>
            <th className="text-left px-3 py-2">location</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={`${row.videoId}-${row.businessName}`}
              className="border-t border-paper-edge hover:bg-paper-warm/50"
            >
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <BusinessLink slug={row.slug} name={row.businessName} />
                  <BusinessTypeBadge type={row.businessType} />
                </div>
              </td>
              <td className="px-3 py-2 max-w-xs truncate">
                {(row.title || row.caption || row.platformVideoId).slice(0, 80)}
              </td>
              <td className="px-3 py-2 whitespace-nowrap">{formatDate(row.publishedAt)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.views)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.engagement)}</td>
              <td className="px-3 py-2">{formatLabel(row.contentCategory)}</td>
              <td className="px-3 py-2">{formatLabel(row.locationTag)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SummaryCards({ data }: { data: VideoBusinessIntelligenceResponse }) {
  const cards = [
    { label: 'businesses tracked', value: data.summary.totalBusinesses },
    { label: 'local businesses', value: data.summary.localBusinesses },
    { label: 'video mentions', value: data.summary.totalMentions },
    { label: 'total views', value: formatNumber(data.summary.totalViews) },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map((card) => (
        <div key={card.label} className="border-2 border-paper-edge p-4 bg-paper">
          <div className="text-2xs uppercase tracking-wider text-paper-muted">{card.label}</div>
          <div className="text-xl font-bold tabular-nums mt-1">{card.value}</div>
        </div>
      ))}
    </div>
  );
}

export function BusinessIntelligencePanel() {
  const [data, setData] = useState<VideoBusinessIntelligenceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    return fetch(`${API}/api/sponsor-intelligence/video-businesses?limit=20`, {
      cache: 'no-store',
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
        return res.json() as Promise<VideoBusinessIntelligenceResponse>;
      })
      .then(setData)
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load business intelligence');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (loading) {
    return <p className="text-sm text-paper-muted lowercase">loading business intelligence…</p>;
  }

  if (error || !data) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-700 lowercase">{error ?? 'Failed to load'}</p>
        <button type="button" onClick={() => void reload()} className="btn-secondary text-xs">
          retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <SummaryCards data={data} />

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-bold lowercase">top local sponsor candidates</h2>
          <p className="text-xs text-paper-muted mt-1">
            Score = 40% mention frequency · 25% total views · 20% engagement · 15% local bonus.
            Excludes Walmart, Target, Whole Foods, Trader Joe&apos;s, Costco, Sam&apos;s Club, TJ
            Maxx, and Ross.
          </p>
        </div>
        <AggregateTable rows={data.topLocalSponsorCandidates} showScore />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold lowercase">most mentioned businesses</h2>
        <AggregateTable rows={data.mostMentionedBusinesses} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold lowercase">highest performing businesses</h2>
        <AggregateTable rows={data.highestPerformingBusinesses} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold lowercase">recent business mentions</h2>
        <RecentMentionsTable rows={data.recentBusinessMentions} />
      </section>
    </div>
  );
}
