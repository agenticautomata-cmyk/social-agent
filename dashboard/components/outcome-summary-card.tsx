'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { clientApiUrl } from '../lib/client-api';

type OutcomeCards = {
  acceptanceRate: number | null;
  plannedToFilmedRate: number | null;
  filmedToPostedRate: number | null;
  totalRecommendations: number;
  completedRecommendations: number;
};

export function OutcomeSummaryCard({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<OutcomeCards | null>(null);

  const reload = useCallback(() => {
    return fetch(clientApiUrl('/api/outcomes/cards'), { cache: 'no-store' })
      .then(async (res) => (res.ok ? res.json() : null))
      .then(setData)
      .catch(() => setData(null));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!data) return null;

  const body = (
    <>
      <div className="text-2xs uppercase tracking-wider text-paper-muted">Outcome loop</div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
        <Metric label="Accept" value={data.acceptanceRate} />
        <Metric label="Plan→Film" value={data.plannedToFilmedRate} />
        <Metric label="Film→Post" value={data.filmedToPostedRate} />
      </div>
      {!compact ? (
        <p className="text-2xs text-paper-dim mt-3">
          {data.completedRecommendations}/{data.totalRecommendations} recommendations linked to outcomes
        </p>
      ) : null}
    </>
  );

  return (
    <Link href="/analytics/outcomes" className="glass-panel p-4 block transition hover:bg-white/[0.07]">
      {body}
    </Link>
  );
}

function Metric({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <div className="text-lg font-bold stat-mono text-paper-ink">{value != null ? `${value}%` : '—'}</div>
      <div className="text-2xs text-paper-muted">{label}</div>
    </div>
  );
}
