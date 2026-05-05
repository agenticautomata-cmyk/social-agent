import { api, type ApprovalRow } from '../../lib/api';
import { ApprovalCard } from './approval-card';

export default async function ApprovalsPage() {
  const { items } = await api.get<{ items: ApprovalRow[] }>('/approvals');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Approvals</h1>
        <p className="text-sm text-zinc-400">
          Scripts awaiting human review. Reject sends the item back to the planner with feedback;
          script-writer regenerates with the rejection reason in the prompt.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-border bg-bg-card p-10 text-center">
          <div className="text-zinc-300 font-medium">Inbox zero.</div>
          <div className="text-sm text-zinc-500 mt-1">No scripts pending approval.</div>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((row) => (
            <ApprovalCard key={row.item.id} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}
