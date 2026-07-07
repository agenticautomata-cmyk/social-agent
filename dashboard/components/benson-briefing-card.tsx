'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  formatCost,
  formatNumber,
  formatPercentRate,
  type OperationalFreshness,
  type StrategistBriefingResponse,
} from '../lib/strategist-types';
import { formatDate, formatDateTime } from '../lib/datetime';
import { clientApiUrl } from '../lib/client-api';

type BensonBriefingCardProps = {
  compact?: boolean;
};

function staleLabel(reason: StrategistBriefingResponse['staleReason'], stale: boolean): string {
  if (!stale) return 'ready';
  if (reason === 'new_intake_since_analysis') return 'new intake — refresh recommended';
  if (reason === 'prompt_version') return 'updated model — refresh recommended';
  return 'stale — refresh recommended';
}

export function BensonBriefingCard({ compact = false }: BensonBriefingCardProps) {
  const [data, setData] = useState<StrategistBriefingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadBriefing = useCallback(() => {
    setLoading(true);
    setError(null);
    return fetch(clientApiUrl('/api/strategist/briefing'), { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
        return res.json() as Promise<StrategistBriefingResponse>;
      })
      .then(setData)
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load briefing');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void loadBriefing();
  }, [loadBriefing]);

  async function runAnalyze() {
    setRefreshBusy(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(clientApiUrl('/api/strategist/analyze'), { method: 'POST' });
      const json = (await res.json()) as StrategistBriefingResponse & { error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Analysis failed');
      setData(json);
      setMessage('Fresh strategist analysis generated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setRefreshBusy(false);
    }
  }

  if (loading && !data) {
    return (
      <section className="border-2 border-paper-edge p-4 bg-paper">
        <p className="text-sm text-paper-muted lowercase">loading today&apos;s benson briefing…</p>
      </section>
    );
  }

  const highlights = data?.highlights;
  const analysis = data?.analysis;
  const profile = data?.profile;
  const operational = data?.operationalFreshness;
  const statusLabel = data
    ? data.cached
      ? `cached · ${staleLabel(data.staleReason, data.stale)}`
      : staleLabel(data.staleReason, data.stale)
    : 'loading';

  return (
    <section className="border-2 border-paper-ink bg-paper-tint p-4 md:p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider">today&apos;s benson briefing</h2>
          <p className="text-2xs text-paper-muted mt-1 lowercase">
            ai strategist · {statusLabel}
            {data?.createdAt ? ` · ${formatDateTime(data.createdAt)}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={refreshBusy}
            onClick={() => void runAnalyze()}
            className="min-h-[44px] border-2 border-paper-ink px-4 py-2 text-sm font-bold disabled:opacity-50"
          >
            {refreshBusy ? 'analyzing…' : 'refresh analysis'}
          </button>
          <Link
            href="/strategist"
            className="min-h-[44px] border-2 border-paper-edge px-4 py-2 text-sm font-bold inline-flex items-center"
          >
            full strategist →
          </Link>
        </div>
      </div>

      {error && <p className="text-sm text-red-700 lowercase">// {error}</p>}
      {message && <p className="text-xs text-paper-soft">{message}</p>}

      {operational ? <WhatsNewSection operational={operational} /> : null}

      {!analysis && data?.needsAnalysis && (
        <div className="border border-dashed border-paper-edge p-4 text-sm text-paper-muted lowercase">
          Creator profile is ready from live analytics
          {profile ? ` (@${profile.creator})` : ''}. Run analysis to generate today&apos;s briefing.
        </div>
      )}

      {analysis && highlights && (
        <>
          <p className="text-sm leading-relaxed">{analysis.summary}</p>

          {analysis.bensonObservation && (
            <p className="text-sm italic text-paper-soft border-l-2 border-accent pl-3">
              {analysis.bensonObservation}
            </p>
          )}

          {!compact && profile && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <Metric label="30d views" value={formatNumber(profile.views30d)} />
              <Metric label="engagement rate" value={formatPercentRate(profile.engagementRate)} />
              <Metric
                label="posting pace"
                value={`${profile.postingFrequency.videosPerWeek}/wk`}
              />
              <Metric
                label="analysis cost"
                value={formatCost(data?.estimatedCost ?? null)}
                sub={
                  data?.tokenUsage
                    ? `${data.tokenUsage.totalTokens.toLocaleString()} tokens`
                    : undefined
                }
              />
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            <ListBlock title="what's working (analytics)" items={highlights.topOpportunities} />
            <ListBlock title="top 3 risks" items={highlights.topRisks} />
          </div>

          <div className="grid md:grid-cols-3 gap-4 text-xs">
            <Callout
              label="next content recommendation"
              value={highlights.nextContentRecommendation}
            />
            <Callout label="best sponsor prospect" value={highlights.bestSponsorProspect} />
            <Callout
              label="best time to post"
              value={
                highlights.recommendedPostTimes.length > 0
                  ? highlights.recommendedPostTimes.slice(0, 2).join(' · ')
                  : highlights.recommendedPostingDay
              }
            />
          </div>
        </>
      )}
    </section>
  );
}

function WhatsNewSection({ operational }: { operational: OperationalFreshness }) {
  const { askBensonToday, discoveredToday, newScrapeSources, tiktokConnection, lastSourceRefresh } =
    operational;
  const hasIntake = askBensonToday.length > 0 || discoveredToday.length > 0;
  const hasSources = newScrapeSources.length > 0;
  const hasRefresh = lastSourceRefresh.newItemsSinceRefresh > 0;

  if (!hasIntake && !hasSources && !tiktokConnection.connected && !hasRefresh) {
    return (
      <div className="border border-paper-edge px-4 py-3 text-xs text-paper-muted">
        // no new intake in the last 48 hours
      </div>
    );
  }

  return (
    <div className="border border-green-700/40 bg-green-50/30 px-4 py-3 space-y-3">
      <h3 className="text-2xs uppercase tracking-wider text-green-900 font-bold">what&apos;s new</h3>

      {tiktokConnection.connected ? (
        <p className="text-xs text-paper-soft">
          <span className="inline-block h-2 w-2 rounded-full bg-green-600 mr-2 align-middle" aria-hidden />
          tiktok {tiktokConnection.status}
          {tiktokConnection.platformUsername ? ` · @${tiktokConnection.platformUsername}` : ''}
          {tiktokConnection.lastSuccessfulSyncAt
            ? ` · last sync ${formatDateTime(tiktokConnection.lastSuccessfulSyncAt)}`
            : ''}
          {tiktokConnection.recentlyConnected && tiktokConnection.connectedAt
            ? ` · connected ${formatDateTime(tiktokConnection.connectedAt)}`
            : ''}
        </p>
      ) : null}

      {hasRefresh ? (
        <p className="text-xs text-paper-muted">
          {lastSourceRefresh.newItemsSinceRefresh} new item
          {lastSourceRefresh.newItemsSinceRefresh === 1 ? '' : 's'} since last source refresh
          {lastSourceRefresh.lastRefreshAt
            ? ` (${formatDateTime(lastSourceRefresh.lastRefreshAt)})`
            : ''}
        </p>
      ) : null}

      {askBensonToday.length > 0 ? (
        <div>
          <p className="text-2xs uppercase tracking-wider text-paper-muted mb-1">
            from ask benson ({askBensonToday.length})
          </p>
          <ul className="space-y-1 text-sm">
            {askBensonToday.slice(0, 5).map((item) => (
              <li key={item.id}>
                <Link href={`/review/inventory?id=${item.id}`} className="hover:text-accent lowercase">
                  {item.title.toLowerCase()}
                </Link>
                {item.eventDate ? (
                  <span className="text-2xs text-paper-muted ml-2">{formatDate(item.eventDate)}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {discoveredToday.length > 0 ? (
        <div>
          <p className="text-2xs uppercase tracking-wider text-paper-muted mb-1">
            discovered today ({discoveredToday.length})
          </p>
          <ul className="space-y-1 text-sm">
            {discoveredToday.slice(0, 3).map((item) => (
              <li key={item.id}>
                <Link href={`/review/inventory?id=${item.id}`} className="hover:text-accent lowercase">
                  {item.title.toLowerCase()}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {hasSources ? (
        <div>
          <p className="text-2xs uppercase tracking-wider text-paper-muted mb-1">
            new scrape sources ({newScrapeSources.length})
          </p>
          <ul className="space-y-1 text-xs text-paper-soft">
            {newScrapeSources.slice(0, 3).map((source) => (
              <li key={source.id}>
                {source.name.replace(/^\[Benson\]\s*/i, '').toLowerCase()}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="border border-paper-edge p-3 bg-paper">
      <div className="text-2xs uppercase tracking-wider text-paper-muted">{label}</div>
      <div className="font-bold tabular-nums mt-1">{value}</div>
      {sub && <div className="text-2xs text-paper-muted mt-1">{sub}</div>}
    </div>
  );
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="border border-paper-edge p-3 bg-paper">
      <h3 className="text-2xs uppercase tracking-wider text-paper-muted mb-2">{title}</h3>
      {items.length === 0 ? (
        <p className="text-xs text-paper-muted">—</p>
      ) : (
        <ol className="space-y-2 text-sm list-decimal list-inside">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Callout({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="border border-paper-edge p-3 bg-paper">
      <div className="text-2xs uppercase tracking-wider text-paper-muted">{label}</div>
      <p className="mt-1 text-sm">{value ?? '—'}</p>
    </div>
  );
}
