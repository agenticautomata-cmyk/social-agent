'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  formatCurrency,
  formatPercent,
  pipelineStatusLabel,
  type PipelineDashboard,
  type PipelineReporting,
  type SponsorPipelineStatus,
} from '../../lib/sponsor-pipeline-types';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const OPEN_STATUSES: SponsorPipelineStatus[] = [
  'lead',
  'contacted',
  'interested',
  'meeting_scheduled',
  'proposal_sent',
  'negotiating',
];

export function PipelinePanel() {
  const [dashboard, setDashboard] = useState<PipelineDashboard | null>(null);
  const [reporting, setReporting] = useState<PipelineReporting | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    return Promise.all([
      fetch(`${API}/api/pipeline`, { cache: 'no-store' }).then((r) => r.json()),
      fetch(`${API}/api/pipeline/reporting`, { cache: 'no-store' }).then((r) => r.json()),
    ])
      .then(([dash, rep]) => {
        setDashboard(dash as PipelineDashboard);
        setReporting(rep as PipelineReporting);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (loading && !dashboard) {
    return <p className="text-sm text-paper-muted italic py-12">// loading pipeline…</p>;
  }

  if (error) {
    return <div className="border-2 border-accent px-4 py-3 text-sm text-accent">// {error}</div>;
  }

  if (!dashboard || !reporting) return null;

  return (
    <div className="space-y-10">
      <p className="text-2xs text-paper-muted italic max-w-3xl">
        Reporting only — pipeline values do not affect outreach send logic or approval gates.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Kpi label="pipeline value" value={formatCurrency(dashboard.totalPipelineValue)} />
        <Kpi
          label="won this month"
          value={formatCurrency(dashboard.wonThisMonth.value)}
          sub={`${dashboard.wonThisMonth.count} deals`}
        />
        <Kpi label="lost this month" value={String(dashboard.lostThisMonth.count)} sub="deals" />
        <Kpi label="conversion rate" value={formatPercent(dashboard.conversionRate)} />
        <Kpi label="avg deal size" value={formatCurrency(dashboard.averageDealSize)} />
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-bold lowercase">pipeline by status</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
          {dashboard.byStatus.map((col) => (
            <div key={col.status} className="border-2 border-paper-edge p-3">
              <div className="text-2xs uppercase text-paper-muted">
                {pipelineStatusLabel(col.status)}
              </div>
              <div className="text-xl font-bold tabular-nums">{col.count}</div>
              <div className="text-2xs text-paper-muted">{formatCurrency(col.value)}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <ReportTable
          title="lead source"
          headers={['source', 'deals', 'won', 'lost', 'close %']}
          rows={reporting.byLeadSource.map((r) => [
            r.source,
            String(r.count),
            String(r.won),
            String(r.lost),
            formatPercent(r.closeRate),
          ])}
        />
        <ReportTable
          title="close rate by category"
          headers={['category', 'open', 'won', 'close %']}
          rows={reporting.byCategory.map((r) => [
            r.category,
            formatCurrency(r.openValue),
            formatCurrency(r.wonValue),
            formatPercent(r.closeRate),
          ])}
        />
      </section>

      <ReportTable
        title="revenue by category"
        headers={['category', 'revenue', 'deals']}
        rows={reporting.revenueByCategory.map((r) => [
          r.category,
          formatCurrency(r.revenue),
          String(r.dealCount),
        ])}
      />

      <section className="space-y-4">
        <h2 className="text-lg font-bold lowercase">open deals</h2>
        <div className="space-y-3">
          {dashboard.opportunities
            .filter((o) => OPEN_STATUSES.includes(o.status as SponsorPipelineStatus))
            .map((opp) => (
              <article key={opp.id} className="border border-paper-edge p-4 flex flex-wrap justify-between gap-2">
                <div>
                  <h3 className="font-bold lowercase">{opp.title.toLowerCase()}</h3>
                  <div className="text-2xs text-paper-muted mt-1">
                    {opp.sponsorBusinessName} · {pipelineStatusLabel(opp.status)}
                    {opp.sponsorCategory ? ` · ${opp.sponsorCategory.replace(/_/g, ' ')}` : ''}
                    {opp.estimatedValue != null ? ` · ${formatCurrency(opp.estimatedValue)}` : ''}
                    {opp.plannerListName ? ` · plan: ${opp.plannerListName}` : ''}
                  </div>
                </div>
                <Link
                  href={`/sponsors/${opp.sponsorContactId}`}
                  className="text-2xs border border-paper-edge px-2 py-1 hover:border-paper-ink"
                >
                  sponsor →
                </Link>
              </article>
            ))}
          {dashboard.openDealCount === 0 && (
            <p className="text-sm text-paper-muted italic">// no open deals — create from sponsor CRM</p>
          )}
        </div>
      </section>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border-2 border-paper-edge p-4">
      <div className="text-2xs uppercase text-paper-muted">{label}</div>
      <div className="text-2xl font-bold tabular-nums mt-1">{value}</div>
      {sub ? <div className="text-2xs text-paper-muted mt-1">{sub}</div> : null}
    </div>
  );
}

function ReportTable({
  title,
  headers,
  rows,
}: {
  title: string;
  headers: string[];
  rows: string[][];
}) {
  return (
    <section className="border-2 border-paper-edge">
      <h3 className="text-sm font-bold lowercase px-4 py-3 border-b border-paper-edge">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-paper-muted italic p-4">// no data yet</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-paper-muted border-b border-paper-edge">
                {headers.map((h) => (
                  <th key={h} className="px-4 py-2 font-normal">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-paper-edge/60">
                  {row.map((cell, j) => (
                    <td key={j} className="px-4 py-2 lowercase">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
