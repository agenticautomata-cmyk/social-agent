'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { clientApiUrl } from '../../../lib/client-api';

type InspectResult = {
  submittedUrl: string;
  platform: string;
  sourceType: string;
  titleGuess: string;
  isSingleItem: boolean;
  monitoringModes: string[];
  recommendedMode: string;
  extractionMethod: string;
  checkFrequencyHours: number;
  loginRequired: boolean;
  sourceReliability: number;
  creatorLeadPotential: number;
  explanation: string;
};

const MODE_LABELS: Record<string, string> = {
  SINGLE_ITEM: 'Process this item only',
  WATCH_PAGE: 'Watch this page',
  WATCH_PUBLISHER: 'Watch the publisher',
  WATCH_ACCOUNT: 'Watch this account',
  WATCH_FEED: 'Watch this feed',
  WATCH_DOCUMENT_INDEX: 'Watch document index',
};

export function AddSourcePanel() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [inspect, setInspect] = useState<InspectResult | null>(null);
  const [mode, setMode] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onInspect() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(clientApiUrl('/api/watchlist/inspect'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const json = (await res.json()) as { ok: boolean; inspect?: InspectResult; error?: string };
      if (!json.ok || !json.inspect) throw new Error(json.error ?? 'Inspect failed');
      setInspect(json.inspect);
      setMode(json.inspect.recommendedMode);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Inspect failed');
      setInspect(null);
    } finally {
      setBusy(false);
    }
  }

  async function onCreate() {
    if (!inspect || !mode) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(clientApiUrl('/api/watchlist'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          monitoringMode: mode,
          processOnly: mode === 'SINGLE_ITEM',
        }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        watcher?: { id: string };
        alreadyWatching?: boolean;
        error?: string;
      };
      if (!json.ok || !json.watcher) throw new Error(json.error ?? 'Create failed');
      if (json.alreadyWatching) {
        setNotice('Already watching this source. Opening the existing entry — no duplicate was created.');
        setTimeout(() => router.push(`/watchlist/${json.watcher!.id}`), 1400);
        return;
      }
      router.push(`/watchlist/${json.watcher.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 max-w-xl">
      <Link href="/watchlist" className="btn-ghost text-xs inline-flex">
        ← Watchlist
      </Link>

      <div className="space-y-2">
        <label htmlFor="source-url" className="text-sm font-medium">
          Paste a URL
        </label>
        <input
          id="source-url"
          type="url"
          className="input w-full"
          placeholder="https://…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button type="button" className="btn-primary text-sm" disabled={!url || busy} onClick={() => void onInspect()}>
          Inspect
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {notice && <p className="text-sm text-amber-700">{notice}</p>}

      {inspect && (
        <div className="card p-4 space-y-4">
          <div>
            <h2 className="font-semibold">{inspect.titleGuess}</h2>
            <p className="text-sm text-paper-muted">{inspect.explanation}</p>
          </div>
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <dt className="text-paper-muted">Type</dt>
              <dd>{inspect.sourceType.replace(/_/g, ' ')}</dd>
            </div>
            <div>
              <dt className="text-paper-muted">Platform</dt>
              <dd>{inspect.platform}</dd>
            </div>
            <div>
              <dt className="text-paper-muted">Extraction</dt>
              <dd>{inspect.extractionMethod}</dd>
            </div>
            <div>
              <dt className="text-paper-muted">Check every</dt>
              <dd>{inspect.checkFrequencyHours}h</dd>
            </div>
            {inspect.loginRequired && (
              <div className="col-span-2 text-amber-700">
                Login may be required for ongoing account monitoring.
              </div>
            )}
          </dl>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">How should Benson handle this?</legend>
            {inspect.monitoringModes.map((m) => (
              <label key={m} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="mode"
                  checked={mode === m}
                  onChange={() => setMode(m)}
                />
                {MODE_LABELS[m] ?? m}
              </label>
            ))}
          </fieldset>

          <button type="button" className="btn-primary text-sm w-full sm:w-auto" disabled={busy} onClick={() => void onCreate()}>
            {mode === 'SINGLE_ITEM' ? 'Process once' : 'Start watching'}
          </button>
        </div>
      )}
    </div>
  );
}
