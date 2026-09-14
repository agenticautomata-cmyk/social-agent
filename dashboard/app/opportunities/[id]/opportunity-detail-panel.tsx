'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { clientApiUrl } from '../../../lib/client-api';
import { useActionToast } from '../../../components/action-toast';
import {
  OpportunityResearchDossierPanel,
  type OpportunityDossier,
} from '../../../components/opportunity-research-dossier';

type ResearchView = {
  contentItemId: string;
  topic: string | null;
  dossier: OpportunityDossier | null;
  gate: {
    ready: boolean;
    offerResearchFirst?: boolean;
    message: string;
  };
};

export function OpportunityDetailPanel({ contentItemId }: { contentItemId: string }) {
  const [view, setView] = useState<ResearchView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { showToast } = useActionToast();

  const reload = useCallback(async () => {
    const res = await fetch(clientApiUrl(`/api/opportunity-research/${contentItemId}`), {
      cache: 'no-store',
    });
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json.error ?? `Failed (${res.status})`);
    setView(json as ResearchView);
  }, [contentItemId]);

  useEffect(() => {
    void reload().catch((err) => setError(err instanceof Error ? err.message : 'Load failed'));
    const timer = window.setInterval(() => {
      if (view?.dossier?.status === 'running' || view?.dossier?.status === 'queued') {
        void reload().catch(() => null);
      }
    }, 4000);
    return () => window.clearInterval(timer);
  }, [reload, view?.dossier?.status]);

  async function researchThis() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(clientApiUrl(`/api/opportunity-research/${contentItemId}/research`), {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? 'Research failed');
      showToast({
        title: 'Research started',
        nextStep: json.nextStep ?? 'Building source-backed dossier…',
      });
      if (json.dossier) {
        setView((prev) =>
          prev
            ? { ...prev, dossier: json.dossier }
            : {
                contentItemId,
                topic: null,
                dossier: json.dossier,
                gate: { ready: false, offerResearchFirst: true, message: 'Research running' },
              },
        );
      }
      await reload();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Research failed';
      setError(message);
      showToast({ title: "That didn't go through", nextStep: message, tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  if (!view && !error) {
    return <p className="text-sm text-paper-muted">Loading opportunity…</p>;
  }

  return (
    <div className="space-y-6">
      <Link href="/opportunities" className="btn-ghost text-xs inline-flex">
        ← Opportunities
      </Link>

      <header className="space-y-2">
        <p className="text-2xs uppercase tracking-wider text-paper-muted">opportunity · research</p>
        <h1 className="text-2xl font-bold break-words">{view?.topic ?? 'Opportunity'}</h1>
      </header>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void researchThis()}
          className="btn-primary text-xs min-h-[40px] px-4"
        >
          {busy ? 'Working…' : 'Research this'}
        </button>
        {view?.gate?.ready ? (
          <Link
            href={`/discoveries/${contentItemId}/contact`}
            className="btn-ghost text-xs min-h-[40px] px-3 inline-flex items-center"
          >
            Contact business
          </Link>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => void researchThis()}
            className="btn-ghost text-xs min-h-[40px] px-3"
          >
            Research first
          </button>
        )}
        <Link
          href={`/discoveries/${contentItemId}`}
          className="btn-ghost text-xs min-h-[40px] px-3 inline-flex items-center"
        >
          Open discovery workspace
        </Link>
      </div>

      {view?.gate && !view.gate.ready ? (
        <p className="text-xs text-paper-muted">{view.gate.message}</p>
      ) : null}

      <OpportunityResearchDossierPanel
        dossier={view?.dossier}
        busy={busy || view?.dossier?.status === 'running' || view?.dossier?.status === 'queued'}
      />
    </div>
  );
}
