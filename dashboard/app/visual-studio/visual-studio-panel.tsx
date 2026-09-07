'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { clientApiUrl } from '../../lib/client-api';

type CapabilityArm = {
  id: string;
  label: string;
  available: boolean;
  reason?: string;
};

type StatusPayload = {
  ok: boolean;
  enabled: boolean;
  imageGenEnabled: boolean;
  imageGenProvider: string;
  dailyCapUsd: number;
  theme: { id: string; seriesName: string; tagline: string };
  capabilities: Record<string, { available: boolean; reason?: string; model?: string }>;
};

export function VisualStudioPanel() {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [arms, setArms] = useState<CapabilityArm[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statusRes, armsRes] = await Promise.all([
        fetch(clientApiUrl('/api/visual/status'), { cache: 'no-store' }),
        fetch(clientApiUrl('/api/visual/poc/arms'), { cache: 'no-store' }),
      ]);
      if (!statusRes.ok) throw new Error(`Status ${statusRes.status}`);
      if (!armsRes.ok) throw new Error(`Arms ${armsRes.status}`);
      const statusJson = (await statusRes.json()) as StatusPayload;
      const armsJson = (await armsRes.json()) as { arms: CapabilityArm[] };
      setStatus(statusJson);
      setArms(armsJson.arms ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load Visual Studio');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="space-y-6">
      <header className="space-y-3">
        <div className="section-mark">
          <span>// § visual studio</span>
        </div>
        <p className="text-2xs uppercase tracking-wider text-accent">KCKellie production</p>
        <h1 className="text-3xl sm:text-5xl font-bold tracking-tightest cursor lowercase leading-tight">
          visual studio
        </h1>
        <p className="text-sm text-paper-muted max-w-2xl">
          Preview Weekend Drop slides and media kits before approval. Factual text stays
          editable and deterministic. Generated art is optional, capped, and never silently
          published.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href="/weekend-list" className="btn-primary text-xs min-h-[44px] px-3 inline-flex items-center">
            Weekend List
          </Link>
          <Link
            href="/media-kits"
            className="min-h-[44px] text-xs px-3 py-2 border-2 border-paper-ink inline-flex items-center"
          >
            Media kits
          </Link>
          <Link
            href="/creator-assets"
            className="min-h-[44px] text-xs px-3 py-2 border border-paper-edge inline-flex items-center"
          >
            Creator Assets
          </Link>
        </div>
      </header>

      {loading ? <p className="text-sm text-paper-muted italic">Loading studio status…</p> : null}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      {status ? (
        <div className="space-y-4 border border-paper-edge p-4">
          <p className="text-sm">
            <span className="uppercase tracking-wider text-2xs text-paper-muted">Series</span>
            <br />
            <strong>{status.theme.seriesName}</strong>
            <br />
            <span className="text-paper-muted">{status.theme.tagline}</span>
          </p>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-2xs uppercase tracking-wider text-paper-muted">Studio</dt>
              <dd>{status.enabled ? 'enabled' : 'disabled'}</dd>
            </div>
            <div>
              <dt className="text-2xs uppercase tracking-wider text-paper-muted">Image gen</dt>
              <dd>
                {status.imageGenEnabled ? status.imageGenProvider : 'off'} · cap $
                {status.dailyCapUsd}
              </dd>
            </div>
          </dl>
          <div>
            <p className="text-2xs uppercase tracking-wider text-paper-muted mb-2">Provider status</p>
            <ul className="space-y-2 text-sm">
              {Object.entries(status.capabilities).map(([id, cap]) => (
                <li key={id} className="border border-dashed border-paper-edge p-2">
                  <strong>{id}</strong> — {cap.available ? 'available' : 'unavailable'}
                  {cap.model ? ` · ${cap.model}` : ''}
                  {cap.reason ? <span className="block text-paper-muted text-xs mt-1">{cap.reason}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <div className="space-y-3">
        <h2 className="text-lg font-bold lowercase">weekend drop preview</h2>
        <p className="text-sm text-paper-muted">
          Template-only HTML preview from locked weekend facts. No publish, no send.
        </p>
        <div className="flex flex-wrap gap-2">
          <a
            href={clientApiUrl('/api/visual/weekend-drop/preview?role=cover&format=carousel')}
            target="_blank"
            rel="noreferrer"
            className="min-h-[44px] text-xs px-3 py-2 border-2 border-paper-ink inline-flex items-center"
          >
            Open cover preview
          </a>
          <a
            href={clientApiUrl('/api/visual/weekend-drop/preview?role=day&format=carousel')}
            target="_blank"
            rel="noreferrer"
            className="min-h-[44px] text-xs px-3 py-2 border border-paper-edge inline-flex items-center"
          >
            Open daily preview
          </a>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-bold lowercase">approval &amp; export</h2>
        <p className="text-sm text-paper-muted max-w-2xl">
          Draft → preview → approve → export. Nothing public updates, attaches to a pitch, or
          sends without an approved design version. Flyer brief remains available on Weekend List
          as the operator fallback.
        </p>
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div className="border border-paper-edge p-3">
            <dt className="text-2xs uppercase tracking-wider text-paper-muted">Project status</dt>
            <dd>draft (default)</dd>
          </div>
          <div className="border border-paper-edge p-3">
            <dt className="text-2xs uppercase tracking-wider text-paper-muted">Exports</dt>
            <dd>1080×1350 · 1080×1920 · PDF/ZIP via Playwright</dd>
          </div>
          <div className="border border-paper-edge p-3">
            <dt className="text-2xs uppercase tracking-wider text-paper-muted">Safety</dt>
            <dd>no silent publish / email / Telegram</dd>
          </div>
        </dl>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-bold lowercase">four-arm poc readiness</h2>
        <ul className="space-y-2 text-sm">
          {arms.map((arm) => (
            <li key={arm.id} className="border border-paper-edge p-3">
              <strong>{arm.label}</strong>
              <span className="block text-paper-muted text-xs mt-1">
                {arm.available ? 'ready' : `unavailable${arm.reason ? ` — ${arm.reason}` : ''}`}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-paper-muted">
          Paid arms stay capped at USD $2.00 total and require explicit provider selection. Rejected
          art is removable. No automatic failover between paid providers.
        </p>
      </div>
    </section>
  );
}
