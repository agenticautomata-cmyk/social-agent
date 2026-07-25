'use client';

import Link from 'next/link';

type AiSpendProps = {
  todayCostUsd: number;
  dailyAverageUsd: number;
  budgetUsd: number | null;
  budgetExceeded: boolean;
  breakdown: Array<{ source: string; runs: number; costUsd: number }>;
};

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

export function AiSpendCard({ spend }: { spend: AiSpendProps }) {
  return (
    <section
      className={`glass-panel p-4 ${spend.budgetExceeded ? 'border border-amber-400/30' : ''}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">AI spend today</h2>
          <p className="text-2xs text-paper-muted mt-1">
            7-day avg {formatUsd(spend.dailyAverageUsd)}
            {spend.budgetUsd != null ? ` · budget ${formatUsd(spend.budgetUsd)}/day` : ''}
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold tabular-nums">{formatUsd(spend.todayCostUsd)}</div>
          {spend.budgetExceeded ? (
            <p className="text-2xs text-amber-300 mt-1">Budget exceeded — background LLM throttled</p>
          ) : null}
        </div>
      </div>
      {spend.breakdown.length > 0 ? (
        <ul className="mt-3 space-y-1 text-sm">
          {spend.breakdown.map((row) => (
            <li key={row.source} className="flex justify-between gap-3 text-paper-dim">
              <span>{row.source.replace(/_/g, ' ')}</span>
              <span className="tabular-nums">{formatUsd(row.costUsd)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <Link href="/admin/control-tower" className="btn-ghost text-xs py-2 min-h-[36px] px-3 mt-3 inline-flex">
        Control Tower
      </Link>
    </section>
  );
}
