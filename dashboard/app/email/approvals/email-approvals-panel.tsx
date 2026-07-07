'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  formatDateTime,
  type OutreachEmailRecord,
  type OutreachSendConfig,
} from '../../../lib/sponsor-outreach-types';
import { clientApiUrl } from '../../../lib/client-api';

export function EmailApprovalsPanel() {
  const searchParams = useSearchParams();
  const focusId = searchParams.get('id');
  const [emails, setEmails] = useState<OutreachEmailRecord[]>([]);
  const [sendConfig, setSendConfig] = useState<OutreachSendConfig | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(focusId);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editSubject, setEditSubject] = useState('');
  const [editBody, setEditBody] = useState('');

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    return Promise.all([
      fetch(clientApiUrl('/api/outreach/approvals'), { cache: 'no-store' }).then(async (res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json() as Promise<{
          emails: OutreachEmailRecord[];
          sendMode: 'live' | 'simulate';
          liveSendReady: boolean;
        }>;
      }),
      fetch(clientApiUrl('/api/outreach/send-config'), { cache: 'no-store' }).then((r) =>
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
        const nextId = focusId ?? emailData.emails[0]?.id ?? null;
        setSelectedId(nextId);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [focusId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const selected = useMemo(
    () => emails.find((e) => e.id === selectedId) ?? null,
    [emails, selectedId],
  );

  useEffect(() => {
    if (!selected) return;
    setEditSubject(selected.subject);
    setEditBody(selected.body);
  }, [selected?.id, selected?.subject, selected?.body]);

  async function saveEdits() {
    if (!selected) return;
    setBusy('save');
    setError(null);
    try {
      const res = await fetch(clientApiUrl(`/api/outreach/approvals/${selected.id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: editSubject, body: editBody }),
      });
      if (!res.ok) throw new Error(await res.text());
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(null);
    }
  }

  async function approve(sendNow: boolean) {
    if (!selected) return;
    setBusy(sendNow ? 'approve-send' : 'approve');
    setError(null);
    try {
      await saveEdits();
      const res = await fetch(clientApiUrl(`/api/outreach/approvals/${selected.id}/approve`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          sendNow ? { scheduledSendAt: new Date().toISOString() } : {},
        ),
      });
      if (!res.ok) throw new Error(await res.text());
      if (sendNow) {
        const sendRes = await fetch(clientApiUrl(`/api/outreach/emails/${selected.id}/send`), {
          method: 'POST',
        });
        if (!sendRes.ok) throw new Error(await sendRes.text());
      }
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approve failed');
    } finally {
      setBusy(null);
    }
  }

  async function rejectDraft() {
    if (!selected) return;
    setBusy('reject');
    try {
      const res = await fetch(clientApiUrl(`/api/outreach/approvals/${selected.id}/reject`), {
        method: 'POST',
      });
      if (!res.ok) throw new Error(await res.text());
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reject failed');
    } finally {
      setBusy(null);
    }
  }

  const draftContext = selected?.bensonDraftContext as {
    reasoning?: string | null;
    missingContact?: boolean;
    mediaKitName?: string | null;
  } | null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4 text-sm">
        <Link href="/email" className="bracket hover:text-accent">hub →</Link>
        <Link href="/email/settings" className="bracket hover:text-accent">settings →</Link>
      </div>

      {sendConfig && (
        <div className="border border-dashed border-paper-edge px-4 py-3 text-xs text-paper-muted space-y-1">
          <div>
            send mode:{' '}
            <span className="font-bold text-paper-ink">
              {sendConfig.mode === 'live'
                ? `live (${sendConfig.provider ?? 'provider'})`
                : 'simulation'}
            </span>
          </div>
          {sendConfig.fromEmail && <p>from {sendConfig.fromEmail}</p>}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading && <p className="text-sm italic text-paper-muted">// loading approvals…</p>}

      {!loading && emails.length === 0 && (
        <p className="text-paper-muted italic">No sponsor pitches waiting for approval.</p>
      )}

      <div className="grid lg:grid-cols-[280px_1fr] gap-6">
        <div className="space-y-2">
          {emails.map((email) => (
            <button
              key={email.id}
              type="button"
              onClick={() => setSelectedId(email.id)}
              className={`w-full text-left border px-3 py-3 text-sm ${
                selectedId === email.id ? 'border-accent bg-paper-wash' : 'border-paper-edge'
              }`}
            >
              <div className="font-bold">{email.sponsorBusinessName ?? 'Unknown'}</div>
              <div className="text-2xs text-paper-muted truncate">{email.subject || 'No subject'}</div>
              {email.draftedBy === 'benson' && (
                <div className="text-2xs text-accent mt-1">Benson draft</div>
              )}
            </button>
          ))}
        </div>

        {selected && (
          <div className="border-2 border-paper-edge p-6 space-y-4">
            <div>
              <h2 className="text-2xl font-bold">{selected.sponsorBusinessName}</h2>
              <p className="text-sm text-paper-muted">
                to {selected.sponsorEmail ?? 'email not found'}
                {draftContext?.missingContact ? ' · needs contact before live send' : ''}
              </p>
              {draftContext?.reasoning && (
                <p className="text-xs text-paper-muted mt-2 italic">{draftContext.reasoning}</p>
              )}
              {selected.mediaKitName && (
                <p className="text-xs mt-2">media kit: {selected.mediaKitName}</p>
              )}
            </div>

            <label className="block text-sm space-y-1">
              <span>subject</span>
              <input
                className="input w-full"
                value={editSubject}
                onChange={(e) => setEditSubject(e.target.value)}
              />
            </label>

            <label className="block text-sm space-y-1">
              <span>body</span>
              <textarea
                className="input w-full min-h-[220px]"
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
              />
            </label>

            <div className="flex flex-wrap gap-3">
              <button type="button" className="btn-secondary" disabled={busy !== null} onClick={() => void saveEdits()}>
                save edits
              </button>
              <button type="button" className="btn-primary" disabled={busy !== null} onClick={() => void approve(false)}>
                approve
              </button>
              <button type="button" className="btn-primary" disabled={busy !== null || !selected.sponsorEmail} onClick={() => void approve(true)}>
                approve & send
              </button>
              <button type="button" className="btn-secondary" disabled={busy !== null} onClick={() => void rejectDraft()}>
                reject
              </button>
            </div>

            <p className="text-2xs text-paper-muted">
              updated {formatDateTime(selected.updatedAt)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
