import { api } from '../../lib/api';
import { displayState, getTerminology } from '../../lib/terminology';

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
  const t = getTerminology();

  return (
    <div className="space-y-12">
      <section>
        <div className="section-mark mb-3"><span>// §1 runs</span></div>
        <h1 className="text-5xl font-bold tracking-tightest cursor lowercase">runs</h1>
        <p className="text-paper-muted mt-2 italic">{t.pages.runs.subtitle}</p>
      </section>

      {runs.length === 0 ? (
        <div className="border-2 border-paper-ink py-16 text-center text-paper-muted">
          {t.pages.runs.empty}
        </div>
      ) : (
        <section className="border-t-2 border-b-2 border-paper-ink">
          <div className="text-2xs uppercase tracking-wider text-paper-muted grid grid-cols-[10rem_8rem_1fr_6rem_5rem] gap-4 py-2">
            <span>time</span>
            <span>worker</span>
            <span>transition</span>
            <span>status</span>
            <span className="text-right">duration</span>
          </div>
          <div className="border-t border-paper-ink">
            {runs.map((r) => (
              <RunLine key={r.id} run={r} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function RunLine({ run }: { run: Run }) {
  const isOk = run.status === 'success';
  const isFail = run.status === 'failed';
  const tone = isOk ? 'text-accent' : isFail ? 'text-signal-alert' : 'text-signal-warn';
  const symbol = isOk ? '✓' : isFail ? '✗' : '∘';
  const stateFrom = run.stateFrom ? displayState(run.stateFrom) : '∅';
  const stateTo = run.stateTo ? displayState(run.stateTo) : '∅';

  return (
    <div className="grid grid-cols-[10rem_8rem_1fr_6rem_5rem] gap-4 py-1.5 text-sm border-t border-paper-edge first:border-t-0 hover:bg-paper-tint">
      <span className="text-2xs text-paper-muted tabular-nums">
        {new Date(run.startedAt).toLocaleString()}
      </span>
      <span className="text-paper-soft text-xs">{run.workflowName}</span>
      <span className="text-xs">
        <span className="text-paper-muted">{stateFrom}</span>
        <span className="text-paper-muted mx-2">→</span>
        <span className={tone}>{stateTo}</span>
      </span>
      <span className={`text-xs font-bold ${tone}`}>{symbol} {run.status}</span>
      <span className="text-xs text-right text-paper-muted tabular-nums">
        {run.durationMs ? `${run.durationMs}ms` : '—'}
      </span>
      {run.error && (
        <div className="col-span-5 text-2xs text-signal-alert pl-6 italic">└─ {run.error}</div>
      )}
    </div>
  );
}
