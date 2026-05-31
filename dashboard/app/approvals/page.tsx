import { api, type ApprovalRow } from '../../lib/api';
import { getApprovalCardLabels, getTerminology } from '../../lib/terminology';
import { ApprovalCard } from './approval-card';

export default async function ApprovalsPage() {
  const { items } = await api.get<{ items: ApprovalRow[] }>('/approvals');
  const t = getTerminology();
  const labels = getApprovalCardLabels();
  const subtitleLines = t.pages.approvals.subtitle.split('\n');

  return (
    <div className="space-y-12">
      <section>
        <div className="section-mark mb-3"><span>// §1 approvals</span></div>
        <h1 className="text-5xl font-bold tracking-tightest cursor lowercase">approvals</h1>
        <p className="text-paper-muted mt-2 italic">
          {subtitleLines.map((line, i) => (
            <span key={line}>
              {i > 0 && <br />}
              {line}
            </span>
          ))}
        </p>
      </section>

      {items.length === 0 ? (
        <div className="border-2 border-paper-ink py-16 text-center">
          <div className="text-3xl font-bold text-accent">// inbox empty</div>
          <div className="text-paper-muted mt-2 italic">{t.pages.approvals.emptyInbox}</div>
        </div>
      ) : (
        <section className="space-y-0">
          {items.map((row, idx) => (
            <ApprovalCard key={row.item.id} row={row} idx={idx} labels={labels} />
          ))}
        </section>
      )}
    </div>
  );
}
