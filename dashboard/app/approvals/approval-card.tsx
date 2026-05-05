'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { ApprovalRow } from '../../lib/api';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function ApprovalCard({ row }: { row: ApprovalRow }) {
  const router = useRouter();
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [reason, setReason] = useState('');
  const [showReject, setShowReject] = useState(false);

  async function approve() {
    setBusy('approve');
    try {
      await fetch(`${API}/api/approvals/${row.item.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvedBy: 'dashboard-user' }),
      });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function reject() {
    if (reason.length < 2) return;
    setBusy('reject');
    try {
      await fetch(`${API}/api/approvals/${row.item.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, rejectedBy: 'dashboard-user' }),
      });
      setShowReject(false);
      setReason('');
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-bg-card p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 text-xs text-zinc-500 mb-1">
            <span className="font-mono">{row.item.type}</span>
            <span>·</span>
            <span>{row.industryName ?? '—'}</span>
            <span>·</span>
            <span className="uppercase">{row.item.language}</span>
            {row.personaName && (
              <>
                <span>·</span>
                <span>{row.personaName}</span>
              </>
            )}
          </div>
          <h3 className="text-lg font-semibold">{row.item.topic}</h3>
        </div>
        <div className="text-xs font-mono text-zinc-500">
          {new Date(row.item.createdAt).toLocaleString()}
        </div>
      </div>

      <div className="space-y-3 mb-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-zinc-500 mb-1">Hook</div>
          <div className="text-zinc-200">{row.item.hook}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-zinc-500 mb-1">Script</div>
          <pre className="text-sm whitespace-pre-wrap text-zinc-300 bg-bg-subtle p-3 rounded font-sans">
            {row.item.script}
          </pre>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-zinc-500 mb-1">CTA</div>
          <div className="text-zinc-300">{row.item.cta}</div>
        </div>
      </div>

      {showReject ? (
        <div className="space-y-2">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why reject? (passed back to script-writer for regeneration)"
            rows={3}
            className="w-full rounded-md bg-bg-subtle border border-border p-2 text-sm placeholder:text-zinc-600 focus:outline-none focus:border-accent"
          />
          <div className="flex gap-2">
            <button
              onClick={reject}
              disabled={reason.length < 2 || busy !== null}
              className="px-3 py-1.5 text-sm rounded-md bg-rose-900/40 text-rose-300 hover:bg-rose-900/60 disabled:opacity-50"
            >
              {busy === 'reject' ? 'Rejecting…' : 'Confirm reject'}
            </button>
            <button
              onClick={() => { setShowReject(false); setReason(''); }}
              className="px-3 py-1.5 text-sm rounded-md text-zinc-400 hover:text-zinc-200"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={approve}
            disabled={busy !== null}
            className="px-4 py-1.5 text-sm rounded-md bg-emerald-900/40 text-emerald-300 hover:bg-emerald-900/60 disabled:opacity-50"
          >
            {busy === 'approve' ? 'Approving…' : '✓ Approve'}
          </button>
          <button
            onClick={() => setShowReject(true)}
            disabled={busy !== null}
            className="px-4 py-1.5 text-sm rounded-md bg-bg-subtle text-zinc-400 hover:text-rose-300 hover:bg-rose-900/20 disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      )}
    </div>
  );
}
