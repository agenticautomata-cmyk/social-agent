'use client';

import { useEffect, useState } from 'react';
import { clientApiUrl } from '../../../lib/client-api';

type SuppressionRow = {
  id: string;
  canonicalName: string;
  aliases: string[];
  suppressionReason: string;
  suppressionScope: string;
  permanent: boolean;
  createdAt: string;
};

export default function SuppressionAdminPage() {
  const [rows, setRows] = useState<SuppressionRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(clientApiUrl('/api/creator-agent/suppressions'))
      .then((res) => res.json())
      .then((json) => {
        if (!json.ok) throw new Error(json.error ?? 'Failed to load suppressions');
        setRows(json.suppressions ?? []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, []);

  return (
    <main className="mx-auto max-w-3xl p-4 space-y-4">
      <h1 className="text-2xl font-semibold">Suppression management</h1>
      <p className="text-sm text-neutral-400">
        Permanent entity suppressions are applied before Home, Ask Benson, feeds, and alerts.
      </p>
      {error ? <p className="text-red-400">{error}</p> : null}
      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.id} className="rounded-xl border border-neutral-800 p-4">
            <div className="font-medium">{row.canonicalName}</div>
            <div className="text-sm text-neutral-400">{row.suppressionReason}</div>
            <div className="text-xs text-neutral-500 mt-1">
              {row.suppressionScope} · {row.permanent ? 'permanent' : 'temporary'}
            </div>
            {row.aliases?.length ? (
              <div className="text-xs text-neutral-500 mt-1">Aliases: {row.aliases.join(', ')}</div>
            ) : null}
          </li>
        ))}
      </ul>
    </main>
  );
}
