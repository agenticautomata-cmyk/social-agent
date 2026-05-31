'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  formatDateTime,
  statusLabel,
  type OutreachEmailRecord,
} from '../../../lib/sponsor-outreach-types';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function ScheduledPanel() {
  const [emails, setEmails] = useState<OutreachEmailRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [demoMode, setDemoMode] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    return fetch(`${API}/api/outreach/emails?view=scheduled`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json() as Promise<{ emails: OutreachEmailRecord[]; demoMode: boolean }>;
      })
      .then((data) => {
        setEmails(data.emails);
        setDemoMode(data.demoMode);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function runAction(id: string, action: 'approve' | 'cancel' | 'simulate-send') {
    setBusy(`${action}-${id}`);
    try {
      const res = await fetch(`${API}/api/outreach/emails/${id}/${action}`, { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      void reload();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-4 text-sm">
        <Link href="/outreach/compose" className="bracket hover:text-accent">compose →</Link>
        <Link href="/outreach/history" className="bracket hover:text-accent">history →</Link>
      </div>

      {demoMode && (
        <div className="border border-dashed border-paper-edge px-4 py-2 text-xs text-paper-muted">
          demo mode — use &quot;simulate send&quot; instead of real delivery
        </div>
      )}

      {loading && <div className="py-12 text-paper-muted italic text-center">// loading queue…</div>}

      {!loading && emails.length === 0 && (
        <p className="text-sm text-paper-muted italic py-8 border border-dashed border-paper-edge text-center">
          // no scheduled or draft emails
        </p>
      )}

      <div className="space-y-4">
        {emails.map((email) => (
          <article key={email.id} className="border-2 border-paper-edge p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-bold lowercase">{email.subject.toLowerCase()}</h3>
                <div className="text-2xs text-paper-muted mt-1">
                  {email.sponsorBusinessName} · {statusLabel(email.status)}
                  {email.scheduledSendAt ? ` · ${formatDateTime(email.scheduledSendAt)}` : ''}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 text-2xs">
                {email.status === 'needs_approval' && (
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => void runAction(email.id, 'approve')}
                    className="border border-paper-edge px-2 py-1 hover:border-paper-ink"
                  >
                    approve
                  </button>
                )}
                {email.status === 'scheduled' && demoMode && (
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => void runAction(email.id, 'simulate-send')}
                    className="border-2 border-paper-ink px-2 py-1 font-bold hover:bg-paper-ink hover:text-paper"
                  >
                    simulate send
                  </button>
                )}
                {['draft', 'needs_approval', 'scheduled'].includes(email.status) && (
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => void runAction(email.id, 'cancel')}
                    className="border border-paper-edge px-2 py-1 hover:border-paper-ink"
                  >
                    cancel
                  </button>
                )}
              </div>
            </div>
            <p className="text-xs text-paper-soft line-clamp-3 whitespace-pre-wrap">{email.body}</p>
            {email.previewedAt && (
              <p className="text-2xs text-paper-muted">previewed {formatDateTime(email.previewedAt)}</p>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
