'use client';

import { clientApiOrigin } from '../../lib/client-api';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { formatCurrency } from '../../lib/sponsor-pipeline-types';
import type { RevenueDashboardResponse } from '../../lib/revenue-dashboard-types';

const API = clientApiOrigin();

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border-2 border-paper-edge p-4">
      <div className="text-2xs uppercase text-paper-muted tracking-wider">{label}</div>
      <div className="text-2xl font-bold tabular-nums mt-1">{value}</div>
      {sub ? <div className="text-2xs text-paper-muted mt-1">{sub}</div> : null}
    </div>
  );
}

function BarChart({
  items,
  valueKey,
  labelKey,
  formatValue,
}: {
  items: Array<Record<string, string | number>>;
  valueKey: string;
  labelKey: string;
  formatValue: (n: number) => string;
}) {
  const max = Math.max(...items.map((i) => Number(i[valueKey]) || 0), 1);

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <p className="text-xs text-paper-muted italic">// no data yet</p>
      ) : (
        items.map((item, idx) => {
          const value = Number(item[valueKey]) || 0;
          const pct = Math.round((value / max) * 100);
          return (
            <div key={idx} className="space-y-1">
              <div className="flex justify-between text-2xs gap-2">
                <span className="lowercase truncate">{String(item[labelKey])}</span>
                <span className="tabular-nums text-paper-muted shrink-0">
                  {formatValue(value)}
                </span>
              </div>
              <div className="h-2 bg-paper-edge">
                <div
                  className="h-2 bg-paper-ink"
                  style={{ width: `${Math.max(pct, value > 0 ? 4 : 0)}%` }}
                />
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function MonthlyTrendChart({
  points,
}: {
  points: RevenueDashboardResponse['charts']['monthlyRevenueTrend'];
}) {
  const max = Math.max(...points.map((p) => p.revenue), 1);

  return (
    <div className="flex items-end gap-2 h-40 border-b border-paper-edge pb-1">
      {points.length === 0 ? (
        <p className="text-xs text-paper-muted italic w-full text-center self-center">
          // no closed revenue yet
        </p>
      ) : (
        points.map((p) => {
          const h = Math.max(8, Math.round((p.revenue / max) * 100));
          return (
            <div key={p.month} className="flex-1 flex flex-col items-center gap-1 min-w-0">
              <div
                className="w-full bg-paper-ink"
                style={{ height: `${h}%` }}
                title={`${p.label}: ${formatCurrency(p.revenue)}`}
              />
              <span className="text-2xs text-paper-dim truncate w-full text-center">
                {p.label.split(' ')[0]}
              </span>
            </div>
          );
        })
      )}
    </div>
  );
}

export function RevenueDashboardPanel() {
  const [data, setData] = useState<RevenueDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    return fetch(`${API}/api/revenue`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
        return res.json() as Promise<RevenueDashboardResponse>;
      })
      .then(setData)
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load revenue dashboard');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <div className="space-y-10">
      <section>
        <div className="section-mark mb-3">
          <span>// revenue dashboard</span>
        </div>
        <h1 className="text-4xl font-bold tracking-tightest lowercase">
          creator business health
        </h1>
        <p className="text-paper-muted mt-2 italic text-sm">
          Pipeline, sponsors, and closed revenue — from existing CRM and deal data only.
        </p>
      </section>

      {data && (
        <nav className="flex flex-wrap gap-3 text-sm">
          {(
            [
              ['Sponsor CRM', data.links.sponsors],
              ['Pipeline', data.links.pipeline],
              ['Outreach', data.links.outreach],
              ['Planner', data.links.planner],
            ] as const
          ).map(([label, href]) => (
            <Link key={href} href={href} className="bracket hover:text-accent">
              {label.toLowerCase()} →
            </Link>
          ))}
        </nav>
      )}

      {data?.demoMode && (
        <div className="border border-dashed border-paper-edge px-4 py-2 text-xs text-paper-muted">
          demo mode — revenue metrics from pipeline and sponsor CRM tables
        </div>
      )}

      {error && (
        <div className="border-2 border-accent px-4 py-3 text-sm text-accent">
          // error: {error}
        </div>
      )}

      {loading && !data && (
        <div className="py-16 text-center text-paper-muted italic">
          // loading revenue dashboard…
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
            <Kpi label="pipeline value" value={formatCurrency(data.kpis.pipelineValue)} />
            <Kpi label="won this month" value={formatCurrency(data.kpis.wonThisMonth)} />
            <Kpi label="won this quarter" value={formatCurrency(data.kpis.wonThisQuarter)} />
            <Kpi label="avg deal size" value={formatCurrency(data.kpis.averageDealSize)} />
            <Kpi
              label="open opportunities"
              value={String(data.kpis.openOpportunities)}
              sub="active deals"
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label="sponsors contacted" value={String(data.kpis.sponsorsContacted)} />
            <Kpi label="sponsors replied" value={String(data.kpis.sponsorsReplied)} />
            <Kpi label="meetings scheduled" value={String(data.kpis.meetingsScheduled)} />
            <Kpi label="proposal sent" value={String(data.kpis.proposalSentCount)} sub="count" />
          </div>

          <section className="border-2 border-paper-ink bg-paper-tint p-5 space-y-4">
            <h2 className="text-lg font-bold lowercase">benson forecast</h2>
            <p className="text-2xs text-paper-muted italic">{data.forecast.methodology}</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="border border-paper-edge p-4">
                <div className="text-2xs uppercase text-paper-muted">conservative</div>
                <div className="text-3xl font-bold tabular-nums mt-1">
                  {formatCurrency(data.forecast.conservative)}
                </div>
              </div>
              <div className="border-2 border-paper-ink p-4">
                <div className="text-2xs uppercase text-paper-muted">expected</div>
                <div className="text-3xl font-bold tabular-nums mt-1 text-accent">
                  {formatCurrency(data.forecast.expected)}
                </div>
              </div>
              <div className="border border-paper-edge p-4">
                <div className="text-2xs uppercase text-paper-muted">optimistic</div>
                <div className="text-3xl font-bold tabular-nums mt-1">
                  {formatCurrency(data.forecast.optimistic)}
                </div>
              </div>
            </div>
            <p className="text-2xs text-paper-dim">
              open pipeline {formatCurrency(data.forecast.openPipelineValue)} · historical close{' '}
              {Math.round(data.forecast.conversionRateUsed * 100)}%
            </p>
          </section>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
            <section className="border-2 border-paper-edge p-4 space-y-4">
              <h3 className="text-sm font-bold lowercase">pipeline by stage</h3>
              <BarChart
                items={data.charts.pipelineByStage.map((s) => ({
                  label: s.label,
                  value: s.value,
                }))}
                labelKey="label"
                valueKey="value"
                formatValue={formatCurrency}
              />
            </section>

            <section className="border-2 border-paper-edge p-4 space-y-4">
              <h3 className="text-sm font-bold lowercase">revenue by sponsor category</h3>
              <BarChart
                items={data.charts.revenueByCategory.map((c) => ({
                  label: c.category,
                  value: c.revenue,
                }))}
                labelKey="label"
                valueKey="value"
                formatValue={formatCurrency}
              />
            </section>

            <section className="border-2 border-paper-edge p-4 space-y-4">
              <h3 className="text-sm font-bold lowercase">monthly revenue trend</h3>
              <MonthlyTrendChart points={data.charts.monthlyRevenueTrend} />
              {data.charts.monthlyRevenueTrend.length > 0 && (
                <ul className="text-2xs text-paper-muted space-y-0.5">
                  {data.charts.monthlyRevenueTrend.slice(-4).map((p) => (
                    <li key={p.month}>
                      {p.label}: {formatCurrency(p.revenue)} ({p.dealCount} deal
                      {p.dealCount === 1 ? '' : 's'})
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="border-2 border-paper-edge">
            <h3 className="text-sm font-bold lowercase px-4 py-3 border-b border-paper-edge">
              top 10 opportunities
            </h3>
            {data.topOpportunities.length === 0 ? (
              <p className="text-xs text-paper-muted italic p-4">// no open deals in pipeline</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-paper-muted border-b border-paper-edge">
                      {['sponsor', 'stage', 'est. value', 'expected close', ''].map((h) => (
                        <th key={h} className="px-4 py-2 font-normal">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.topOpportunities.map((row) => (
                      <tr key={row.id} className="border-b border-paper-edge/60">
                        <td className="px-4 py-2 font-bold lowercase">{row.sponsor.toLowerCase()}</td>
                        <td className="px-4 py-2 lowercase">{row.stageLabel.toLowerCase()}</td>
                        <td className="px-4 py-2 tabular-nums">
                          {row.estimatedValue != null
                            ? formatCurrency(row.estimatedValue)
                            : '—'}
                        </td>
                        <td className="px-4 py-2 tabular-nums">
                          {row.expectedCloseDate ?? '—'}
                        </td>
                        <td className="px-4 py-2">
                          <Link href={row.href} className="hover:text-accent">
                            open →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-bold lowercase">revenue at risk</h2>
            <p className="text-2xs text-paper-muted italic">
              Open opportunities with no updates in 14+ days.
            </p>
            {data.revenueAtRisk.length === 0 ? (
              <p className="text-sm text-paper-muted italic py-6 border border-dashed border-paper-edge text-center">
                // no stale deals — pipeline is current
              </p>
            ) : (
              <div className="space-y-3">
                {data.revenueAtRisk.map((item) => (
                  <article
                    key={item.id}
                    className="border-2 border-accent/40 p-4 flex flex-wrap justify-between gap-2"
                  >
                    <div>
                      <h4 className="font-bold lowercase">
                        {item.sponsor.toLowerCase()} — {item.title.toLowerCase()}
                      </h4>
                      <p className="text-2xs text-paper-muted mt-1">
                        {item.stageLabel.toLowerCase()}
                        {item.estimatedValue != null
                          ? ` · ${formatCurrency(item.estimatedValue)}`
                          : ''}
                        {' · '}
                        {item.daysSinceUpdate} days since update
                      </p>
                    </div>
                    <Link
                      href={data.links.pipeline}
                      className="text-2xs border border-paper-edge px-2 py-1 hover:border-paper-ink self-start"
                    >
                      update in pipeline →
                    </Link>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
