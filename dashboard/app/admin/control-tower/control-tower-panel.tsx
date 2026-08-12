'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { clientApiUrl, parseApiJsonResponse } from '../../../lib/client-api';

type WorkerRow = {
  workerId: string;
  displayName: string;
  scheduleLabel: string;
  status: string;
  lastSuccessAt: string | null;
  lastStartedAt?: string | null;
  lastErrorSummary: string | null;
  consecutiveFailures: number;
  expectedIntervalMs?: number | null;
};

type DeploymentParity = {
  status: 'MATCH' | 'DRIFT' | 'UNKNOWN';
  sourceFingerprint: string | null;
  apiFingerprint: string | null;
  dashboardFingerprint: string | null;
  workerFingerprint: string | null;
  apiStartedAt: string | null;
  dashboardBuiltAt: string | null;
  workerStartedAt: string | null;
  message: string;
};

type SpendSummary = {
  periodDays: number;
  totalCostUsd: number;
  dailyAverageUsd: number;
  todayCostUsd: number;
  budgetUsd: number | null;
  budgetExceeded: boolean;
  breakdown: Array<{ source: string; runs: number; costUsd: number }>;
  roiThrottle: {
    active: boolean;
    discoveryQueryCount: number;
    scoringBatchLimit: number;
    reason: string | null;
  };
};

type TowerSummary = {
  overall: string;
  alerts: string[];
  workers: WorkerRow[];
  failedJobs: Array<{ id: string; workerId: string; errorSummary: string | null; startedAt: string }>;
  dependencies: Array<{ id: string; label: string; status: string; detail: string }>;
  system: { uptimeSeconds: number; processCount: number; freeMemMb: number; totalMemMb: number };
  spend?: SpendSummary;
  deploymentParity?: DeploymentParity;
  gmailReconnectHref?: string;
  oauthWarnings?: string[];
  gmailIngestionWarning?: string | null;
};

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

