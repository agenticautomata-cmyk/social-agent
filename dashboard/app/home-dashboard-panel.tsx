'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { PreAlphaHome } from '../lib/pre-alpha-types';
import { AiSpendCard } from '../components/ai-spend-card';
import { PushNotificationsSection } from '../components/push-notifications-section';
import { clientApiUrl, parseApiJsonResponse } from '../lib/client-api';
import { formatDateTime } from '../lib/datetime';
import { SectionTitleRow } from '../components/section-help';
import { SECTION_HELP } from '../lib/section-help-text';
import { useBensonRevisionRefresh } from '../lib/benson-data-refresh';
import { HomeMorningBriefing } from '../components/home-morning-briefing';

export function HomeDashboardPanel() {
  const [data, setData] = useState<PreAlphaHome | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const attempt = async () => {
      const res = await fetch(clientApiUrl('/api/pre-alpha/home'), { cache: 'no-store' });
      const parsed = await parseApiJsonResponse<PreAlphaHome>(res);
      if (!parsed.ok) throw new Error(parsed.error);
      return parsed.data;
    };
    try {
      setData(await attempt());
    } catch (firstErr) {
      // Phone/PWA often races a cold API — one retry after a short pause.
      try {
        await new Promise((r) => setTimeout(r, 1500));
        setData(await attempt());
      } catch {
        setError(firstErr instanceof Error ? firstErr.message : 'Failed to load home');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const { recalculatingMessage, lastRevisionAt } = useBensonRevisionRefresh(
    ['analytics', 'home_briefing', 'recommendations', 'opportunities', 'discoveries', 'email', 'worker_health'],
    reload,
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  if (loading && !data) {
    return (
      <p className="text-paper-muted py-16 text-center text-sm">
        Loading your studio…
        <span className="mt-2 block text-2xs opacity-80">First load can take up to a minute on mobile.</span>
      </p>
    );
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
    <div className="space-y-5">
      <section className="space-y-1">
        <h1 className="page-title gradient-text leading-tight">{greeting}</h1>
        <p className="text-2xs text-paper-muted">
          Updated {formatDateTime(data.generatedAt)}
          {lastRevisionAt ? ` · refreshed ${formatDateTime(lastRevisionAt)}` : ''}
        </p>
        {recalculatingMessage && (
          <p className="mt-2 text-sm text-accent border border-accent/30 rounded-xl px-3 py-2">
            {recalculatingMessage}
          </p>
        )}
        {!data.systemOk && (
          <p className="mt-2 text-sm text-amber-300">
            Having trouble reaching the latest data. Try refreshing the page in a moment.
          </p>
        )}
      </section>

      <HomeMorningBriefing data={data} />

      {data.aiSpend ? <AiSpendCard spend={data.aiSpend} /> : null}

      <PushNotificationsSection />

      <section className="space-y-3">
        <SectionTitleRow
          title="Workbenches"
          help={SECTION_HELP.home.quickLinks}
          titleClassName="text-sm font-semibold text-paper-ink"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <HubLink title="Today" description="Full task list and daily workbench" href="/editor" highlight />
          <HubLink title="Discover" description="Explore and vote on discoveries" href="/discoveries" />
          <HubLink title="Pitches" description="Outreach drafts awaiting approval" href="/email/approvals" />
          <HubLink title="Shoot mode" description="On-location filming workflow" href="/shoot" />
        </div>
      </section>
    </div>
  );
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
