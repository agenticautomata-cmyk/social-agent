'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { formatCurrency } from '../lib/sponsor-pipeline-types';
import type { PreAlphaHome } from '../lib/pre-alpha-types';
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function HomeDashboardPanel() {
  const [data, setData] = useState<PreAlphaHome | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    return fetch(`${API}/api/pre-alpha/home`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
        return res.json() as Promise<PreAlphaHome>;
      })
      .then(setData)
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load home');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <div className="space-y-10">
      {loading && !data && (
        <p className="text-paper-muted italic py-12 text-center">// loading home…</p>
      )}
      {error && (
        <div className="border-2 border-accent px-4 py-3 text-sm text-accent">// {error}</div>
      )}

      {data && (
        <>
          <section>
            <div className="section-mark mb-3">
              <span>// benson home</span>
            </div>
            <h1 className="text-3xl md:text-5xl font-bold tracking-tightest lowercase">
              {data.greeting.toLowerCase()}
            </h1>
            <p className="text-paper-muted mt-2 italic text-sm">{data.subline}</p>
            {!data.systemOk && (
              <p className="text-2xs text-accent mt-2">
                // system check failed — ask Elliott to verify API and database
              </p>
            )}
          </section>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="open actions" value={String(data.stats.openActions)} />
            <Stat label="overdue" value={String(data.stats.overdueActions)} />
            <Stat label="pipeline" value={formatCurrency(data.stats.pipelineValue)} />
            <Stat
              label="outreach"
              value={data.stats.outreachMode}
              sub={`${data.stats.openDeals} open deals`}
            />
          </div>

          {data.priorities.length > 0 && (
            <section className="border-2 border-paper-ink bg-paper-tint px-4 md:px-5 py-4 space-y-3">
              <h2 className="text-sm font-bold uppercase tracking-wider">start here today</h2>
              <ol className="space-y-2 text-sm">
                {data.priorities.map((p) => (
                  <li key={p.rank} className="flex gap-3 items-start">
                    <span className="font-bold text-paper-muted tabular-nums">{p.rank}.</span>
                    {p.href ? (
                      <Link href={p.href} className="hover:text-accent lowercase min-h-[44px] flex items-center">
                        {p.label.toLowerCase()}
                      </Link>
                    ) : (
                      <span className="lowercase">{p.label.toLowerCase()}</span>
                    )}
                  </li>
                ))}
              </ol>
              <div className="flex flex-wrap gap-2 pt-2">
                <Link
                  href="/editor"
                  className="min-h-[44px] inline-flex items-center px-4 border-2 border-paper-ink text-sm font-bold"
                >
                  open today →
                </Link>
                <Link
                  href="/actions"
                  className="min-h-[44px] inline-flex items-center px-4 border border-paper-edge text-sm"
                >
                  action center →
                </Link>
              </div>
            </section>
          )}

          <section className="space-y-4">
            <h2 className="text-lg font-bold lowercase">quick links</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {data.quickLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="border-2 border-paper-edge p-4 hover:border-paper-ink transition-colors min-h-[44px] block"
                >
                  <div className="font-bold lowercase text-sm">{link.label.toLowerCase()}</div>
                  <p className="text-2xs text-paper-muted mt-1">{link.description}</p>
                </Link>
              ))}
            </div>
          </section>

        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="border border-paper-edge p-3">
      <div className="text-2xs uppercase text-paper-muted">{label}</div>
      <div className="text-lg md:text-xl font-bold tabular-nums mt-1">{value}</div>
      {sub ? <div className="text-2xs text-paper-muted">{sub}</div> : null}
    </div>
  );
}
