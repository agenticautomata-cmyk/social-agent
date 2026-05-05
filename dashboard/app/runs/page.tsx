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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Workflow runs</h1>
        <p className="text-sm text-zinc-400">Audit log: every state transition by every worker.</p>
      </div>

      <div className="rounded-lg border border-border bg-bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wide text-zinc-500 bg-bg-subtle">
            <tr>
              <th className="text-left px-4 py-3">Time</th>
              <th className="text-left px-4 py-3">Worker</th>
              <th className="text-left px-4 py-3">Transition</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-right px-4 py-3">Duration</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className="border-t border-border hover:bg-bg-subtle">
                <td className="px-4 py-3 font-mono text-xs text-zinc-400">
                  {new Date(r.startedAt).toLocaleString()}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-zinc-300">{r.workflowName}</td>
                <td className="px-4 py-3 font-mono text-xs">
                  <span className="text-zinc-500">{r.stateFrom ?? '—'}</span>
                  <span className="mx-1 text-zinc-600">→</span>
                  <span className="text-zinc-300">{r.stateTo ?? '—'}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-mono px-2 py-0.5 rounded ${
                    r.status === 'success' ? 'bg-emerald-900/40 text-emerald-300' :
                    r.status === 'failed' ? 'bg-rose-900/40 text-rose-300' :
                    'bg-amber-900/40 text-amber-300'
                  }`}>
                    {r.status}
                  </span>
                  {r.error && <div className="text-xs text-rose-400 mt-1 line-clamp-1">{r.error}</div>}
                </td>
                <td className="px-4 py-3 text-right font-mono text-xs text-zinc-500">
                  {r.durationMs ? `${r.durationMs}ms` : '—'}
                </td>
              </tr>
            ))}
            {runs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-zinc-500">
                  No runs yet — start the workers and trigger the planner.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
