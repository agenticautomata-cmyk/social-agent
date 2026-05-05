import { Inbox } from 'lucide-react';
import { api, type ApprovalRow } from '../../lib/api';
import { ApprovalCard } from './approval-card';

export default async function ApprovalsPage() {
  const { items } = await api.get<{ items: ApprovalRow[] }>('/approvals');

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Approvals</h1>
        <p className="text-sm text-zinc-400 mt-1 max-w-2xl">
          Scripts awaiting human review. Reject sends the item back to the planner with feedback;
          script-writer regenerates with the rejection reason in the prompt.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-border bg-bg-card p-12 text-center">
          <div className="h-12 w-12 mx-auto mb-3 rounded-full bg-emerald-500/10 flex items-center justify-center">
            <Inbox className="h-6 w-6 text-emerald-400" strokeWidth={2.25} />
          </div>
          <div className="text-zinc-100 font-medium">Inbox zero.</div>
          <div className="text-sm text-zinc-500 mt-1">No scripts pending approval.</div>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((row) => (
            <ApprovalCard key={row.item.id} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}
