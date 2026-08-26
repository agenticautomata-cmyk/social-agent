'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { clientApiUrl } from '../../lib/client-api';
import { skipDiscoveryItem, useOptionalBensonDataRefresh } from '../../lib/benson-data-refresh';
import { useActionToast } from '../../components/action-toast';

type PrimaryAction = {
  key: 'add_to_today' | 'review' | 'open_program';
  label: string;
};

type DiscoveryCard = {
  contentItemId: string;
  title: string;
  summary: string | null;
  locationName: string | null;
  category: string | null;
  opportunityKind?: string;
  whereWhen?: string | null;
  confidenceLabel?: string;
  primaryAction?: PrimaryAction;
  sourceUrl: string | null;
  sourceLabel: string | null;
  eventStartsAt: string | null;
  discoveredAt: string | null;
};

type VoteAction = 'more_like_this' | 'less_like_this' | 'not_interested';

const VOTE_LABELS: Record<VoteAction, string> = {
  more_like_this: 'More like this',
  less_like_this: 'Less like this',
  not_interested: 'Not interested',
};

const VOTE_CONFIRMATIONS: Record<VoteAction, string> = {
  more_like_this: 'More like this',
  less_like_this: 'Fewer like this',
  not_interested: 'Not interested',
};

function detailHref(id: string): string {
  return `/discoveries/${id}`;
}

export function DiscoveriesPanel() {
  const refresh = useOptionalBensonDataRefresh();
  const { showToast } = useActionToast();
  const [items, setItems] = useState<DiscoveryCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch(clientApiUrl('/api/creator-interest/discoveries/feed?limit=40'), {
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Failed to load discoveries (${res.status})`);
    const data = (await res.json()) as { discoveries: DiscoveryCard[] };
    setItems(data.discoveries ?? []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void load()
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Load failed');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  function removeItem(contentItemId: string) {
    setItems((prev) => prev.filter((item) => item.contentItemId !== contentItemId));
  }

  async function vote(contentItemId: string, action: VoteAction) {
    setBusyId(contentItemId);
    setError(null);
    removeItem(contentItemId);
    try {
      const res = await fetch(
        clientApiUrl(`/api/creator-interest/records/${contentItemId}/interest`),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, sourceScreen: 'discoveries' }),
        },
      );
      const body = (await res.json().catch(() => ({}))) as { error?: string; nextStep?: string };
      if (!res.ok) {
        throw new Error(body.error ?? `Vote failed (${res.status})`);
      }
      refresh?.notifyLocalChange(['opportunities', 'discoveries', 'recommendations', 'home_briefing']);
      showToast({ title: VOTE_CONFIRMATIONS[action], nextStep: body.nextStep ?? null });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Vote failed';
      setError(message);
      showToast({ title: "That vote didn't save", nextStep: message, tone: 'error' });
      await load().catch(() => undefined);
    } finally {
      setBusyId(null);
    }
  }

  async function runPrimary(item: DiscoveryCard) {
    const action = item.primaryAction ?? { key: 'review' as const, label: 'Review details' };
    if (action.key === 'review' || action.key === 'open_program') {
      window.location.href = detailHref(item.contentItemId);
      return;
    }
    setBusyId(item.contentItemId);
    setError(null);
    try {
      const res = await fetch(
        clientApiUrl(`/api/creator-interest/records/${item.contentItemId}/add-to-today`),
        { method: 'POST' },
      );
      if (!res.ok) throw new Error(`Could not add to Today (${res.status})`);
      removeItem(item.contentItemId);
      refresh?.notifyLocalChange(['opportunities', 'discoveries', 'recommendations', 'home_briefing']);
      showToast({ title: action.label, nextStep: 'It’s on Today when you want it.' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not add to Today';
      setError(message);
      showToast({ title: 'Could not add to Today', nextStep: message, tone: 'error' });
    } finally {
      setBusyId(null);
    }
  }

  async function later(contentItemId: string) {
    setBusyId(contentItemId);
    setError(null);
    removeItem(contentItemId);
    try {
      await skipDiscoveryItem({
        contentItemId,
        sourceScreen: 'discoveries',
        snoozePreset: 'later_today',
      });
      refresh?.notifyLocalChange(['opportunities', 'discoveries', 'recommendations', 'home_briefing']);
      showToast({ title: 'Later', nextStep: 'Hidden until later today, then it comes back.' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not snooze';
      setError(message);
      showToast({ title: 'Could not snooze', nextStep: message, tone: 'error' });
      await load().catch(() => undefined);
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return <p className="text-sm text-paper-muted">Loading discoveries…</p>;
  }

  if (items.length === 0) {
    return (
      <div className="glass-panel p-6 space-y-3">
        <p className="text-sm text-paper-soft">No open discoveries right now.</p>
        <p className="text-xs text-paper-muted">
          When Benson finds something Kellie may actually care about, it shows up here.
        </p>
        {error ? <p className="text-xs text-red-300">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error ? <p className="text-xs text-red-300">{error}</p> : null}
      {items.map((item) => {
        const kind = item.opportunityKind || item.category;
        const primary = item.primaryAction ?? { key: 'review' as const, label: 'Review details' };
        const busy = busyId === item.contentItemId;
        return (
          <article
            key={item.contentItemId}
            className="glass-panel p-4 md:p-5 space-y-3 border border-paper-edge/40"
          >
            <div className="space-y-1">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <Link
                  href={detailHref(item.contentItemId)}
                  className="text-base font-semibold text-paper-soft hover:text-accent"
                >
                  {item.title}
                </Link>
                {kind ? (
                  <span className="text-2xs px-1.5 py-0.5 rounded-full border border-paper-edge/60 text-paper-muted">
                    {kind}
                  </span>
                ) : null}
              </div>
              {item.summary ? (
                <p className="text-sm text-paper-muted line-clamp-3">{item.summary}</p>
              ) : null}
              <p className="text-2xs text-paper-muted">
                {[item.whereWhen || item.locationName, item.confidenceLabel].filter(Boolean).join(' · ')}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void runPrimary(item)}
                className="btn-primary text-xs py-2 min-h-[44px] px-3"
              >
                {primary.label}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-paper-muted">
              {item.sourceUrl ? (
                <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="hover:text-accent">
                  View source
                </a>
              ) : null}
              <button type="button" disabled={busy} onClick={() => void later(item.contentItemId)} className="hover:text-accent">
                Later
              </button>
              {(Object.keys(VOTE_LABELS) as VoteAction[]).map((action) => (
                <button
                  key={action}
                  type="button"
                  disabled={busy}
                  onClick={() => void vote(item.contentItemId, action)}
                  className="hover:text-accent"
                >
                  {VOTE_LABELS[action]}
                </button>
              ))}
            </div>
          </article>
        );
      })}
    </div>
  );
}
