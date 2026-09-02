'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { clientApiUrl } from '../../lib/client-api';
import { skipDiscoveryItem, useOptionalBensonDataRefresh } from '../../lib/benson-data-refresh';
import { useActionToast } from '../../components/action-toast';

type PrimaryAction = {
  key: 'post_now' | 'pitch' | 'save' | 'skip';
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
  verificationGap?: string | null;
  alreadyReviewed?: boolean;
  primaryAction?: PrimaryAction;
  sourceUrl: string | null;
  sourceLabel: string | null;
  eventStartsAt: string | null;
  discoveredAt: string | null;
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

  async function runInterest(contentItemId: string, action: 'save_for_later' | 'contact_business' | 'interested') {
    const res = await fetch(clientApiUrl(`/api/creator-interest/records/${contentItemId}/interest`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, sourceScreen: 'discoveries' }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string; nextStep?: string };
    if (!res.ok) throw new Error(body.error ?? `Could not save that (${res.status})`);
    return body.nextStep ?? null;
  }

  async function runPrimary(item: DiscoveryCard) {
    const action = item.primaryAction ?? { key: 'save' as const, label: 'Save' };
    setBusyId(item.contentItemId);
    setError(null);
    try {
      if (action.key === 'pitch') {
        const nextStep = await runInterest(item.contentItemId, 'contact_business');
        removeItem(item.contentItemId);
        refresh?.notifyLocalChange(['opportunities', 'discoveries', 'recommendations', 'home_briefing']);
        showToast({ title: action.label, nextStep: nextStep ?? 'Open the card to finish contact details.' });
        window.location.href = detailHref(item.contentItemId);
        return;
      }
      if (action.key === 'save') {
        const nextStep = await runInterest(item.contentItemId, 'save_for_later');
        removeItem(item.contentItemId);
        refresh?.notifyLocalChange(['opportunities', 'discoveries', 'recommendations', 'home_briefing']);
        showToast({ title: 'Saved', nextStep: nextStep ?? 'It’s on your Saved list when you want it.' });
        return;
      }
      const res = await fetch(
        clientApiUrl(`/api/creator-interest/records/${item.contentItemId}/add-to-today`),
        { method: 'POST' },
      );
      if (!res.ok) throw new Error(`Could not add to Today (${res.status})`);
      removeItem(item.contentItemId);
      refresh?.notifyLocalChange(['opportunities', 'discoveries', 'recommendations', 'home_briefing']);
      showToast({ title: 'Post now', nextStep: 'It’s on Today when you want it.' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not complete that';
      setError(message);
      showToast({ title: 'That didn’t save', nextStep: message, tone: 'error' });
      await load().catch(() => undefined);
    } finally {
      setBusyId(null);
    }
  }

  async function saveSecondary(item: DiscoveryCard) {
    setBusyId(item.contentItemId);
    setError(null);
    removeItem(item.contentItemId);
    try {
      const nextStep = await runInterest(item.contentItemId, 'save_for_later');
      refresh?.notifyLocalChange(['opportunities', 'discoveries', 'recommendations', 'home_briefing']);
      showToast({ title: 'Saved', nextStep: nextStep ?? 'It’s on your Saved list when you want it.' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save';
      setError(message);
      showToast({ title: 'That didn’t save', nextStep: message, tone: 'error' });
      await load().catch(() => undefined);
    } finally {
      setBusyId(null);
    }
  }

  async function skip(contentItemId: string) {
    setBusyId(contentItemId);
    setError(null);
    removeItem(contentItemId);
    try {
      await skipDiscoveryItem({
        contentItemId,
        sourceScreen: 'discoveries',
      });
      refresh?.notifyLocalChange(['opportunities', 'discoveries', 'recommendations', 'home_briefing']);
      showToast({
        title: 'Skipped',
        nextStep: 'Gone from Discover, including the same opportunity from other sources. Next week’s occurrence can still appear.',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not skip';
      setError(message);
      showToast({ title: 'Could not skip', nextStep: message, tone: 'error' });
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
      <div className="glass-panel p-4 space-y-2">
        <p className="text-sm text-paper-soft">No open discoveries right now.</p>
        <p className="text-xs text-paper-muted">
          When Benson finds something Kellie can actually use, it shows up here.
        </p>
        {error ? <p className="text-xs text-red-300">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error ? <p className="text-xs text-red-300">{error}</p> : null}
      {items.map((item) => {
        const kind = item.opportunityKind || item.category;
        const primary = item.primaryAction ?? { key: 'save' as const, label: 'Save' };
        const busy = busyId === item.contentItemId;
        const showSaveSecondary = primary.key !== 'save';
        return (
          <article
            key={item.contentItemId}
            className="glass-panel p-3 md:p-4 space-y-2 border border-paper-edge/40"
          >
            <div className="space-y-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <Link
                  href={detailHref(item.contentItemId)}
                  className="text-sm font-semibold leading-snug text-paper-soft hover:text-accent"
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
                <p className="text-xs text-paper-muted leading-snug line-clamp-2">{item.summary}</p>
              ) : null}
              {item.verificationGap ? (
                <p className="text-2xs text-paper-dim leading-snug">{item.verificationGap}</p>
              ) : null}
              <p className="text-2xs text-paper-dim leading-snug">
                {[item.whereWhen || item.locationName, item.confidenceLabel, item.sourceLabel]
                  .filter(Boolean)
                  .join(' · ')}
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
              <button
                type="button"
                disabled={busy}
                onClick={() => void skip(item.contentItemId)}
                className="btn-secondary text-xs py-2 min-h-[44px] px-3"
              >
                Skip
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-paper-muted">
              {showSaveSecondary ? (
                <button type="button" disabled={busy} onClick={() => void saveSecondary(item)} className="hover:text-accent min-h-[36px]">
                  Save
                </button>
              ) : null}
              {item.sourceUrl ? (
                <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="hover:text-accent min-h-[36px] inline-flex items-center">
                  {item.sourceLabel ? `Source: ${item.sourceLabel}` : 'View source'}
                </a>
              ) : (
                <span>No source URL yet</span>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
