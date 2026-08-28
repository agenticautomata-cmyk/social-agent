'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { clientApiUrl } from '../lib/client-api';
import { formatDateTime } from '../lib/datetime';
import { SectionTitleRow } from './section-help';
import { SECTION_HELP } from '../lib/section-help-text';
import { notifyLocalChange, skipDiscoveryItem, useBensonRevisionRefresh } from '../lib/benson-data-refresh';
import { DiscoverySkipButton } from './discovery-skip-button';
import { useActionToast } from './action-toast';

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
  primaryAction?: {
    key: 'add_to_today' | 'review' | 'open_program' | 'open_plan';
    label: string;
  };
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
  refreshStatus?: 'fresh' | 'verified_stale' | 'refresh_failed' | 'unavailable';
  lastVerifiedAt?: string | null;
  refreshFailedAt?: string | null;
  refreshMessage?: string | null;
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

const LEARNING_STALE_MS = 5 * 24 * 60 * 60 * 1000;
const DISCOVERY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function discoverySummaryLooksLikeLinks(summary: string): boolean {
  return /\]\(http/i.test(summary) || /bandsintown/i.test(summary);
}

function isUpcomingEvent(iso: string | null | undefined): boolean {
  if (!iso) return true;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return true;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  return d.getTime() >= startOfToday.getTime() - 24 * 60 * 60 * 1000;
}

