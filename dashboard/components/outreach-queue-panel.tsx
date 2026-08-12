'use client';

import { clientApiOrigin } from '../lib/client-api';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  formatDateTime,
  statusLabel,
  type OutreachEmailRecord,
  type OutreachSendConfig,
} from '../lib/sponsor-outreach-types';

const API = clientApiOrigin();

export function OutreachQueuePanel() {
  const [emails, setEmails] = useState<OutreachEmailRecord[]>([]);
  const [sendConfig, setSendConfig] = useState<OutreachSendConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    return Promise.all([
      fetch(`${API}/api/outreach/emails?view=queue`, { cache: 'no-store' }).then(async (res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json() as Promise<{
          emails: OutreachEmailRecord[];
          sendMode: 'live' | 'simulate';
          liveSendReady: boolean;
        }>;
      }),
      fetch(`${API}/api/outreach/send-config`, { cache: 'no-store' }).then((r) =>
        r.json(),
      ) as Promise<OutreachSendConfig>,
    ])
      .then(([emailData, config]) => {
        setEmails(emailData.emails);
        setSendConfig({
          ...config,
          mode: emailData.sendMode,
          liveReady: emailData.liveSendReady,
        });
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function runAction(
    id: string,
    action: 'approve' | 'cancel' | 'send' | 'simulate-send' | 'contact-form',
  ) {
    setBusy(`${action}-${id}`);
    setError(null);
    try {
      const url =
        action === 'contact-form'
          ? `${API}/api/outreach/approvals/${id}/mark-contact-form-sent`
          : `${API}/api/outreach/emails/${id}/${
              action === 'simulate-send' ? 'simulate-send' : action
            }`;
      const res = await fetch(url, { method: 'POST' });
      if (!res.ok) {
        const text = await res.text();
        let msg = text;
        try {
          const j = JSON.parse(text) as { message?: string; error?: string };
          msg = j.message ?? j.error ?? text;
        } catch {
          /* raw text */
        }
        throw new Error(msg);
      }
      void reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(null);
    }
  }

  const simulateMode = sendConfig?.mode === 'simulate';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4 text-sm">
        <Link href="/outreach/compose" className="bracket hover:text-accent">
          compose →
        </Link>
        <Link href="/outreach/history" className="bracket hover:text-accent">
          history →
        </Link>
      </div>

      {sendConfig && (
        <div className="border border-dashed border-paper-edge px-4 py-3 text-xs text-paper-muted space-y-1">
          <div>
            send mode:{' '}
            <span className="font-bold text-paper-ink">
              {sendConfig.mode === 'live' ? 'live (resend)' : 'simulation'}
            </span>
          </div>
          {sendConfig.mode === 'simulate' && (
            <p>
              Set <span className="font-mono">OUTREACH_ENABLE_LIVE_SEND=true</span> plus Resend
              credentials to send real email. Approval is still required.
            </p>
          )}
          {sendConfig.mode === 'live' && sendConfig.fromEmail && (
            <p>
              from {sendConfig.fromEmail}
              {sendConfig.replyTo ? ` · reply-to ${sendConfig.replyTo}` : ''}
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="border-2 border-accent px-4 py-3 text-sm text-accent">// {error}</div>
      )}

      {loading && (
        <div className="py-12 text-paper-muted italic text-center">// loading queue…</div>
      )}

      {!loading && emails.length === 0 && (
        <p className="text-sm text-paper-muted italic py-8 border border-dashed border-paper-edge text-center">
          // no emails in queue
        </p>
      )}

      <div className="space-y-4">
        {emails.map((email) => (
          <article key={email.id} className="border-2 border-paper-edge p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-bold lowercase">{email.subject.toLowerCase()}</h3>
                <div className="text-2xs text-paper-muted mt-1">
                  {email.sponsorBusinessName}
                  {email.sponsorEmail ? ` · ${email.sponsorEmail}` : ' · no email on file'}
                  {' · '}
                  {statusLabel(email.status)}
                  {email.scheduledSendAt
                    ? ` · scheduled ${formatDateTime(email.scheduledSendAt)}`
                    : ''}
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
                {email.status === 'scheduled' && (
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() =>
                      void runAction(email.id, simulateMode ? 'simulate-send' : 'send')
                    }
                    className="border-2 border-paper-ink px-2 py-1 font-bold hover:bg-paper-ink hover:text-paper disabled:opacity-40"
                  >
                    {busy?.includes(email.id) ? '…' : simulateMode ? 'simulate send' : 'send now'}
                  </button>
                )}
                {['draft', 'needs_approval', 'scheduled'].includes(email.status) &&
                  !email.sponsorEmail && (
                    <button
                      type="button"
                      disabled={!!busy}
                      onClick={() => void runAction(email.id, 'contact-form')}
                      className="border-2 border-amber-700/50 px-2 py-1 font-bold text-amber-800 hover:bg-amber-50"
                      title="Tell Benson you submitted this through their online contact form"
                    >
                      {busy === `contact-form-${email.id}` ? '…' : 'sent via contact form'}
                    </button>
                  )}
                {email.status === 'sending' && (
                  <span className="text-paper-muted italic px-2 py-1">sending…</span>
                )}
                {['draft', 'needs_approval', 'scheduled', 'sending'].includes(email.status) && (
                  <button
                    type="button"
                    disabled={!!busy || email.status === 'sending'}
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
              <p className="text-2xs text-paper-muted">
                previewed {formatDateTime(email.previewedAt)}
                {email.approvedAt ? ` · approved ${formatDateTime(email.approvedAt)}` : ''}
              </p>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
