'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { clientApiUrl } from '../lib/client-api';
import { formatDateTime } from '../lib/datetime';
import { SectionTitleRow } from './section-help';
import { SECTION_HELP } from '../lib/section-help-text';
import { useBensonRevisionRefresh } from '../lib/benson-data-refresh';
import { DiscoverySkipButton } from './discovery-skip-button';

type ProgressBrief = {
  headline: string;
  progressSummary: string;
  whatChanged: string[];
  suggestedNextStep: string | null;
  createdAt: string;
  dataThrough: string | null;
};

type TopOpportunity = {
  id: string;
  title: string;
  category: string | null;
  location: string | null;
  eventDate: string | null;
  composite: number;
  rationale: string;
  sourceUrl: string | null;
};

type BensonLearning = {
  summary: string;
  insights: Array<{
    id: string;
    insight: string;
    confidence: string;
    lessonType?: string;
    evidenceSource?: string;
    evidenceDateRange?: string;
    action?: string;
    durability?: string;
  }>;
  createdAt: string;
  isStale?: boolean;
  noNewLessons?: boolean;
};

type BensonDiscovery = {
  createdAt: string;
  searchQueries: string[];
  summary: string;
  items: Array<{
    contentItemId: string;
    title: string;
    location: string | null;
    eventStartsAt: string | null;
    sourceUrl: string | null;
  }>;
  createdCount: number;
};

const BRIEF_STALE_MS = 72 * 60 * 60 * 1000;
const LEARNING_STALE_MS = 5 * 24 * 60 * 60 * 1000;

function isUpcomingEvent(iso: string | null | undefined): boolean {
  if (!iso) return true;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return true;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  return d.getTime() >= startOfToday.getTime() - 24 * 60 * 60 * 1000;
}