function isUsableSourceUrl(url: string | null | undefined): boolean {
  const raw = (url ?? '').trim();
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
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
  const [busyId, setBusyId] = useState<string | null>(null);
  const { showToast } = useActionToast();

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

  async function runTopPickPrimary(opp: TopOpportunity) {
    const action = opp.primaryAction ?? { key: 'review' as const, label: 'Review details' };
    if (action.key === 'review' || action.key === 'open_program' || action.key === 'open_plan') {
      window.location.href = `/discoveries/${opp.id}`;
      return;
    }
    setBusyId(opp.id);
    setError(null);
    try {
      const res = await fetch(clientApiUrl(`/api/creator-interest/records/${opp.id}/add-to-today`), {
        method: 'POST',
      });
      if (!res.ok) throw new Error(`Could not add to Today (${res.status})`);
      setOpportunities((prev) => prev.filter((item) => item.id !== opp.id));
      notifyLocalChange(['opportunities', 'discoveries', 'recommendations', 'home_briefing']);
      showToast({ title: action.label, nextStep: 'It’s on Today when you want it.' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not add to Today';
      setError(message);
      showToast({ title: 'Could not add to Today', nextStep: message, tone: 'error' });
    } finally {
      setBusyId(null);
    }
  }

  async function laterTopPick(id: string) {
    setBusyId(id);
    setError(null);
    setOpportunities((prev) => prev.filter((item) => item.id !== id));
    try {
      await skipDiscoveryItem({ contentItemId: id, sourceScreen: 'home', snoozePreset: 'later_today' });
      notifyLocalChange(['opportunities', 'discoveries', 'recommendations', 'home_briefing']);
      showToast({ title: 'Later', nextStep: 'Hidden until later today, then it comes back.' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not snooze';
      setError(message);
      showToast({ title: 'Could not snooze', nextStep: message, tone: 'error' });
      await reload().catch(() => undefined);
    } finally {
      setBusyId(null);
    }
  }

  async function notInterestedTopPick(id: string) {
    setBusyId(id);
    setError(null);
    setOpportunities((prev) => prev.filter((item) => item.id !== id));
    try {
      const res = await fetch(clientApiUrl(`/api/creator-interest/records/${id}/interest`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'not_interested', sourceScreen: 'home' }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; nextStep?: string };
      if (!res.ok) throw new Error(body.error ?? `Vote failed (${res.status})`);
      notifyLocalChange(['opportunities', 'discoveries', 'recommendations', 'home_briefing']);
      showToast({ title: 'Not interested', nextStep: body.nextStep ?? null });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not dismiss';
      setError(message);
      showToast({ title: "That didn't save", nextStep: message, tone: 'error' });
      await reload().catch(() => undefined);
    } finally {
      setBusyId(null);
    }
  }

  async function runPulseNow() {
    setPulseBusy(true);
    setError(null);
    try {
      const res = await fetch(clientApiUrl('/api/benson-pulse/run'), { method: 'POST' });
      if (!res.ok) throw new Error(`Pulse failed (${res.status})`);
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        result?: { synced?: boolean; syncError?: string | null };
        learning?: { refreshFailed?: boolean; reason?: string };
      };
      if (!data.ok && data.error) {
        setError(data.error);
      } else if (data.learning?.refreshFailed) {
        setError('Benson Learning could not refresh.');
      } else if (data.result?.syncError) {
        setError('TikTok sync issue — try Check now again or reconnect in TikTok settings.');
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
      <section className="glass-panel p-3">
        <p className="text-sm text-paper-muted">Checking Benson&apos;s pulse…</p>
      </section>
    );
  }

  const learningUnavailable = learning?.refreshStatus === 'unavailable';
  const learningRefreshFailed = learning?.refreshStatus === 'refresh_failed';
  const learningSummary = learning?.summary?.trim() ?? '';
  const showLearningContent =
    learning &&
    !learningUnavailable &&
    !learning.noNewLessons &&
    (learningSummary.length > 0 || learning.insights.length > 0);
  const freshOpportunities = opportunities
    .filter((opp) => isUpcomingEvent(opp.eventDate) && isUsableSourceUrl(opp.sourceUrl))
    .slice(0, 3);
  const freshDiscoveryItems =
    discovery?.items.filter((item) => isUpcomingEvent(item.eventStartsAt)) ?? [];
  const discoveryAgeMs = discovery ? Date.now() - new Date(discovery.createdAt).getTime() : 0;
  const discoverySummary = discovery?.summary?.trim() ?? '';
  const showDiscovery =
    Boolean(discovery) &&
    freshDiscoveryItems.length > 0 &&
    discoverySummary.length > 0 &&
    discoveryAgeMs <= DISCOVERY_MAX_AGE_MS;
  const showDiscoverySummary =
    showDiscovery && discoverySummary.length > 0 && !discoverySummaryLooksLikeLinks(discoverySummary);

  // Home owns progress brief in Today's Brief — Pulse only surfaces learning/scout/picks/alerts.
  const hasPulseBody =
    Boolean(error) ||
    Boolean(recalculatingMessage) ||
    Boolean(tiktokStale) ||
    showLearningContent ||
    showDiscovery ||
    freshOpportunities.length > 0;

  // Hide empty Pulse shell — do not render header-only when learning/scout/picks are absent.
  if (!hasPulseBody) {
    return null;
  }

  return (
    <section className="glass-panel p-3 md:p-4 space-y-3 max-lg:pr-1">
      <SectionTitleRow
        title="Benson Pulse"
        subtitle={[
          'TikTok sync · brief · scouting · auto 4h',
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
        <p className="text-sm text-accent border border-accent/30 rounded-xl px-3 py-2">
          {recalculatingMessage}
        </p>
      )}

      {tiktokStale && !recalculatingMessage && (
        <p className="text-sm rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-amber-100">
          {tiktokStale}{' '}
          <a href="/analytics/tiktok/settings" className="link">
            TikTok settings
          </a>
        </p>
      )}

      {tiktokSyncLabel && !tiktokStale && (
        <p className="text-2xs text-paper-muted">{tiktokSyncLabel}</p>
      )}

      {showLearningContent && (
        <div className="pt-2 border-t border-dashed border-paper-edge">
          <p className="text-2xs uppercase tracking-wider text-paper-muted mb-2">
            what benson has learned
          </p>
          {learningRefreshFailed && learning?.lastVerifiedAt ? (
            <p className="text-xs rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-amber-100 mb-2">
              Last verified {formatDateTime(learning.lastVerifiedAt)} — latest refresh failed.
            </p>
          ) : learning?.isStale === true ||
            (learning?.lastVerifiedAt &&
              Date.now() - new Date(learning.lastVerifiedAt).getTime() > LEARNING_STALE_MS) ? (
            <p className="text-xs rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-amber-100 mb-2">
              Learnings from {formatDateTime(learning.lastVerifiedAt ?? learning.createdAt)} — tap
              Check now so Benson refreshes what he suggests.
            </p>
          ) : null}
          {learningSummary ? (
            <p className="text-sm leading-relaxed text-paper-soft mb-2">{learningSummary}</p>
          ) : null}
          {learning!.insights.length > 0 ? (
            <ul className="space-y-2 text-xs text-paper-muted">
              {learning!.insights.slice(0, 3).map((item) => (
                <li key={item.id} className="border-l-2 border-accent/30 pl-2 space-y-0.5">
                  <p className="text-paper-soft">{item.insight}</p>
                  {item.action ? (
                    <p className="text-2xs text-accent/90">→ {item.action}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}

      {showDiscovery && discovery && (
        <div className="pt-2 border-t border-dashed border-paper-edge">
          <p className="text-2xs uppercase tracking-wider text-paper-muted mb-2">
            benson scouted the web
          </p>
          {showDiscoverySummary ? (
            <p className="text-xs text-paper-soft mb-2">{discoverySummary.slice(0, 180)}</p>
          ) : null}
          <ul className="space-y-1.5 text-xs">
            {freshDiscoveryItems.slice(0, 3).map((item) => (
              <li key={item.contentItemId} className="flex items-start justify-between gap-2">
                <Link
                  href={`/review/inventory?id=${item.contentItemId}`}
                  className="font-semibold hover:text-accent leading-snug"
                >
                  {item.title}
                </Link>
                <DiscoverySkipButton
                  contentItemId={item.contentItemId}
                  sourceScreen="home"
                  onSkipped={() => {
                    setDiscovery((prev) =>
                      prev
                        ? {
                            ...prev,
                            items: prev.items.filter((i) => i.contentItemId !== item.contentItemId),
                          }
                        : prev,
                    );
                    void reload();
                  }}
                  className="btn-ghost text-2xs py-1.5 min-h-[32px] px-2 shrink-0"
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
            benson&apos;s top picks
          </p>
          <ul className="space-y-2 text-xs">
            {freshOpportunities.map((opp) => {
              const primary = opp.primaryAction ?? { key: 'review' as const, label: 'Review details' };
              const busy = busyId === opp.id;
              return (
                <li key={opp.id} className="rounded-lg border border-paper-edge/50 p-2.5 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold leading-snug">{opp.title}</span>
                    <span className="tabular-nums font-bold text-accent shrink-0">{opp.composite}</span>
                  </div>
                  <p className="text-2xs text-paper-muted">
                    {[opp.category, opp.location, opp.eventDate ? formatDateTime(opp.eventDate) : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void runTopPickPrimary(opp)}
                      className="btn-primary text-2xs py-1.5 min-h-[32px] px-2.5"
                    >
                      {primary.label}
                    </button>
                    <button type="button" disabled={busy} onClick={() => void laterTopPick(opp.id)} className="text-2xs text-paper-muted hover:text-accent">
                      Later
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void notInterestedTopPick(opp.id)}
                      className="text-2xs text-paper-muted hover:text-accent"
                    >
                      Skip
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