export function ControlTowerPanel() {
  const [data, setData] = useState<TowerSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const reload = useCallback(() => {
    return fetch(clientApiUrl('/api/control-tower/summary'), { cache: 'no-store' })
      .then(async (res) => {
        const parsed = await parseApiJsonResponse<TowerSummary>(res);
        if (!parsed.ok) {
          if (parsed.status === 401 || parsed.status === 403) {
            setForbidden(true);
            throw new Error('Admin access required');
          }
          throw new Error(parsed.error);
        }
        setForbidden(false);
        return parsed.data;
      })
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, []);

  useEffect(() => {
    void reload();
    const t = setInterval(() => void reload(), 30_000);
    return () => clearInterval(t);
  }, [reload]);

  if (forbidden) {
    return (
      <div className="glass-panel p-6 space-y-2">
        <h2 className="text-lg font-bold">Admin access required</h2>
        <p className="text-sm text-paper-dim">
          Control Tower is limited to authorized operators. Normal Kellie navigation still works without this page.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-panel p-6 space-y-2">
        <h2 className="text-lg font-bold">Control Tower unavailable</h2>
        <p className="text-sm text-paper-dim">{error}</p>
      </div>
    );
  }
  if (!data) return <p className="text-sm text-paper-muted italic">Loading control tower…</p>;

  return (
    <div className="space-y-6">
      <div className={`glass-panel p-4 ${data.overall === 'healthy' ? '' : 'border border-amber-400/30'}`}>
        <div className="text-2xs uppercase text-paper-muted">Overall</div>
        <div className="text-2xl font-bold capitalize">{data.overall}</div>
        {data.alerts.length > 0 ? (
          <ul className="mt-3 text-sm text-amber-200 space-y-1">
            {data.alerts.slice(0, 6).map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        ) : null}
        {data.gmailIngestionWarning ? (
          <p className="mt-3 text-sm text-amber-100 border border-amber-400/30 rounded-lg px-3 py-2">
            {data.gmailIngestionWarning}
          </p>
        ) : null}
      </div>

      {data.spend ? (
        <section className={`glass-panel p-4 ${data.spend.budgetExceeded ? 'border border-amber-400/30' : ''}`}>
          <h2 className="text-sm font-semibold mb-3">OpenAI spend ({data.spend.periodDays}d)</h2>
          <div className="grid sm:grid-cols-3 gap-3 text-sm mb-4">
            <div>
              <div className="text-2xs text-paper-muted">Today</div>
              <div className="text-xl font-bold tabular-nums">{formatUsd(data.spend.todayCostUsd)}</div>
            </div>
            <div>
              <div className="text-2xs text-paper-muted">Daily avg</div>
              <div className="text-xl font-bold tabular-nums">{formatUsd(data.spend.dailyAverageUsd)}</div>
            </div>
            <div>
              <div className="text-2xs text-paper-muted">Period total</div>
              <div className="text-xl font-bold tabular-nums">{formatUsd(data.spend.totalCostUsd)}</div>
            </div>
          </div>
          {data.spend.budgetUsd != null ? (
            <p className="text-2xs text-paper-dim mb-3">
              Daily budget {formatUsd(data.spend.budgetUsd)}
              {data.spend.budgetExceeded ? ' — exceeded, background LLM throttled' : ''}
            </p>
          ) : null}
          <ul className="space-y-1 text-sm">
            {data.spend.breakdown.slice(0, 8).map((row) => (
              <li key={row.source} className="flex justify-between gap-3">
                <span className="text-paper-dim">{row.source.replace(/_/g, ' ')}</span>
                <span className="tabular-nums">
                  {formatUsd(row.costUsd)} <span className="text-2xs text-paper-muted">({row.runs})</span>
                </span>
              </li>
            ))}
          </ul>
          {data.spend.roiThrottle.active ? (
            <p className="text-2xs text-amber-200 mt-3">
              ROI throttle: {data.spend.roiThrottle.reason} — queries {data.spend.roiThrottle.discoveryQueryCount}, scoring
              limit {data.spend.roiThrottle.scoringBatchLimit}
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="glass-panel p-4">
        <h2 className="text-sm font-semibold mb-3">Workers</h2>
        <ul className="space-y-2 text-sm">
          {data.workers.map((w) => (
            <li key={w.workerId} className="flex flex-wrap justify-between gap-2 border-b border-paper-edge/40 pb-2">
              <div>
                <div className="font-medium">{w.displayName}</div>
                <div className="text-2xs text-paper-muted">
                  {w.scheduleLabel} · {w.status}
                </div>
              </div>
              <div className="text-2xs text-paper-dim text-right">
                {w.lastStartedAt ? `started ${new Date(w.lastStartedAt).toLocaleString()}` : 'no start recorded'}
                {w.lastSuccessAt ? ` · ok ${new Date(w.lastSuccessAt).toLocaleString()}` : ' · no success yet'}
                {w.lastErrorSummary ? <div className="text-amber-200">{w.lastErrorSummary}</div> : null}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="glass-panel p-4">
        <h2 className="text-sm font-semibold mb-3">Deployment parity</h2>
        {data.deploymentParity ? (
          <div className="space-y-2 text-sm">
            <div className="font-bold">
              {data.deploymentParity.status}
              {data.deploymentParity.status === 'DRIFT' ? ' — Source changes are not deployed.' : ''}
            </div>
            <p className="text-2xs text-paper-muted">{data.deploymentParity.message}</p>
            <ul className="text-2xs text-paper-dim space-y-1 font-mono">
              <li>source: {data.deploymentParity.sourceFingerprint ?? '—'}</li>
              <li>api: {data.deploymentParity.apiFingerprint ?? '—'} · started {data.deploymentParity.apiStartedAt ?? '—'}</li>
              <li>workers: {data.deploymentParity.workerFingerprint ?? '—'} · started {data.deploymentParity.workerStartedAt ?? '—'}</li>
              <li>dashboard: {data.deploymentParity.dashboardFingerprint ?? '—'} · built {data.deploymentParity.dashboardBuiltAt ?? '—'}</li>
            </ul>
            {data.deploymentParity.status === 'DRIFT' ? (
              <p className="text-2xs text-amber-200">Run <code>pnpm benson:deploy-local</code> to rebuild and restart.</p>
            ) : null}
          </div>
        ) : (
          <p className="text-2xs text-paper-muted">Parity not available yet.</p>
        )}
      </section>

      <section className="glass-panel p-4">
        <h2 className="text-sm font-semibold mb-3">Dependencies</h2>
        <ul className="space-y-2 text-sm">
          {data.dependencies.map((d) => (
            <li key={d.id} className="flex flex-wrap justify-between gap-3">
              <span>{d.label}</span>
              <span className="text-2xs text-paper-muted">
                {d.status}: {d.detail}
              </span>
              {d.id === 'gmail' && d.status !== 'healthy' ? (
                <Link
                  href={data.gmailReconnectHref ?? '/email/settings'}
                  className="text-2xs text-accent underline w-full"
                >
                  Reconnect Gmail → /email/settings
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
        {data.oauthWarnings && data.oauthWarnings.length > 0 ? (
          <ul className="mt-3 text-2xs text-amber-200 space-y-1">
            {data.oauthWarnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
