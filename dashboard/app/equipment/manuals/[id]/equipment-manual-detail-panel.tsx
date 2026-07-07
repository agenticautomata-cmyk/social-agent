'use client';

import { useCallback, useEffect, useState } from 'react';
import { EquipmentNav } from '../../../../components/equipment-nav';
import { clientApiUrl } from '../../../../lib/client-api';
import { websitePanelClass, websiteTitleClass } from '../../../../lib/website-ui';

type ChunkRow = {
  id: string;
  pageNumber: number | null;
  sectionTitle: string | null;
  chunkIndex: number;
  preview: string;
};

export function EquipmentManualDetailPanel({ manualId }: { manualId: string }) {
  const [manual, setManual] = useState<{
    title: string;
    equipmentName?: string;
    chunkCount: number;
    pageCount: number | null;
  } | null>(null);
  const [chunks, setChunks] = useState<ChunkRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(clientApiUrl(`/api/equipment/manuals/${manualId}`), { cache: 'no-store' });
      if (!res.ok) throw new Error('Not found');
      const data = (await res.json()) as { manual: typeof manual; chunks: ChunkRow[] };
      setManual(data.manual);
      setChunks(data.chunks);
    } finally {
      setLoading(false);
    }
  }, [manualId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <p className="text-sm text-neutral-500">Loading manual…</p>;
  if (!manual) return <p className="text-sm text-rose-700">Manual not found.</p>;

  return (
    <div>
      <header className="mb-6">
        <p className="text-sm font-medium text-rose-600">Gear Coach</p>
        <h1 className={websiteTitleClass}>{manual.equipmentName ?? manual.title}</h1>
        <p className="mt-1 text-paper-muted">
          {manual.title} · {manual.chunkCount} chunks · {manual.pageCount ?? '?'} pages
        </p>
      </header>
      <EquipmentNav />
      <ul className="space-y-2">
        {chunks.map((ch) => (
          <li key={ch.id} className={`${websitePanelClass} text-sm`}>
            <p className="font-medium text-paper-ink">
              Chunk {ch.chunkIndex + 1}
              {ch.pageNumber ? ` · p.${ch.pageNumber}` : ''}
              {ch.sectionTitle ? ` · ${ch.sectionTitle}` : ''}
            </p>
            <p className="mt-1 text-paper-muted whitespace-pre-wrap">{ch.preview}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
