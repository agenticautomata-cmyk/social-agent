'use client';

import { clientApiOrigin } from '../../../lib/client-api';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  formatDateTime,
  statusLabel,
  type OutreachEmailRecord,
} from '../../../lib/sponsor-outreach-types';

const API = clientApiOrigin();

export function HistoryPanel() {
  const [emails, setEmails] = useState<OutreachEmailRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    setLoading(true);
    return fetch(`${API}/api/outreach/emails?view=history`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json() as Promise<{ emails: OutreachEmailRecord[] }>;
      })
      .then((data) => setEmails(data.emails))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <div className="space-y-6">
      <Link href="/outreach/queue" className="bracket text-sm hover:text-accent">← outreach queue</Link>

      {loading && <div className="py-12 text-paper-muted italic text-center">// loading history…</div>}

      {!loading && emails.length === 0 && (
        <p className="text-sm text-paper-muted italic py-8 border border-dashed border-paper-edge text-center">
          // no send history yet
        </p>
      )}

      <div className="space-y-4">
        {emails.map((email) => (
          <article key={email.id} className="border-2 border-paper-edge p-4 space-y-3">
            <div>
              <h3 className="font-bold lowercase">{email.subject.toLowerCase()}</h3>
              <div className="text-2xs text-paper-muted mt-1">
                {email.sponsorBusinessName} · {statusLabel(email.status)}
                {email.sentAt ? ` · sent ${formatDateTime(email.sentAt)}` : ''}
              </div>
            </div>

            {(email.sendAttempts ?? []).length > 0 && (
              <div className="border-t border-paper-edge pt-3 space-y-2">
                <h4 className="text-2xs uppercase text-paper-muted">send attempts</h4>
                {email.sendAttempts!.map((attempt) => (
                  <div key={attempt.id} className="text-2xs text-paper-soft space-y-0.5">
                    <div>
                      {formatDateTime(attempt.attemptedAt)} · {attempt.provider} ·{' '}
                      {statusLabel(attempt.status)}
                      {attempt.recipient ? ` · ${attempt.recipient}` : ''}
                    </div>
                    {attempt.providerMessageId && (
                      <div className="text-paper-muted font-mono">
                        id {attempt.providerMessageId}
                      </div>
                    )}
                    {attempt.subject && (
                      <div className="text-paper-muted">subject: {attempt.subject}</div>
                    )}
                    {attempt.errorMessage ? (
                      <div className="text-accent">error: {attempt.errorMessage}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}

            {email.failureReason && (
              <p className="text-2xs text-accent">failure: {email.failureReason}</p>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
