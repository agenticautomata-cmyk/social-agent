'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { clientApiUrl } from '../../lib/client-api';

type SignalRow = {
  id: string;
  title: string;
  summary: string;
  businessName: string | null;
  confidenceLevel: string;
  urgencyLevel: string;
  verificationStatus: string;
  state: string;
  sourceName: string | null;
  firstDetectedAt: string;
  contentRecommendation?: { recommendedAction?: string };
};

type FailedWatcher = {
  id: string;
  sourceName: string;
  sourceUrl: string;
  healthStatus: string;
  lastFailureMessage: string | null;
};

const URGENCY_SECTIONS = [
  { key: 'breaking', label: 'Breaking' },
  { key: 'early_opportunity', label: 'Early opportunities' },
  { key: 'roundup_ready', label: 'Roundup ready' },
  { key: 'planning_lead', label: 'Planning leads' },
  { key: 'needs_verification', label: 'Needs verification' },
  { key: 'weak_signal', label: 'Weak signals' },
] as const;

export function SignalsPanel() {
  const [signals, setSignals] = useState<SignalRow[]>([]);
  const [failedWatchers, setFailedWatchers] = useState<FailedWatcher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    return fetch(clientApiUrl('/api/early-signals'), { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json() as Promise<{ signals: SignalRow[]; failedWatchers: FailedWatcher[] }>;
      })
      .then((json) => {
        setSignals(json.signals);
        setFailedWatchers(json.failedWatchers ?? []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const grouped = useMemo(() => {
    const map = new Map<string, SignalRow[]>();
    for (const section of URGENCY_SECTIONS) map.set(section.key, []);
    for (const signal of signals) {
      const key =
        signal.state === 'needs_verification'
          ? 'needs_verification'
          : signal.urgencyLevel ?? 'weak_signal';
      const list = map.get(key) ?? map.get('weak_signal')!;
      list.push(signal);
    }
    return map;
  }, [signals]);

  if (loading) return <p className="text-sm text-paper-muted italic">Loading early signals…</p>;
  if (error) return <p className="text-sm text-red-300">{error}</p>;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <p className="text-sm text-paper-dim">
          Raw leads before they become scored opportunities. Benson summarizes the change — you verify before posting.
        </p>
        <div className="flex gap-2">
          <Link href="/signals/help" className="btn-ghost text-xs py-2 px-3 min-h-[36px]">
            How it works
          </Link>
          <Link href="/settings/alerts" className="btn-ghost text-xs py-2 px-3 min-h-[36px]">
            Alert settings
          </Link>
        </div>
      </div>

      {failedWatchers.length > 0 ? (
        <section className="glass-panel border border-amber-400/30 p-4">
          <h2 className="text-sm font-semibold mb-2">Source failures</h2>
          <ul className="text-sm space-y-2">
            {failedWatchers.map((w) => (
              <li key={w.id} className="flex justify-between gap-3">
                <span>{w.sourceName}</span>
                <span className="text-2xs text-paper-dim truncate max-w-xs">{w.lastFailureMessage ?? w.healthStatus}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {URGENCY_SECTIONS.map((section) => {
        const rows = grouped.get(section.key) ?? [];
        if (rows.length === 0 && section.key !== 'breaking') return null;
        return (
          <section key={section.key} className="space-y-3">
            <h2 className="text-sm font-semibold">{section.label}</h2>
            {rows.length === 0 ? (
              <p className="text-sm text-paper-muted italic">No {section.label.toLowerCase()} right now.</p>
            ) : (
              <ul className="space-y-3">
                {rows.map((signal) => (
                  <li key={signal.id} className="glass-panel p-4">
                    <div className="flex flex-wrap justify-between gap-2">
                      <Link href={`/signals/${signal.id}`} className="font-semibold hover:text-accent">
                        {signal.businessName ?? signal.title}
                      </Link>
                      <span className="text-2xs uppercase text-paper-muted">
                        {signal.confidenceLevel} · {signal.urgencyLevel.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p className="text-sm text-paper-dim mt-2">{signal.summary}</p>
                    <p className="text-2xs text-paper-muted mt-2">
                      {signal.sourceName ?? 'Unknown source'} · detected{' '}
                      {new Date(signal.firstDetectedAt).toLocaleString()}
                    </p>
                    {signal.contentRecommendation?.recommendedAction ? (
                      <p className="text-xs mt-2 text-accent/90">{signal.contentRecommendation.recommendedAction}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
