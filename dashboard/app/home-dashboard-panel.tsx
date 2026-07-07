'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { formatCurrency } from '../lib/sponsor-pipeline-types';
import type { PreAlphaHome } from '../lib/pre-alpha-types';
import { BensonPulseCard } from '../components/benson-pulse-card';
import { StudioPulseCard } from '../components/studio-pulse-card';
import { DoNowPanel } from '../components/do-now-panel';
import { PushNotificationsSection } from '../components/push-notifications-section';
import { formatDateTime } from '../lib/datetime';
import { SectionTitleRow } from '../components/section-help';
import { SECTION_HELP } from '../lib/section-help-text';

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

  if (loading && !data) {
    return <p className="text-paper-muted py-16 text-center text-sm">Loading your studio…</p>;
  }

  if (error && !data) {
    return (
      <div className="glass-panel border border-red-400/30 px-4 py-3 text-sm text-red-300">
        {error}
      </div>
    );
  }

  if (!data) return null;

  const greeting = data.greeting.replace(/^\/\/\s*/, '');

  return (
    <div className="space-y-8">
      <section>
        <h1 className="page-title gradient-text">{greeting}</h1>
        <p className="page-subtitle">{data.subline}</p>
        {!data.systemOk && (
          <p className="mt-3 text-sm text-amber-300">
            System check failed — verify API and database are running.
          </p>
        )}
      </section>

      {data.priorities.length > 0 && (
        <section className="glass-panel-strong gradient-border p-5 md:p-6 space-y-4">
          <SectionTitleRow
            title="Start here"
            help={SECTION_HELP.home.startHere}
            actions={
              <Link href="/editor" className="btn-primary text-xs py-2 min-h-[36px] px-4">
                Open Today
              </Link>
            }
          />
          <ol className="space-y-2 text-sm">
            {data.priorities.slice(0, 4).map((p) => (
              <li key={p.rank} className="flex gap-3 items-start">
                <span className="font-semibold text-paper-dim tabular-nums w-5">{p.rank}</span>
                {p.href ? (
                  <Link href={p.href} className="hover:text-accent leading-snug">
                    {p.label}
                  </Link>
                ) : (
                  <span className="leading-snug">{p.label}</span>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      {data.studioPulse ? <StudioPulseCard pulse={data.studioPulse} /> : null}

      <DoNowPanel />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat
          label="Active deals"
          value={String(data.metrics.activeDeals ?? data.metrics.activePipelineDeals)}
          sub={formatCurrency(data.stats.pipelineValue)}
          href="/pipeline"
        />
        <Stat
          label="Pending outreach"
          value={String(data.metrics.pendingOutreach ?? 0)}
          sub="drafts ready"
          href="/outreach/queue"
        />
        <Stat
          label="Content items"
          value={String(data.metrics.contentItems)}
          sub={`${data.refresh.newItemsSinceRefresh} new`}
          href="/review/inventory"
        />
        <Stat
          label="Open actions"
          value={String(data.stats.openActions)}
          sub={data.stats.overdueActions ? `${data.stats.overdueActions} overdue` : 'on track'}
          href="/actions"
        />
      </div>

      <BensonPulseCard />

      <PushNotificationsSection />

      <section className="glass-panel p-5">
        <SectionTitleRow
          title="Source health"
          subtitle={`${data.refresh.healthySources} healthy · ${data.refresh.failedSources} need attention${
            data.refresh.lastRefreshAt
              ? ` · last refresh ${formatDateTime(data.refresh.lastRefreshAt)}`
              : ''
          }`}
          help={SECTION_HELP.home.sourceHealth}
          actions={
            <Link href="/sources" className="btn-ghost text-xs py-2 min-h-[36px] px-3">
              Manage sources
            </Link>
          }
        />
      </section>

      <section className="space-y-3">
        <SectionTitleRow
          title="Quick links"
          help={SECTION_HELP.home.quickLinks}
          titleClassName="text-sm font-semibold text-paper-ink"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <HubLink
          title="Website"
          description="Upload media and publish to kckellie.com"
          href="/website"
          highlight
        />
        <HubLink
          title="TikTok"
          description="Views, top posts, and posting times"
          href="/analytics/tiktok"
        />
        <HubLink
          title="Notifications"
          description="Push alerts from Benson"
          href="/settings/notifications"
        />
        <HubLink
          title="Today"
          description="Scored picks and daily briefing"
          href="/editor"
        />
        <HubLink
          title="Content"
          description="Opportunities and inventory"
          href="/opportunities"
        />
        <HubLink
          title="Sponsors"
          description="CRM, pipeline, and intel"
          href="/sponsors"
        />
        </div>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  href,
}: {
  label: string;
  value: string;
  sub?: string;
  href?: string;
}) {
  const inner = (
    <>
      <div className="text-2xs uppercase tracking-wider text-paper-muted">{label}</div>
      <div className="text-xl md:text-2xl font-bold stat-mono mt-1 text-paper-ink">{value}</div>
      {sub ? <div className="text-2xs text-paper-dim mt-1">{sub}</div> : null}
    </>
  );

  if (href) {
    return (
      <Link href={href} className="glass-panel p-4 block transition hover:bg-white/[0.07]">
        {inner}
      </Link>
    );
  }

  return <div className="glass-panel p-4">{inner}</div>;
}

function HubLink({
  title,
  description,
  href,
  highlight,
}: {
  title: string;
  description: string;
  href: string;
  highlight?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`p-4 block transition hover:bg-white/[0.07] hover:shadow-glow ${
        highlight ? 'glass-panel-strong gradient-border' : 'glass-panel'
      }`}
    >
      <div className={`font-semibold ${highlight ? 'gradient-text' : 'text-paper-ink'}`}>{title}</div>
      <p className="text-xs text-paper-muted mt-1">{description}</p>
    </Link>
  );
}
