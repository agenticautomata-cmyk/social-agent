'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { clientApiUrl } from '../../../lib/client-api';

type SignalDetail = {
  signal: {
    id: string;
    title: string;
    summary: string;
    businessName: string | null;
    confidenceLevel: string;
    confidenceExplanation: Array<{ factor: string; points: number; detail: string }>;
    urgencyLevel: string;
    urgencyExplanation: Array<{ factor: string; points: number; detail: string }>;
    verificationStatus: string;
    sourceUrl: string | null;
    sourceName: string | null;
    missingVerification: string[];
    contentRecommendation: {
      kind: string;
      suggestedHook: string;
      confirmedFacts: string[];
      needsVerification: string[];
      recommendedAction: string;
      callToAction: string;
      discloseNotVisited: boolean;
    };
    evidence: Array<{
      id: string;
      extractedClaim: string;
      sourceUrl: string | null;
      sourceName: string | null;
      reliabilityScore: number;
    }>;
    linkedOpportunityId: string | null;
  };
  deliveries: Array<{ channel: string; success: boolean; deliveredAt: string; providerResponse: string | null }>;
};

export function SignalDetailPanel({ signalId }: { signalId: string }) {
  const router = useRouter();
  const [data, setData] = useState<SignalDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(() => {
    return fetch(clientApiUrl(`/api/early-signals/${signalId}`), { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json() as Promise<SignalDetail>;
      })
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, [signalId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function act(path: string, body?: object) {
    setBusy(path);
    try {
      const res = await fetch(clientApiUrl(`/api/early-signals/${signalId}${path}`), {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) throw new Error(`${res.status}`);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(null);
    }
  }

  if (error && !data) return <p className="text-sm text-red-300">{error}</p>;
  if (!data) return <p className="text-sm text-paper-muted italic">Loading signal…</p>;

  const s = data.signal;
  const rec = s.contentRecommendation;

  return (
    <div className="space-y-6">
      <div className="glass-panel p-5 space-y-3">
        <div className="flex flex-wrap gap-2 text-2xs uppercase text-paper-muted">
          <span>{s.confidenceLevel} confidence</span>
          <span>·</span>
          <span>{s.urgencyLevel.replace(/_/g, ' ')}</span>
          <span>·</span>
          <span>{s.verificationStatus}</span>
        </div>
        <h1 className="text-xl font-bold">{s.businessName ?? s.title}</h1>
        <p className="text-sm">{s.summary}</p>
        {s.sourceUrl ? (
          <a href={s.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-accent hover:underline">
            Source: {s.sourceName ?? s.sourceUrl}
          </a>
        ) : null}
      </div>

      <section className="glass-panel p-4">
        <h2 className="text-sm font-semibold mb-2">Recommended action</h2>
        <p className="text-sm font-medium">{rec.recommendedAction}</p>
        <p className="text-sm text-paper-dim mt-2">{rec.callToAction}</p>
        <p className="text-xs text-paper-muted mt-2">Hook: {rec.suggestedHook}</p>
        {rec.discloseNotVisited ? (
          <p className="text-2xs text-amber-200 mt-2">Disclose on camera if you have not visited yet.</p>
        ) : null}
      </section>

      <div className="grid md:grid-cols-2 gap-4">
        <section className="glass-panel p-4">
          <h2 className="text-sm font-semibold mb-2">Verified</h2>
          <ul className="text-sm space-y-1">
            {(rec.confirmedFacts.length ? rec.confirmedFacts : ['No confirmed facts yet']).map((f) => (
              <li key={f}>✓ {f}</li>
            ))}
          </ul>
        </section>
        <section className="glass-panel p-4">
          <h2 className="text-sm font-semibold mb-2">Still needs verification</h2>
          <ul className="text-sm space-y-1">
            {(rec.needsVerification.length ? rec.needsVerification : s.missingVerification).map((f) => (
              <li key={f}>? {f}</li>
            ))}
          </ul>
        </section>
      </div>

      <section className="glass-panel p-4">
        <h2 className="text-sm font-semibold mb-2">Why Benson scored it this way</h2>
        <ul className="text-sm space-y-1">
          {[...s.confidenceExplanation, ...s.urgencyExplanation].map((line) => (
            <li key={`${line.factor}-${line.detail}`}>
              <span className="text-paper-dim">{line.factor}</span> (+{line.points}): {line.detail}
            </li>
          ))}
        </ul>
      </section>

      {s.evidence.length > 0 ? (
        <section className="glass-panel p-4">
          <h2 className="text-sm font-semibold mb-2">Evidence</h2>
          <ul className="text-sm space-y-2">
            {s.evidence.map((e) => (
              <li key={e.id}>
                <div>{e.extractedClaim}</div>
                {e.sourceUrl ? (
                  <a href={e.sourceUrl} className="text-2xs text-accent" target="_blank" rel="noreferrer">
                    {e.sourceName ?? e.sourceUrl}
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary text-xs" disabled={!!busy} onClick={() => void act('/approve')}>
          Approve as opportunity
        </button>
        <button type="button" className="btn-ghost text-xs" disabled={!!busy} onClick={() => void act('/verify')}>
          Mark verified
        </button>
        <button type="button" className="btn-ghost text-xs" disabled={!!busy} onClick={() => void act('/dismiss')}>
          Dismiss
        </button>
        <button type="button" className="btn-ghost text-xs" disabled={!!busy} onClick={() => void act('/snooze', { hours: 48 })}>
          Snooze 48h
        </button>
        <button type="button" className="btn-ghost text-xs" disabled={!!busy} onClick={() => void act('/test-alert')}>
          Test alert
        </button>
        {s.linkedOpportunityId ? (
          <Link href={`/review/inventory?id=${s.linkedOpportunityId}`} className="btn-ghost text-xs">
            View opportunity
          </Link>
        ) : null}
      </div>

      {data.deliveries.length > 0 ? (
        <section className="glass-panel p-4">
          <h2 className="text-sm font-semibold mb-2">Alert deliveries</h2>
          <ul className="text-2xs space-y-1 text-paper-dim">
            {data.deliveries.map((d, i) => (
              <li key={`${d.channel}-${i}`}>
                {d.channel} · {d.success ? 'sent' : 'failed'} · {new Date(d.deliveredAt).toLocaleString()}
                {d.providerResponse ? ` · ${d.providerResponse}` : ''}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      <button type="button" className="btn-ghost text-xs" onClick={() => router.push('/signals')}>
        ← Back to Early Signals
      </button>
    </div>
  );
}
