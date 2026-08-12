'use client';

import { clientApiOrigin } from '../../lib/client-api';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { humanizeCategoryLabel } from '../../lib/category-label';
import {
  formatCurrency,
  formatPercent,
  pipelineStatusLabel,
  RELATIONSHIP_STAGES,
  RELATIONSHIP_STAGE_LABEL,
  type PipelineDashboard,
  type PipelineRelationshipCard,
  type PipelineReporting,
  type SponsorPipelineStatus,
} from '../../lib/sponsor-pipeline-types';

function humanizeEnumLabel(value: string): string {
  return value
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());
}

const API = clientApiOrigin();

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
  const [relationships, setRelationships] = useState<PipelineRelationshipCard[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    return Promise.all([
      fetch(`${API}/api/pipeline`, { cache: 'no-store' }).then((r) => r.json()),
      fetch(`${API}/api/pipeline/reporting`, { cache: 'no-store' }).then((r) => r.json()),
      fetch(`${API}/api/pipeline/relationships`, { cache: 'no-store' }).then((r) => r.json()),
    ])
      .then(([dash, rep, rel]) => {
        setDashboard(dash as PipelineDashboard);
        setReporting(rep as PipelineReporting);
        setRelationships((rel as { relationships: PipelineRelationshipCard[] }).relationships ?? []);
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
        Every business relationship — from research to a paid deal. Cards with no deal value are
        still real relationships; a deal badge only appears once a formal opportunity exists.
      </p>

      <RelationshipBoard relationships={relationships ?? []} />

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
            humanizeCategoryLabel(r.category) ?? r.category,
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
          humanizeCategoryLabel(r.category) ?? r.category,
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

function RelationshipBoard({ relationships }: { relationships: PipelineRelationshipCard[] }) {
  if (relationships.length === 0) {
    return (
      <section className="space-y-2">
        <h2 className="text-lg font-bold lowercase">relationships</h2>
        <p className="text-sm text-paper-muted italic">
          // no business relationships yet — contact a business from a discovery to start one
        </p>
      </section>
    );
  }

  const byStage = new Map<string, PipelineRelationshipCard[]>();
  for (const stage of RELATIONSHIP_STAGES) byStage.set(stage, []);
  for (const rel of relationships) {
    const list = byStage.get(rel.stage) ?? [];
    list.push(rel);
    byStage.set(rel.stage, list);
  }

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-bold lowercase">relationships</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {RELATIONSHIP_STAGES.map((stage) => {
          const cards = byStage.get(stage) ?? [];
          return (
            <div key={stage} className="border-2 border-paper-edge flex flex-col min-h-[8rem]">
              <div className="px-3 py-2 border-b border-paper-edge flex items-center justify-between">
                <span className="text-2xs uppercase tracking-wider font-bold">
                  {RELATIONSHIP_STAGE_LABEL[stage]}
                </span>
                <span className="text-2xs text-paper-muted tabular-nums">{cards.length}</span>
              </div>
              <div className="flex-1 p-2 space-y-2">
                {cards.length === 0 ? (
                  <p className="text-2xs text-paper-muted italic px-1">—</p>
                ) : (
                  cards.map((rel) => <RelationshipCard key={rel.sponsorContactId} rel={rel} />)
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function RelationshipCard({ rel }: { rel: PipelineRelationshipCard }) {
  const dealValue = rel.actualValue ?? rel.estimatedValue;
  return (
    <Link
      href={`/sponsors/${rel.sponsorContactId}`}
      className="block border border-paper-edge p-2 hover:border-paper-ink space-y-1"
    >
      <div className="text-xs font-bold lowercase truncate">{rel.businessName.toLowerCase()}</div>
      {rel.category && (
        <div className="text-2xs text-paper-muted">{humanizeEnumLabel(rel.category)}</div>
      )}
      {rel.contactChannel && (
        <div className="text-2xs text-paper-muted truncate">via {rel.contactChannel}</div>
      )}
      <div className="text-2xs text-paper-muted">
        {rel.hasFormalDeal ? (
          <span className="border border-paper-edge px-1 py-0.5 mr-1">
            deal{dealValue != null ? ` · ${formatCurrency(dealValue)}` : ''}
          </span>
        ) : (
          <span className="text-paper-muted/70">relationship only · no deal yet</span>
        )}
      </div>
      {rel.lastActivity && (
        <div className="text-2xs text-paper-muted">
          last activity {new Date(rel.lastActivity).toLocaleDateString()}
        </div>
      )}
      {rel.nextFollowUpAt && (
        <div className="text-2xs text-paper-muted">
          follow-up {new Date(rel.nextFollowUpAt).toLocaleDateString()}
        </div>
      )}
    </Link>
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
