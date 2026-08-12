'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { clientApiUrl } from '../../lib/client-api';
import { useOptionalBensonDataRefresh } from '../../lib/benson-data-refresh';
import { useActionToast } from '../../components/action-toast';
import { humanizeCategoryLabel } from '../../lib/category-label';

type DiscoveryCard = {
  contentItemId: string;
  title: string;
  summary: string | null;
  locationName: string | null;
  category: string | null;
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

  async function vote(contentItemId: string, action: VoteAction) {
    setBusyId(contentItemId);
    setError(null);
    // Optimistic remove so voting feels snappy.
    setItems((prev) => prev.filter((item) => item.contentItemId !== contentItemId));
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

  if (loading) {
    return <p className="text-sm text-paper-muted">Loading discoveries…</p>;
  }

  if (items.length === 0) {
    return (
      <div className="glass-panel p-6 space-y-3">
        <p className="text-sm text-paper-soft">No open discoveries right now.</p>
        <p className="text-xs text-paper-muted">
          When Benson scouts something new, it shows up here for a quick vote.
        </p>
        {error ? <p className="text-xs text-red-300">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error ? <p className="text-xs text-red-300">{error}</p> : null}
      {items.map((item) => (
        <article
          key={item.contentItemId}
          className="glass-panel p-4 md:p-5 space-y-3 border border-paper-edge/40"
        >
          <div className="space-y-1">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <Link
                href={`/discoveries/${item.contentItemId}`}
                className="text-base font-semibold text-paper-soft hover:text-accent"
              >
                {item.title}
              </Link>
              {humanizeCategoryLabel(item.category) ? (
                <span className="text-2xs px-1.5 py-0.5 rounded-full border border-paper-edge/60 text-paper-muted">
                  {humanizeCategoryLabel(item.category)}
                </span>
              ) : null}
            </div>
            {item.summary ? (
              <p className="text-sm text-paper-muted line-clamp-3">{item.summary}</p>
            ) : null}
            <p className="text-2xs text-paper-muted">
              {[item.locationName, item.sourceLabel].filter(Boolean).join(' · ') || 'KC discovery'}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {(Object.keys(VOTE_LABELS) as VoteAction[]).map((action) => (
              <button
                key={action}
                type="button"
                disabled={busyId === item.contentItemId}
                onClick={() => void vote(item.contentItemId, action)}
                className={
                  action === 'more_like_this'
                    ? 'btn-primary text-xs py-2 min-h-[44px] px-3'
                    : action === 'not_interested'
                      ? 'btn-secondary text-xs py-2 min-h-[44px] px-3 opacity-80'
                      : 'btn-secondary text-xs py-2 min-h-[44px] px-3'
                }
              >
                {VOTE_LABELS[action]}
              </button>
            ))}
            <Link
              href={`/discoveries/${item.contentItemId}`}
              className="btn-secondary text-xs py-2 min-h-[44px] px-3 inline-flex items-center"
            >
              Open
            </Link>
          </div>
        </article>
      ))}
    </div>
  );
}
