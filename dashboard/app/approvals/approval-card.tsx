'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Check, X, Loader2, MessageSquare } from 'lucide-react';
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
    <div className="rounded-xl border border-border bg-bg-card p-6 hover:border-border-subtle transition">
      <div className="flex items-start justify-between mb-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono">
            <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">{row.item.type}</span>
            <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">{row.industryName ?? '—'}</span>
            <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 uppercase">{row.item.language}</span>
            {row.personaName && (
              <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">{row.personaName}</span>
            )}
          </div>
          <h3 className="text-lg font-semibold tracking-tight">{row.item.topic}</h3>
        </div>
        <div className="text-[11px] font-mono text-zinc-500 tabular-nums whitespace-nowrap">
          {new Date(row.item.createdAt).toLocaleString()}
        </div>
      </div>

      <div className="space-y-4 mb-5">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1.5">Hook</div>
          <div className="text-zinc-200">{row.item.hook}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1.5">Script</div>
          <pre className="text-sm whitespace-pre-wrap text-zinc-300 bg-bg-subtle border border-border rounded-lg p-3.5 font-sans leading-relaxed">
            {row.item.script}
          </pre>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1.5">CTA</div>
          <div className="text-zinc-200">{row.item.cta}</div>
        </div>
      </div>

      {showReject ? (
        <div className="space-y-3 border-t border-border pt-4">
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1.5 inline-flex items-center gap-1.5">
              <MessageSquare className="h-3 w-3" />
              Rejection reason
            </span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why reject? (sent back to script-writer for regeneration)"
              rows={3}
              className="mt-1 w-full rounded-lg bg-bg-subtle border border-border p-3 text-sm placeholder:text-zinc-600 focus:outline-none focus:border-accent transition"
            />
          </label>
          <div className="flex gap-2">
            <button
              onClick={reject}
              disabled={reason.length < 2 || busy !== null}
              className="px-3.5 py-2 text-sm rounded-lg bg-rose-500/10 text-rose-400 ring-1 ring-rose-500/20 hover:bg-rose-500/20 disabled:opacity-50 transition inline-flex items-center gap-1.5"
            >
              {busy === 'reject' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
              Confirm reject
            </button>
            <button
              onClick={() => { setShowReject(false); setReason(''); }}
              className="px-3.5 py-2 text-sm rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-bg-subtle transition"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2 border-t border-border pt-4">
          <button
            onClick={approve}
            disabled={busy !== null}
            className="px-4 py-2 text-sm rounded-lg bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20 hover:bg-emerald-500/20 disabled:opacity-50 transition inline-flex items-center gap-1.5 font-medium"
          >
            {busy === 'approve' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Approve
          </button>
          <button
            onClick={() => setShowReject(true)}
            disabled={busy !== null}
            className="px-4 py-2 text-sm rounded-lg text-zinc-400 ring-1 ring-border hover:text-rose-400 hover:bg-rose-500/5 hover:ring-rose-500/20 transition inline-flex items-center gap-1.5"
          >
            <X className="h-3.5 w-3.5" />
            Reject
          </button>
        </div>
      )}
    </div>
  );
}
