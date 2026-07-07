'use client';

import { useCallback, useEffect, useState } from 'react';
import { PlaybookNav } from '../../../components/playbook-nav';
import { clientApiUrl } from '../../../lib/client-api';
import type { PlaybookSourceRecord } from '../../../lib/playbook-types';
import { PLAYBOOK_CATEGORY } from '../../../lib/playbook-types';
import { websitePanelClass, websiteTitleClass } from '../../../lib/website-ui';

export function PlaybookSourcesPanel() {
  const [sources, setSources] = useState<PlaybookSourceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(clientApiUrl('/api/playbook/sources'), { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load sources');
      const data = (await res.json()) as { sources: PlaybookSourceRecord[] };
      setSources(data.sources);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <header className="mb-6">
        <p className="text-sm font-medium text-rose-600">{PLAYBOOK_CATEGORY}</p>
        <h1 className={websiteTitleClass}>Playbook sources</h1>
        <p className="mt-1 text-paper-muted">
          Official TikTok Academy, Creator Tools, Studio, Search Insights, Creative Center, and Ads best
          practices — from ~/Downloads or{' '}
          <code className="text-xs">pnpm playbook:download-sources</code>.
        </p>
      </header>

      <PlaybookNav />

      {error ? <p className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p> : null}

      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : (
        <div className="space-y-3">
          {sources.map((source) => (
            <div key={source.id} className={websitePanelClass}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-paper-muted">{source.category}</p>
                  <h2 className="text-lg font-semibold text-paper-ink">{source.name}</h2>
                  {source.notes ? <p className="mt-1 text-sm text-paper-muted">{source.notes}</p> : null}
                </div>
                {source.document ? (
                  <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-800">
                    {source.document.chunkCount} chunks
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-800">Missing</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
