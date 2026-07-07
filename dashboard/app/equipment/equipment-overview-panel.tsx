'use client';

import { useCallback, useEffect, useState } from 'react';
import { EquipmentNav } from '../../components/equipment-nav';
import { clientApiUrl } from '../../lib/client-api';
import type { EquipmentItemRecord, EquipmentTroubleshootingRecord } from '../../lib/equipment-types';
import { websitePanelClass, websiteTitleClass } from '../../lib/website-ui';

export function EquipmentOverviewPanel() {
  const [items, setItems] = useState<EquipmentItemRecord[]>([]);
  const [troubleshooting, setTroubleshooting] = useState<EquipmentTroubleshootingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [ingesting, setIngesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(clientApiUrl('/api/equipment'), { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load equipment');
      const data = (await res.json()) as {
        items: EquipmentItemRecord[];
        troubleshooting: EquipmentTroubleshootingRecord[];
      };
      setItems(data.items);
      setTroubleshooting(data.troubleshooting.slice(0, 5));
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
      const res = await fetch(clientApiUrl('/api/equipment/ingest'), { method: 'POST' });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Ingest failed');
      setMessage('Manuals ingested from ~/Downloads.');
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
        <p className="text-sm font-medium text-rose-600">Gear Coach</p>
        <h1 className={websiteTitleClass}>Equipment Expert</h1>
        <p className="mt-1 text-paper-muted">
          Benson knows your Osmo, LARK mic, iPhone 17 Pro, TikTok, CapCut, and Blackmagic guides — ask setup
          and troubleshooting while filming.
        </p>
      </header>

      <EquipmentNav />

      {error ? <p className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p> : null}
      {message ? <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</p> : null}

      <div className="mb-6 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={ingesting}
          onClick={() => void runIngest()}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {ingesting ? 'Ingesting…' : 'Ingest manuals from Downloads'}
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-neutral-500">Loading gear…</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((item) => (
            <div key={item.id} className={websitePanelClass}>
              <p className="text-xs uppercase tracking-wide text-paper-muted">{item.category}</p>
              <h2 className="text-lg font-semibold text-paper-ink">{item.name}</h2>
              <p className="text-sm text-paper-muted">
                {item.brand} · {item.model}
              </p>
              {item.manual ? (
                <p className="mt-2 text-sm text-emerald-700">
                  Manual indexed — {item.manual.chunkCount} chunks
                  {item.manual.pageCount ? ` · ${item.manual.pageCount} pages` : ''}
                </p>
              ) : (
                <p className="mt-2 text-sm text-amber-700">No manual ingested yet.</p>
              )}
            </div>
          ))}
        </div>
      )}

      {troubleshooting.length > 0 ? (
        <div className={`${websitePanelClass} mt-8`}>
          <h2 className="font-semibold text-paper-ink">Quick help topics</h2>
          <ul className="mt-3 space-y-1 text-sm text-paper-muted">
            {troubleshooting.map((t) => (
              <li key={t.id}>• {t.label}</li>
            ))}
          </ul>
          <p className="mt-3 text-sm">
            <a href="/equipment/ask" className="text-accent underline">
              Open Ask Benson →
            </a>
          </p>
        </div>
      ) : null}
    </div>
  );
}
