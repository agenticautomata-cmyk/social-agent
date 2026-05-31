'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { NOT_USEFUL_REASONS } from '../lib/pre-alpha-types';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

type Mode = 'idle' | 'feedback' | 'bug' | 'thanks';

export function TesterFeedbackPanel({ pageTitle }: { pageTitle?: string }) {
  const pathname = usePathname();
  const [mode, setMode] = useState<Mode>('idle');
  const [sentiment, setSentiment] = useState<'up' | 'down' | null>(null);
  const [reasonCode, setReasonCode] = useState('');
  const [comment, setComment] = useState('');
  const [expected, setExpected] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(kind: 'feedback' | 'bug') {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/pre-alpha/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          route: pathname,
          pageTitle: pageTitle ?? pathname,
          sentiment: kind === 'feedback' ? sentiment : undefined,
          reasonCode: reasonCode || undefined,
          comment: comment || undefined,
          expectedBehavior: expected || undefined,
          userEmail: email || undefined,
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
          viewport:
            typeof window !== 'undefined'
              ? `${window.innerWidth}x${window.innerHeight}`
              : undefined,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setMode('thanks');
      setSentiment(null);
      setReasonCode('');
      setComment('');
      setExpected('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setBusy(false);
    }
  }

  if (mode === 'thanks') {
    return (
      <section className="border-2 border-paper-ink bg-paper-tint p-4 text-sm">
        <p className="font-bold lowercase">thanks — feedback saved</p>
        <button
          type="button"
          className="mt-3 min-h-[44px] text-2xs border border-paper-edge px-4 py-2"
          onClick={() => setMode('idle')}
        >
          close
        </button>
      </section>
    );
  }

  return (
    <section className="border-2 border-paper-edge p-4 space-y-4" id="tester-feedback">
      <div>
        <h2 className="text-sm font-bold uppercase tracking-wider">help us improve</h2>
        <p className="text-2xs text-paper-muted mt-1 italic">
          Pre-alpha testing — your notes go to the team (not public).
        </p>
      </div>

      {mode === 'idle' && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="min-h-[44px] px-4 py-2 border-2 border-paper-ink text-sm font-bold"
            onClick={() => {
              setMode('feedback');
              setSentiment('up');
            }}
          >
            👍 useful
          </button>
          <button
            type="button"
            className="min-h-[44px] px-4 py-2 border border-paper-edge text-sm"
            onClick={() => {
              setMode('feedback');
              setSentiment('down');
            }}
          >
            👎 not useful
          </button>
          <button
            type="button"
            className="min-h-[44px] px-4 py-2 border border-accent text-accent text-sm"
            onClick={() => setMode('bug')}
          >
            report a bug
          </button>
        </div>
      )}

      {mode === 'feedback' && (
        <div className="space-y-3">
          <p className="text-xs text-paper-muted">
            {sentiment === 'up' ? 'What worked well?' : 'What was not useful?'}
          </p>
          {sentiment === 'down' && (
            <label className="block text-2xs space-y-1">
              <span className="text-paper-muted uppercase">reason</span>
              <select
                value={reasonCode}
                onChange={(e) => setReasonCode(e.target.value)}
                className="w-full min-h-[44px] border border-paper-edge px-2 bg-paper text-sm"
              >
                <option value="">— select —</option>
                {NOT_USEFUL_REASONS.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block text-2xs space-y-1">
            <span className="text-paper-muted uppercase">what i expected (optional)</span>
            <textarea
              value={expected}
              onChange={(e) => setExpected(e.target.value)}
              rows={2}
              className="w-full border border-paper-edge p-2 bg-paper text-sm"
            />
          </label>
          <label className="block text-2xs space-y-1">
            <span className="text-paper-muted uppercase">comments (optional)</span>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              className="w-full border border-paper-edge p-2 bg-paper text-sm"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              className="min-h-[44px] px-4 border-2 border-paper-ink text-sm font-bold disabled:opacity-50"
              onClick={() => void submit('feedback')}
            >
              {busy ? '…' : 'submit feedback'}
            </button>
            <button
              type="button"
              className="min-h-[44px] px-4 text-2xs text-paper-muted"
              onClick={() => setMode('idle')}
            >
              cancel
            </button>
          </div>
        </div>
      )}

      {mode === 'bug' && (
        <div className="space-y-3">
          <label className="block text-2xs space-y-1">
            <span className="text-paper-muted uppercase">what happened?</span>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              required
              className="w-full border border-paper-edge p-2 bg-paper text-sm"
              placeholder="Steps to reproduce, what you clicked, error messages…"
            />
          </label>
          <label className="block text-2xs space-y-1">
            <span className="text-paper-muted uppercase">what i expected</span>
            <textarea
              value={expected}
              onChange={(e) => setExpected(e.target.value)}
              rows={2}
              className="w-full border border-paper-edge p-2 bg-paper text-sm"
            />
          </label>
          <label className="block text-2xs space-y-1">
            <span className="text-paper-muted uppercase">your email (optional)</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full min-h-[44px] border border-paper-edge px-2 bg-paper text-sm"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !comment.trim()}
              className="min-h-[44px] px-4 border-2 border-accent text-accent text-sm font-bold disabled:opacity-50"
              onClick={() => void submit('bug')}
            >
              {busy ? '…' : 'submit bug report'}
            </button>
            <button
              type="button"
              className="min-h-[44px] px-4 text-2xs text-paper-muted"
              onClick={() => setMode('idle')}
            >
              cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-2xs text-accent">// {error}</p>}
    </section>
  );
}
