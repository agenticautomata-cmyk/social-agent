'use client';

import { useCallback, useEffect, useState } from 'react';
import { clientApiUrl } from '../../../lib/client-api';

type WorkerRow = {
  workerId: string;
  displayName: string;
  scheduleLabel: string;
  status: string;
  lastSuccessAt: string | null;
  lastErrorSummary: string | null;
  consecutiveFailures: number;
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
};

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

export function ControlTowerPanel({ adminKey }: { adminKey?: string }) {
  const [data, setData] = useState<TowerSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const headers = adminKey ? { 'x-benson-admin-key': adminKey } : undefined;

  const reload = useCallback(() => {
    return fetch(clientApiUrl('/api/control-tower/summary'), { cache: 'no-store', headers })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
        return res.json() as Promise<TowerSummary>;
      })
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, [adminKey]);

  useEffect(() => {
    void reload();
    const t = setInterval(() => void reload(), 30_000);
    return () => clearInterval(t);
  }, [reload]);

  if (error) return <p className="text-sm text-red-300">{error}</p>;
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
              ROI throttle: {data.spend.roiThrottle.reason} — queries {data.spend.roiThrottle.discoveryQueryCount}, scoring limit {data.spend.roiThrottle.scoringBatchLimit}
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="glass-panel p-4">
        <h2 className="text-sm font-semibold mb-3">Workers ({data.workers.length})</h2>
        <div className="space-y-2">
          {data.workers.map((w) => (
            <div key={w.workerId} className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-2 text-sm">
              <div>
                <div className="font-medium">{w.displayName}</div>
                <div className="text-2xs text-paper-dim">{w.scheduleLabel}</div>
              </div>
              <div className="text-right">
                <div className="capitalize">{w.status}</div>
                {w.lastErrorSummary ? <div className="text-2xs text-red-300 max-w-xs truncate">{w.lastErrorSummary}</div> : null}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid md:grid-cols-2 gap-4">
        <div className="glass-panel p-4">
          <h2 className="text-sm font-semibold mb-2">Dependencies</h2>
          <ul className="text-sm space-y-1">
            {data.dependencies.map((d) => (
              <li key={d.id} className="flex justify-between gap-2">
                <span>{d.label}</span>
                <span className="text-paper-dim capitalize">{d.status}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="glass-panel p-4">
          <h2 className="text-sm font-semibold mb-2">System</h2>
          <ul className="text-sm space-y-1 text-paper-dim">
            <li>Uptime: {Math.round(data.system.uptimeSeconds / 60)}m</li>
            <li>Processes: {data.system.processCount}</li>
            <li>Memory: {data.system.freeMemMb}MB free / {data.system.totalMemMb}MB</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
