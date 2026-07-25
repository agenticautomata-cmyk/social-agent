'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { clientApiUrl } from '../../../lib/client-api';

type AlertPrefs = {
  breakingOnly: boolean;
  highConfidence: boolean;
  dailyDigest: boolean;
  allQualified: boolean;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
  cities: string[];
  signalCategories: string[];
};

export default function EarlySignalAlertsPage() {
  const [prefs, setPrefs] = useState<AlertPrefs | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    return fetch(clientApiUrl('/api/early-signals/settings/alerts'))
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json() as Promise<{ preferences: AlertPrefs }>;
      })
      .then((json) => setPrefs(json.preferences))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function save() {
    if (!prefs) return;
    setSaved(false);
    setError(null);
    try {
      const res = await fetch(clientApiUrl('/api/early-signals/settings/alerts'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prefs),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  }

  if (!prefs) {
    return <p className="text-sm text-paper-muted italic">Loading alert settings…</p>;
  }

  return (
    <div className="page-shell max-w-2xl mx-auto space-y-6">
      <header>
        <h1 className="page-title">Early signal alerts</h1>
        <p className="page-subtitle">Push and Telegram when Benson finds qualified KC leads.</p>
      </header>

      <section className="glass-panel p-5 space-y-4">
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={prefs.breakingOnly} onChange={(e) => setPrefs({ ...prefs, breakingOnly: e.target.checked })} />
          Breaking only (72-hour urgency)
        </label>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={prefs.highConfidence} onChange={(e) => setPrefs({ ...prefs, highConfidence: e.target.checked })} />
          High confidence and above
        </label>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={prefs.allQualified} onChange={(e) => setPrefs({ ...prefs, allQualified: e.target.checked })} />
          All qualified signals (not weak)
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            Quiet hours start
            <input
              type="number"
              min={0}
              max={23}
              className="input mt-1 w-full"
              value={prefs.quietHoursStart ?? ''}
              onChange={(e) =>
                setPrefs({ ...prefs, quietHoursStart: e.target.value ? Number(e.target.value) : null })
              }
            />
          </label>
          <label className="text-sm">
            Quiet hours end
            <input
              type="number"
              min={0}
              max={23}
              className="input mt-1 w-full"
              value={prefs.quietHoursEnd ?? ''}
              onChange={(e) =>
                setPrefs({ ...prefs, quietHoursEnd: e.target.value ? Number(e.target.value) : null })
              }
            />
          </label>
        </div>
        <button type="button" className="btn-primary text-sm" onClick={() => void save()}>
          Save preferences
        </button>
        {saved ? <p className="text-xs text-green-300">Saved.</p> : null}
        {error ? <p className="text-xs text-red-300">{error}</p> : null}
      </section>

      <p className="text-sm text-paper-dim">
        Web push also respects the master toggle on{' '}
        <Link href="/settings/notifications" className="text-accent hover:underline">
          Notifications
        </Link>
        . Enable the <strong>Early signals</strong> topic there.
      </p>
      <Link href="/signals" className="btn-ghost text-xs inline-flex">
        ← Early Signals
      </Link>
    </div>
  );
}
