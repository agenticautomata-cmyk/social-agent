'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { PlaybookNav } from '../../components/playbook-nav';
import { clientApiUrl } from '../../lib/client-api';
import type { PlaybookQuickAction, PlaybookSourceRecord } from '../../lib/playbook-types';
import { PLAYBOOK_CATEGORY } from '../../lib/playbook-types';
import { websitePanelClass, websiteTitleClass } from '../../lib/website-ui';

export function PlaybookOverviewPanel() {
  const [sources, setSources] = useState<PlaybookSourceRecord[]>([]);
  const [quickActions, setQuickActions] = useState<PlaybookQuickAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [ingesting, setIngesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(clientApiUrl('/api/playbook'), { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load playbook');
      const data = (await res.json()) as {
        sources: PlaybookSourceRecord[];
        quickActions: PlaybookQuickAction[];
      };
      setSources(data.sources);
      setQuickActions(data.quickActions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function runIngest() {
    setIngesting(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(clientApiUrl('/api/playbook/ingest'), { method: 'POST' });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Ingest failed');
      setMessage('Playbook sources ingested from ~/Downloads.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ingest failed');
    } finally {
      setIngesting(false);
    }
  }

  return (
    <div>
      <header className="mb-6">
        <p className="text-sm font-medium text-rose-600">{PLAYBOOK_CATEGORY}</p>
        <h1 className={websiteTitleClass}>TikTok Coach</h1>
        <p className="mt-1 text-paper-muted">
          Benson coaches hooks, captions, Search, Studio analytics, sponsor angles, and posting strategy —
          official TikTok sources first, Kellie&apos;s analytics when live.
        </p>
      </header>

      <PlaybookNav />

      {error ? <p className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p> : null}
      {message ? <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</p> : null}

      <div className="mb-6 flex flex-wrap gap-3">
        <Link href="/playbook/coach" className="btn-primary text-sm">
          Open TikTok Coach
        </Link>
        <button
          type="button"
          disabled={ingesting}
          onClick={() => void runIngest()}
          className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-50"
        >
          {ingesting ? 'Ingesting…' : 'Ingest sources from Downloads'}
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-neutral-500">Loading playbook…</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {sources.map((source) => (
            <div key={source.id} className={websitePanelClass}>
              <p className="text-xs uppercase tracking-wide text-paper-muted">{source.category}</p>
              <h2 className="text-lg font-semibold text-paper-ink">{source.name}</h2>
              {source.document ? (
                <p className="mt-2 text-sm text-emerald-700">
                  Indexed — {source.document.chunkCount} chunks
                  {source.document.pageCount ? ` · ${source.document.pageCount} sections` : ''}
                </p>
              ) : (
                <p className="mt-2 text-sm text-amber-700">Not ingested — add matching files to ~/Downloads.</p>
              )}
            </div>
          ))}
        </div>
      )}

      {quickActions.length > 0 ? (
        <div className={`${websitePanelClass} mt-8`}>
          <h2 className="font-semibold text-paper-ink">Quick coach actions</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {quickActions.map((a) => (
              <span
                key={a.id}
                className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-paper-muted"
              >
                {a.label}
              </span>
            ))}
          </div>
          <p className="mt-3 text-sm">
            <Link href="/playbook/coach" className="text-accent underline">
              Open TikTok Coach →
            </Link>
          </p>
        </div>
      ) : null}
    </div>
  );
}