export function BensonPulseCard() {
  const [brief, setBrief] = useState<ProgressBrief | null>(null);
  const [learning, setLearning] = useState<BensonLearning | null>(null);
  const [discovery, setDiscovery] = useState<BensonDiscovery | null>(null);
  const [opportunities, setOpportunities] = useState<TopOpportunity[]>([]);
  const [tiktokStale, setTiktokStale] = useState<string | null>(null);
  const [tiktokSyncLabel, setTiktokSyncLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pulseBusy, setPulseBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [briefRes, learningRes, discoveryRes, oppRes, tiktokRes] = await Promise.all([
        fetch(clientApiUrl('/api/benson-pulse/latest'), { cache: 'no-store' }),
        fetch(clientApiUrl('/api/benson-learning/latest'), { cache: 'no-store' }),
        fetch(clientApiUrl('/api/benson-discovery/latest'), { cache: 'no-store' }),
        fetch(clientApiUrl('/api/benson-pulse/top-opportunities?limit=3'), { cache: 'no-store' }),
        fetch(clientApiUrl('/api/analytics/tiktok'), { cache: 'no-store' }),
      ]);
      if (briefRes.ok) {
        const data = (await briefRes.json()) as { brief: ProgressBrief | null };
        setBrief(data.brief);
      }
      if (learningRes.ok) {
        const data = (await learningRes.json()) as { learning: BensonLearning | null };
        setLearning(data.learning);
      }
      if (discoveryRes.ok) {
        const data = (await discoveryRes.json()) as { discovery: BensonDiscovery | null };
        setDiscovery(data.discovery);
      }
      if (oppRes.ok) {
        const data = (await oppRes.json()) as { opportunities: TopOpportunity[] };
        setOpportunities(data.opportunities ?? []);
      }
      if (tiktokRes.ok) {
        const data = (await tiktokRes.json()) as {
          status?: string;
          connection?: {
            status?: string;
            lastSuccessfulSyncAt?: string | null;
            expiresAt?: string | null;
          };
        };
        const connStatus = data.connection?.status ?? data.status ?? '';
        const lastSync = data.connection?.lastSuccessfulSyncAt;
        const hoursSince = lastSync
          ? (Date.now() - new Date(lastSync).getTime()) / 3_600_000
          : null;

        if (connStatus === 'expired' || connStatus === 'disconnected' || connStatus === 'error') {
          setTiktokStale(
            connStatus === 'expired'
              ? 'TikTok token expired — reconnect so auto-sync can pull live metrics.'
              : 'TikTok disconnected — reconnect for live metrics.',
          );
          setTiktokSyncLabel(null);
        } else if (hoursSince == null || hoursSince > 6) {
          setTiktokStale(
            lastSync
              ? `Last TikTok sync ${formatDateTime(lastSync)} — tap Check now or reconnect if this stays stale.`
              : 'TikTok not synced yet — tap Check now after connecting.',
          );
          setTiktokSyncLabel(null);
        } else {
          setTiktokStale(null);
          setTiktokSyncLabel(`TikTok synced ${formatDateTime(lastSync)} · auto every 4h`);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pulse');
    } finally {
      setLoading(false);
    }
  }, []);

  const { recalculatingMessage } = useBensonRevisionRefresh(
    ['analytics', 'recommendations', 'home_briefing', 'discoveries'],
    reload,
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  async function runPulseNow() {
    setPulseBusy(true);
    setError(null);
    try {
      const res = await fetch(clientApiUrl('/api/benson-pulse/run'), { method: 'POST' });
      if (!res.ok) throw new Error(`Pulse failed (${res.status})`);
      const data = (await res.json()) as {
        ok?: boolean;
        result?: { synced?: boolean; syncError?: string | null };
      };
      if (data.result?.syncError) {
        setError(`TikTok sync issue: ${data.result.syncError}`);
      }
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pulse failed');
    } finally {
      setPulseBusy(false);
    }
  }

  if (loading) {
    return (
      <section className="glass-panel p-5">
        <p className="text-sm text-paper-muted">Checking Benson&apos;s pulse…</p>
      </section>
    );
  }

  const briefAgeMs = brief ? Date.now() - new Date(brief.createdAt).getTime() : 0;
  const briefStale = briefAgeMs > BRIEF_STALE_MS;
  const learningStale =
    learning != null &&
    (learning.isStale === true ||
      Date.now() - new Date(learning.createdAt).getTime() > LEARNING_STALE_MS);
  const freshOpportunities = opportunities.filter((opp) => isUpcomingEvent(opp.eventDate));
  const freshDiscoveryItems =
    discovery?.items.filter((item) => isUpcomingEvent(item.eventStartsAt)) ?? [];

  return (
    <section className="glass-panel p-5 md:p-6 space-y-4 max-lg:pr-1">
      <SectionTitleRow
        title="Benson Pulse"
        subtitle={[
          'TikTok sync · progress brief · local scouting · auto every 4h',
          brief?.createdAt ? formatDateTime(brief.createdAt) : null,
        ]
          .filter(Boolean)
          .join(' · ')}
        help={SECTION_HELP.home.bensonPulse}
        titleClassName="text-base font-bold"
        actions={
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:w-auto">
            <Link
              href="/analytics/tiktok"
              className="btn-primary text-xs py-2 min-h-[36px] px-3 w-full sm:w-auto text-center"
            >
              TikTok dashboard
            </Link>
            <button
              type="button"
              disabled={pulseBusy}
              onClick={() => void runPulseNow()}
              className="btn-ghost disabled:opacity-50 text-xs py-2 min-h-[36px] px-3 w-full sm:w-auto"
            >
              {pulseBusy ? 'Checking…' : 'Check now'}
            </button>
          </div>
        }
      />

      {error && <p className="text-sm text-red-300">{error}</p>}

      {recalculatingMessage && (
        <p className="text-sm text-accent border border-accent/30 rounded-xl px-4 py-3">
          {recalculatingMessage}
        </p>
      )}

      {tiktokStale && !recalculatingMessage && (
        <p className="text-sm rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-amber-100">
          {tiktokStale}{' '}
          <a href="/analytics/tiktok/settings" className="link">
            TikTok settings
          </a>
        </p>
      )}

      {tiktokSyncLabel && !tiktokStale && (
        <p className="text-2xs text-paper-muted">{tiktokSyncLabel}</p>
      )}

      {brief ? (
        <>
          {briefStale ? (
            <p className="text-xs rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-amber-100">
              Progress brief from {formatDateTime(brief.createdAt)} — tap Check now for a fresh read.
            </p>
          ) : null}
          <p className="text-sm font-bold leading-snug">{brief.headline}</p>
          <p className="text-sm leading-relaxed">{brief.progressSummary}</p>
          {brief.whatChanged.length > 0 && (
            <ul className="text-xs space-y-1 list-disc list-inside text-paper-soft">
              {brief.whatChanged.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
          {brief.suggestedNextStep && !briefStale ? (
            <p className="text-sm text-accent border-l-2 border-accent/50 pl-3 leading-relaxed">
              {brief.suggestedNextStep}
            </p>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-paper-muted lowercase">
          no progress brief yet — the pulse worker generates one when fresh tiktok data shows a
          meaningful change.
        </p>
      )}

      {learning && (learning.noNewLessons || learning.insights.length > 0) && (
        <div className="pt-2 border-t border-dashed border-paper-edge">
          <p className="text-2xs uppercase tracking-wider text-paper-muted mb-2">
            what benson has learned
          </p>
          {learningStale && !recalculatingMessage ? (
            <p className="text-xs rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-amber-100 mb-2">
              Learnings from {formatDateTime(learning.createdAt)} — tap Check now so Benson refreshes
              what he suggests.
            </p>
          ) : null}
          <p className="text-sm leading-relaxed text-paper-soft mb-2">{learning.summary}</p>
          {learning.insights.length > 0 ? (
            <ul className="space-y-2 text-xs text-paper-muted">
              {learning.insights.slice(0, 4).map((item) => (
                <li key={item.id} className="border-l-2 border-accent/30 pl-2 space-y-0.5">
                  <p className="text-paper-soft">{item.insight}</p>
                  {item.action ? (
                    <p className="text-2xs text-accent/90">→ {item.action}</p>
                  ) : null}
                  <p className="text-2xs text-paper-dim">
                    {[
                      item.lessonType?.replace(/_/g, ' '),
                      item.confidence ? `${item.confidence} confidence` : null,
                      item.evidenceSource,
                      item.evidenceDateRange,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="text-2xs text-paper-dim mt-2">
            updated {formatDateTime(learning.createdAt)}
          </p>
        </div>
      )}

      {discovery && freshDiscoveryItems.length > 0 && (
        <div className="pt-2 border-t border-dashed border-paper-edge">
          <p className="text-2xs uppercase tracking-wider text-paper-muted mb-2">
            benson scouted the web
          </p>
          <p className="text-xs text-paper-soft mb-2">{discovery.summary.slice(0, 280)}</p>
          <ul className="space-y-2 text-xs">
            {freshDiscoveryItems.slice(0, 3).map((item) => (
              <li key={item.contentItemId} className="glass-panel p-3 space-y-2">
                <Link
                  href={`/review/inventory?id=${item.contentItemId}`}
                  className="font-bold hover:text-accent"
                >
                  {item.title}
                </Link>
                <p className="text-2xs text-paper-muted mt-1">
                  {[item.location, item.eventStartsAt ? formatDateTime(item.eventStartsAt) : null]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                <DiscoverySkipButton
                  contentItemId={item.contentItemId}
                  sourceScreen="home"
                  onSkipped={() => void reload()}
                />
              </li>
            ))}
          </ul>
          <p className="text-2xs text-paper-dim mt-2">
            {discovery.createdCount} new · scouted {formatDateTime(discovery.createdAt)}
          </p>
        </div>
      )}

      {freshOpportunities.length > 0 && (
        <div className="pt-2 border-t border-dashed border-paper-edge">
          <p className="text-2xs uppercase tracking-wider text-paper-muted mb-2">
            benson&apos;s top picks (scored, preference-filtered)
          </p>
          <ul className="space-y-2 text-xs">
            {freshOpportunities.map((opp) => (
              <li key={opp.id} className="glass-panel p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-bold">{opp.title}</span>
                  <span className="tabular-nums font-bold text-accent shrink-0">
                    {opp.composite}
                  </span>
                </div>
                <p className="text-2xs text-paper-muted mt-1">
                  {[opp.category, opp.location, opp.eventDate ? formatDateTime(opp.eventDate) : null]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                <p className="text-2xs text-paper-soft mt-1">{opp.rationale}</p>
                <DiscoverySkipButton
                  contentItemId={opp.id}
                  sourceScreen="home"
                  showSnooze
                  onSkipped={() => void reload()}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
