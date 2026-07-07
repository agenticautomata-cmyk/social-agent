'use client';

import { useCallback, useEffect, useState } from 'react';
import { EquipmentNav } from '../../../components/equipment-nav';
import { clientApiLongRunningUrl, clientApiUrl } from '../../../lib/client-api';
import type { EquipmentAskResponse, EquipmentChecklistRecord } from '../../../lib/equipment-types';
import {
  websiteFieldClass,
  websiteLabelClass,
  websitePanelClass,
  websiteTitleClass,
} from '../../../lib/website-ui';

export function EquipmentShootSetupPanel() {
  const [checklists, setChecklists] = useState<EquipmentChecklistRecord[]>([]);
  const [selectedSlug, setSelectedSlug] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<EquipmentAskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(clientApiUrl('/api/equipment/checklists'), { cache: 'no-store' });
    const data = (await res.json()) as { checklists: EquipmentChecklistRecord[] };
    setChecklists(data.checklists);
    setSelectedSlug(data.checklists[0]?.slug ?? '');
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function generateSetup() {
    if (!selectedSlug) return;
    setBusy(true);
    setError(null);
    setAnswer(null);
    try {
      const res = await fetch(clientApiLongRunningUrl('/api/equipment/checklists/generate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shootType: selectedSlug, notes: notes.trim() || undefined }),
      });
      const data = (await res.json()) as EquipmentAskResponse & {
        ok: boolean;
        error?: string;
        checklist?: EquipmentChecklistRecord | null;
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Generate failed');
      setAnswer(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generate failed');
    } finally {
      setBusy(false);
    }
  }

  const selected = checklists.find((c) => c.slug === selectedSlug);

  return (
    <div>
      <header className="mb-6">
        <p className="text-sm font-medium text-rose-600">Gear Coach</p>
        <h1 className={websiteTitleClass}>Shoot setup</h1>
        <p className="mt-1 text-paper-muted">
          Pick a shoot type and Benson walks you through gimbal + mic setup from your manuals.
        </p>
      </header>
      <EquipmentNav />

      <div className={`${websitePanelClass} space-y-4 max-w-xl`}>
        <label className="block">
          <span className={websiteLabelClass}>Shoot type</span>
          <select
            className={websiteFieldClass}
            value={selectedSlug}
            onChange={(e) => setSelectedSlug(e.target.value)}
          >
            {checklists.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
        {selected ? (
          <p className="text-sm text-paper-muted">Gear: {selected.gearToBring.join(', ')}</p>
        ) : null}
        <label className="block">
          <span className={websiteLabelClass}>Anything special today? (optional)</span>
          <textarea
            className={websiteFieldClass}
            rows={2}
            placeholder="e.g. noisy restaurant, outdoor wind"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={busy || !selectedSlug}
          onClick={() => void generateSetup()}
          className="btn-primary text-sm disabled:opacity-50"
        >
          {busy ? 'Building setup…' : 'Get setup steps from Benson'}
        </button>
      </div>

      {error ? <p className="mt-4 text-sm text-rose-700">{error}</p> : null}

      {answer ? (
        <div className={`${websitePanelClass} mt-6`}>
          <p className="text-xs font-medium text-accent mb-2">Benson setup plan</p>
          <div className="text-sm text-paper-ink whitespace-pre-wrap">{answer.answer}</div>
          {answer.sources.length > 0 ? (
            <ul className="mt-4 text-xs text-paper-muted space-y-1">
              {answer.sources.map((s, i) => (
                <li key={i}>
                  {s.manualTitle}
                  {s.pageNumber ? ` p.${s.pageNumber}` : ''}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
