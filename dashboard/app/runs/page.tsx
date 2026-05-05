import { CheckCircle2, XCircle, Loader2, History } from 'lucide-react';
import { api } from '../../lib/api';

interface Run {
  id: string;
  contentItemId: string | null;
  workflowName: string;
  stateFrom: string | null;
  stateTo: string | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  status: string;
  error: string | null;
}

export default async function RunsPage() {
  const { runs } = await api.get<{ runs: Run[] }>('/runs?limit=200');

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Workflow runs</h1>
        <p className="text-sm text-zinc-400 mt-1">Audit log: every state transition by every worker.</p>
      </div>

      <div className="rounded-xl border border-border bg-bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-zinc-500 bg-bg-subtle/50">
            <tr>
              <th className="text-left px-5 py-3 font-medium">Time</th>
              <th className="text-left px-5 py-3 font-medium">Worker</th>
              <th className="text-left px-5 py-3 font-medium">Transition</th>
              <th className="text-left px-5 py-3 font-medium">Status</th>
              <th className="text-right px-5 py-3 font-medium">Duration</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className="border-t border-border hover:bg-bg-subtle/40 transition">
                <td className="px-5 py-3 font-mono text-xs text-zinc-400 tabular-nums">
                  {new Date(r.startedAt).toLocaleString()}
                </td>
                <td className="px-5 py-3 font-mono text-xs text-zinc-300">{r.workflowName}</td>
                <td className="px-5 py-3 font-mono text-xs">
                  <span className="text-zinc-500">{r.stateFrom ?? '—'}</span>
                  <span className="mx-1.5 text-zinc-600">→</span>
                  <span className="text-zinc-200">{r.stateTo ?? '—'}</span>
                </td>
                <td className="px-5 py-3">
                  <StatusBadge status={r.status} error={r.error} />
                </td>
                <td className="px-5 py-3 text-right font-mono text-xs text-zinc-500 tabular-nums">
                  {r.durationMs ? `${r.durationMs}ms` : '—'}
                </td>
              </tr>
            ))}
            {runs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-16 text-center text-zinc-500">
                  <History className="h-6 w-6 mx-auto mb-2 text-zinc-700" />
                  <p>No runs yet — start the workers and trigger the planner.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBadge({ status, error }: { status: string; error: string | null }) {
  if (status === 'success') {
    return (
      <div>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20">
          <CheckCircle2 className="h-3 w-3" strokeWidth={2.25} />
          success
        </span>
      </div>
    );
  }
  if (status === 'failed') {
    return (
      <div>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-mono px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 ring-1 ring-rose-500/20">
          <XCircle className="h-3 w-3" strokeWidth={2.25} />
          failed
        </span>
        {error && <div className="text-[11px] text-rose-400/70 mt-1 line-clamp-1 font-mono">{error}</div>}
      </div>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20">
      <Loader2 className="h-3 w-3 animate-spin" />
      {status}
    </span>
  );
}
