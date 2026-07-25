'use client';

import { useCallback, useEffect, useState } from 'react';
import { clientApiUrl } from '../lib/client-api';

type Health = {
  serviceStatus: string;
  modelStatus: string;
  queueStatus: string;
  activeEngine: string | null;
  currentQueueDepth: number;
  averageGenerationMs: number | null;
  lastSuccessfulGeneration: string | null;
  lastFailedGeneration: string | null;
  storageBytes: number;
  sanitizedLatestError: string | null;
  generationPaused: boolean;
};

export function VoiceServiceAdminPanel() {
  const [health, setHealth] = useState<Health | null>(null);
  const [pin, setPin] = useState<Record<string, string> | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch(clientApiUrl('/api/voice/admin/health'));
    const json = (await res.json()) as { health?: Health; pin?: Record<string, string> };
    setHealth(json.health ?? null);
    setPin(json.pin ?? null);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function post(path: string, body?: unknown) {
    setBusy(true);
    try {
      const res = await fetch(clientApiUrl(path), {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = (await res.json()) as Record<string, unknown>;
      if (path.includes('test-phrase')) {
        setTestResult(
          json.ok
            ? `Test ok in ${json.durationMs}ms`
            : `Test failed: ${String(json.error ?? 'unknown')}`,
        );
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!health) return <p className="text-sm text-paper-soft">Loading voice service…</p>;

  return (
    <div className="glass-panel-strong p-6 space-y-4 max-w-3xl">
      <h1 className="text-lg font-semibold">Voice Service</h1>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-paper-muted">Service</dt>
          <dd>{health.serviceStatus}</dd>
        </div>
        <div>
          <dt className="text-paper-muted">Model</dt>
          <dd>{health.modelStatus}</dd>
        </div>
        <div>
          <dt className="text-paper-muted">Engine</dt>
          <dd>{health.activeEngine ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-paper-muted">Queue depth</dt>
          <dd>{health.currentQueueDepth}</dd>
        </div>
        <div>
          <dt className="text-paper-muted">Avg generation</dt>
          <dd>{health.averageGenerationMs != null ? `${health.averageGenerationMs} ms` : '—'}</dd>
        </div>
        <div>
          <dt className="text-paper-muted">Storage</dt>
          <dd>{Math.round(health.storageBytes / 1024)} KB</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-paper-muted">Voicebox pin</dt>
          <dd>
            {pin?.upstreamTag} @ {pin?.upstreamCommit?.slice(0, 12)}
          </dd>
        </div>
        {health.sanitizedLatestError && (
          <div className="sm:col-span-2">
            <dt className="text-paper-muted">Latest error</dt>
            <dd>{health.sanitizedLatestError}</dd>
          </div>
        )}
      </dl>

      {testResult && <p className="text-xs text-paper-soft">{testResult}</p>}

      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} className="btn-secondary text-sm" onClick={() => void post('/api/voice/admin/health-check')}>
          Health check
        </button>
        <button type="button" disabled={busy} className="btn-secondary text-sm" onClick={() => void post('/api/voice/admin/prewarm')}>
          Prewarm model
        </button>
        <button
          type="button"
          disabled={busy}
          className="btn-secondary text-sm"
          onClick={() => void post('/api/voice/admin/test-phrase', { phrase: 'Your calendar is clear Saturday afternoon.' })}
        >
          Test phrase
        </button>
        <button type="button" disabled={busy} className="btn-secondary text-sm" onClick={() => void post('/api/voice/admin/clear-failed')}>
          Clear failed jobs
        </button>
        <button type="button" disabled={busy} className="btn-secondary text-sm" onClick={() => void post('/api/voice/admin/cleanup')}>
          Audio cleanup
        </button>
        {health.generationPaused ? (
          <button type="button" disabled={busy} className="btn-secondary text-sm" onClick={() => void post('/api/voice/admin/resume')}>
            Resume generation
          </button>
        ) : (
          <button type="button" disabled={busy} className="btn-secondary text-sm" onClick={() => void post('/api/voice/admin/pause')}>
            Pause generation
          </button>
        )}
      </div>
    </div>
  );
}
