'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { EquipmentNav } from '../../../components/equipment-nav';
import { clientApiUrl } from '../../../lib/client-api';
import type { EquipmentManualSummary } from '../../../lib/equipment-types';
import { websitePanelClass, websiteTitleClass } from '../../../lib/website-ui';

export function EquipmentManualsPanel() {
  const [manuals, setManuals] = useState<EquipmentManualSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(clientApiUrl('/api/equipment/manuals'), { cache: 'no-store' });
      const data = (await res.json()) as { manuals: EquipmentManualSummary[] };
      setManuals(data.manuals);
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
        <h1 className={websiteTitleClass}>Ingested manuals</h1>
        <p className="mt-1 text-paper-muted">Private to Benson — PDFs and saved web pages from ~/Downloads.</p>
      </header>
      <EquipmentNav />
      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : manuals.length === 0 ? (
        <p className="text-sm text-neutral-500">No manuals yet. Run ingest from Overview.</p>
      ) : (
        <ul className="space-y-3">
          {manuals.map((m) => (
            <li key={m.id} className={websitePanelClass}>
              <Link href={`/equipment/manuals/${m.id}`} className="block hover:opacity-90">
                <h2 className="font-semibold text-paper-ink">{m.equipmentName}</h2>
                <p className="text-sm text-paper-muted">{m.title}</p>
                <p className="mt-1 text-sm">
                  {m.chunkCount} chunks · {m.pageCount ?? '?'} pages
                  {m.ingestedAt ? ` · ingested ${new Date(m.ingestedAt).toLocaleDateString()}` : ''}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
