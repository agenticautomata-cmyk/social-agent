import { api, type ApprovalRow } from '../../lib/api';
import { ApprovalCard } from './approval-card';

export default async function ApprovalsPage() {
  const { items } = await api.get<{ items: ApprovalRow[] }>('/approvals');

  return (
    <div className="space-y-12">
      <section>
        <div className="section-mark mb-3"><span>// §1 approvals</span></div>
        <h1 className="text-5xl font-bold tracking-tightest cursor lowercase">approvals</h1>
        <p className="text-paper-muted mt-2 italic">
          // scripts awaiting human review. reject sends back to planner with feedback;
          <br />
          script-writer regenerates with the rejection reason in the prompt.
        </p>
      </section>

      {items.length === 0 ? (
        <div className="border-2 border-paper-ink py-16 text-center">
          <div className="text-3xl font-bold text-accent">// inbox empty</div>
          <div className="text-paper-muted mt-2 italic">no scripts pending approval.</div>
        </div>
      ) : (
        <section className="space-y-0">
          {items.map((row, idx) => (
            <ApprovalCard key={row.item.id} row={row} idx={idx} />
          ))}
        </section>
      )}
    </div>
  );
}
