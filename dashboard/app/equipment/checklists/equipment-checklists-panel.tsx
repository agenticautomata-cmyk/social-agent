'use client';

import { useCallback, useEffect, useState } from 'react';
import { EquipmentNav } from '../../../components/equipment-nav';
import { clientApiUrl } from '../../../lib/client-api';
import type { EquipmentChecklistRecord } from '../../../lib/equipment-types';
import { websitePanelClass, websiteTitleClass } from '../../../lib/website-ui';

export function EquipmentChecklistsPanel() {
  const [checklists, setChecklists] = useState<EquipmentChecklistRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(clientApiUrl('/api/equipment/checklists'), { cache: 'no-store' });
      const data = (await res.json()) as { checklists: EquipmentChecklistRecord[] };
      setChecklists(data.checklists);
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
        <p className="text-sm font-medium text-rose-600">Gear Coach</p>
        <h1 className={websiteTitleClass}>Shoot checklists</h1>
        <p className="mt-1 text-paper-muted">Reusable gear prep for common Kellie shoot types.</p>
      </header>
      <EquipmentNav />
      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : (
        <div className="space-y-4">
          {checklists.map((cl) => (
            <article key={cl.id} className={websitePanelClass}>
              <h2 className="font-semibold text-paper-ink">{cl.title}</h2>
              {cl.description ? <p className="text-sm text-paper-muted mt-1">{cl.description}</p> : null}
              <p className="mt-2 text-sm">
                <span className="font-medium text-paper-ink">Gear: </span>
                {cl.gearToBring.join(', ')}
              </p>
              <ol className="mt-3 list-decimal pl-5 text-sm text-paper-muted space-y-2">
                {cl.steps.map((step) => (
                  <li key={step.title}>
                    <span className="font-medium text-paper-ink">{step.title}</span> — {step.detail}
                  </li>
                ))}
              </ol>
              {cl.commonMistakes.length > 0 ? (
                <p className="mt-3 text-sm text-amber-200/90">
                  <span className="font-medium">Common mistakes: </span>
                  {cl.commonMistakes.join(' · ')}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
