'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  formatDateTime,
  type OutreachEmailRecord,
  type OutreachSendConfig,
} from '../../../lib/sponsor-outreach-types';
import { clientApiUrl, parseApiJsonResponse } from '../../../lib/client-api';
import { useActionToast } from '../../../components/action-toast';

async function readApiError(res: Response, fallback: string): Promise<string> {
  const parsed = await parseApiJsonResponse<{ error?: string; message?: string }>(res);
  if (!parsed.ok) return parsed.error || fallback;
  return parsed.data.message ?? parsed.data.error ?? fallback;
}

function confidenceBadgeClass(tier?: 'high' | 'medium' | 'low' | 'none'): string {
  switch (tier) {
    case 'high':
      return 'border-emerald-600/40 text-emerald-700';
    case 'medium':
      return 'border-sky-600/40 text-sky-700';
    case 'low':
      return 'border-amber-600/40 text-amber-700';
    default:
      return 'border-stone-500/40 text-stone-600';
  }
}

export function EmailApprovalsPanel() {
  const searchParams = useSearchParams();
  const focusId = searchParams.get('id');
  const [emails, setEmails] = useState<OutreachEmailRecord[]>([]);
  const [sendConfig, setSendConfig] = useState<OutreachSendConfig | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(focusId);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const { showToast } = useActionToast();
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [editSubject, setEditSubject] = useState('');
  const [editBody, setEditBody] = useState('');

  const reload = useCallback(async (opts?: { preserveSelectedId?: string | null }) => {
    setLoading(true);
    try {
      const [emailRes, configRes] = await Promise.all([
        fetch(clientApiUrl('/api/outreach/approvals'), { cache: 'no-store' }),
        fetch(clientApiUrl('/api/outreach/send-config'), { cache: 'no-store' }),
      ]);
      if (!emailRes.ok) throw new Error(await readApiError(emailRes, `Load failed (${emailRes.status})`));
      const emailData = (await emailRes.json()) as {
        emails: OutreachEmailRecord[];
        sendMode: 'live' | 'simulate';
        liveSendReady: boolean;
      };
      const config = (await configRes.json()) as OutreachSendConfig;
      setEmails(emailData.emails);
      setSendConfig({
        ...config,
        mode: emailData.sendMode,
        liveReady: emailData.liveSendReady,
      });

      const preserve = opts?.preserveSelectedId;
      const stillThere =
        preserve && emailData.emails.some((email) => email.id === preserve) ? preserve : null;
      setSelectedId(stillThere ?? focusId ?? emailData.emails[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [focusId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const selected = useMemo(
    () => emails.find((e) => e.id === selectedId) ?? null,
    [emails, selectedId],
  );

  useEffect(() => {
    if (!selectedId) return;
    const el = document.getElementById(`approval-${selectedId}`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedId, emails.length]);

  useEffect(() => {
    if (!selected) return;
    setEditSubject(selected.subject);
    setEditBody(selected.body);
  }, [selected?.id, selected?.subject, selected?.body]);

  const simulateMode = sendConfig?.mode !== 'live';

  async function persistEdits(emailId: string): Promise<void> {
    const res = await fetch(clientApiUrl(`/api/outreach/approvals/${emailId}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject: editSubject, body: editBody }),
    });
    if (!res.ok) throw new Error(await readApiError(res, 'Save failed'));
  }

  async function saveEdits() {
    if (!selected) return;
    setBusy('save');
    setError(null);
    setStatusMessage(null);
    try {
      await persistEdits(selected.id);
      setStatusMessage('Draft saved.');
      await reload({ preserveSelectedId: selected.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(null);
    }
  }

  async function approve(sendNow: boolean) {
    if (!selected) return;

    // The API refuses a blocked recipient too, but stopping here keeps Kellie from
    // ever seeing an approve action that cannot succeed.
    if (selected.recipientSafety?.blocked) {
      setError(
        selected.recipientSafety.summary ??
          'This recipient is blocked from outreach and cannot be approved.',
      );
      setStatusMessage(null);
      return;
    }

    if (sendNow && !selected.sponsorEmail) {
      setError('No email on file — use “sent via contact form” instead of approve & send.');
      setStatusMessage(null);
      return;
    }

    const emailId = selected.id;
    const business = selected.sponsorBusinessName ?? 'sponsor';
    setBusy(sendNow ? 'approve-send' : 'approve');
    setError(null);
    setStatusMessage(null);
    try {
      await persistEdits(emailId);

      const res = await fetch(clientApiUrl(`/api/outreach/approvals/${emailId}/approve`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sendNow ? { scheduledSendAt: new Date().toISOString() } : {}),
      });
      if (!res.ok) throw new Error(await readApiError(res, 'Approve failed'));

      if (sendNow) {
        const sendRes = await fetch(clientApiUrl(`/api/outreach/emails/${emailId}/send`), {
          method: 'POST',
        });
        if (!sendRes.ok) throw new Error(await readApiError(sendRes, 'Send failed'));
        const sendBody = (await sendRes.json()) as {
          mode?: 'live' | 'simulate';
          email?: OutreachEmailRecord;
        };
        const live = sendBody.mode === 'live';
        setStatusMessage(
          live
            ? `Sent live to ${business}.`
            : `Approved and simulated send for ${business} — live email is off, so nothing left the inbox.`,
        );
        showToast({
          title: live ? `Sent to ${business}` : `Simulated send for ${business}`,
          nextStep: live
            ? 'Benson watches for a reply and pings you on Telegram. If nobody answers, it follows up in 5 days.'
            : 'Live email is off, so nothing actually left the inbox. Turn on live send to deliver it.',
        });
      } else {
        setStatusMessage(`Approved ${business} — queued for send (not sent yet).`);
        showToast({
          title: `Approved ${business}`,
          nextStep: 'Queued but not sent. It goes out on the next scheduled send — see Scheduled to change timing.',
        });
      }

      await reload({ preserveSelectedId: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Approve failed';
      setError(message);
      showToast({ title: "That didn't send", nextStep: message, tone: 'error' });
      await reload({ preserveSelectedId: emailId });
    } finally {
      setBusy(null);
    }
  }

  async function rejectDraft() {
    if (!selected) return;
    const emailId = selected.id;
    setBusy('reject');
    setError(null);
    setStatusMessage(null);
    try {
      const res = await fetch(clientApiUrl(`/api/outreach/approvals/${emailId}/reject`), {
        method: 'POST',
      });
      if (!res.ok) throw new Error(await readApiError(res, 'Reject failed'));
      setStatusMessage('Draft rejected.');
      showToast({
        title: 'Draft rejected',
        nextStep: 'Nothing sends. Benson learns from the rejection and will pitch this sponsor differently next time.',
      });
      await reload({ preserveSelectedId: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Reject failed';
      setError(message);
      showToast({ title: "That didn't save", nextStep: message, tone: 'error' });
    } finally {
      setBusy(null);
    }
  }

  async function regenerateWithBenson() {
    if (!selected) return;
    const emailId = selected.id;
    setBusy('regenerate');
    setError(null);
    setStatusMessage(null);
    try {
      const res = await fetch(clientApiUrl(`/api/outreach/approvals/${emailId}/regenerate`), {
        method: 'POST',
      });
      if (!res.ok) throw new Error(await readApiError(res, 'Regenerate failed'));
      const data = (await res.json()) as { email: OutreachEmailRecord };
      setEditSubject(data.email.subject);
      setEditBody(data.email.body);
      setStatusMessage('Regenerated with Benson.');
      showToast({
        title: 'Rewritten by Benson',
        nextStep: 'New subject and body loaded in the editor. Nothing sends until you approve it.',
      });
      await reload({ preserveSelectedId: emailId });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Regenerate failed');
    } finally {
      setBusy(null);
    }
  }

  async function markSentViaContactForm() {
    if (!selected) return;
    const emailId = selected.id;
    const business = selected.sponsorBusinessName ?? 'sponsor';
    setBusy('contact-form');
    setError(null);
    setStatusMessage(null);
    try {
      const res = await fetch(
        clientApiUrl(`/api/outreach/approvals/${emailId}/mark-contact-form-sent`),
        { method: 'POST' },
      );
      if (!res.ok) throw new Error(await readApiError(res, 'Could not notify Benson'));
      setStatusMessage(
        `Marked ${business} as sent via contact form — Benson will remember they use a form, not email.`,
      );
      showToast({
        title: `Logged ${business} as contacted`,
        nextStep: 'Benson remembers they use a form, tracks the follow-up date, and stops drafting emails to them.',
      });
      await reload({ preserveSelectedId: null });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not notify Benson');
    } finally {
      setBusy(null);
    }
  }

  const draftContext = selected?.bensonDraftContext as {
    reasoning?: string | null;
    missingContact?: boolean;
    mediaKitName?: string | null;
    regeneratedAt?: string | null;
    formOnly?: boolean;
    bensonMustNotSubmit?: boolean;
    rightsWarning?: string | null;
  } | null;

  const formOnlyPacket = draftContext?.formOnly === true || draftContext?.bensonMustNotSubmit === true;

  const recipientBlocked = selected?.recipientSafety?.blocked === true;

  const sendButtonLabel =
    busy === 'approve-send'
      ? simulateMode
        ? 'simulating…'
        : 'sending…'
      : simulateMode
        ? 'approve & simulate send'
        : 'approve & send';

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
                : 'simulation — approve & send will not email the sponsor'}
            </span>
          </div>
          {sendConfig.mode === 'simulate' && (
            <p className="text-amber-800">
              Live send is off
              {sendConfig.missingForLive.length > 0
                ? ` (${sendConfig.missingForLive.join(', ')})`
                : ''}
              .{' '}
              <Link href="/email/settings" className="link">
                Email settings
              </Link>
            </p>
          )}
          {sendConfig.mode === 'simulate' && sendConfig.liveEnabled && (
            <p className="text-amber-800">
              Live send is enabled but not ready
              {sendConfig.missingForLive.length > 0
                ? ` — ${sendConfig.missingForLive.join(', ')}`
                : ''}
              .
            </p>
          )}
          {sendConfig.fromEmail && <p>from {sendConfig.fromEmail}</p>}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {statusMessage && <p className="text-sm text-emerald-800">{statusMessage}</p>}
      {loading && <p className="text-sm italic text-paper-muted">// loading approvals…</p>}

      {!loading && emails.length === 0 && (
        <p className="text-paper-muted italic">No sponsor pitches waiting for approval.</p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
        <div className="space-y-2 max-h-[40vh] overflow-y-auto lg:max-h-none lg:overflow-visible">
          {emails.map((email) => (
            <button
              key={email.id}
              id={`approval-${email.id}`}
              type="button"
              onClick={() => {
                setSelectedId(email.id);
                setError(null);
                setStatusMessage(null);
              }}
              className={`w-full text-left border px-3 py-3 text-sm ${
                selectedId === email.id ? 'border-accent bg-paper-wash' : 'border-paper-edge'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="font-bold min-w-0">{email.sponsorBusinessName ?? 'Unknown'}</div>
                <span className={`shrink-0 text-2xs px-1.5 py-0.5 border ${confidenceBadgeClass(email.contactConfidence?.tier)}`}>
                  {email.contactConfidence?.label ?? (email.hasContactEmail ? 'has contact' : 'no contact')}
                </span>
              </div>
              {email.recipientSafety?.blocked && (
                <div className="text-2xs font-bold text-red-700">blocked — cannot send</div>
              )}
              <div className="text-2xs text-paper-muted truncate">{email.subject || 'No subject'}</div>
              {email.sponsorContactName && (
                <div className="text-2xs text-paper-muted truncate">→ {email.sponsorContactName}</div>
              )}
              {email.draftedBy === 'benson' && (
                <div className="text-2xs text-accent mt-1">Benson draft</div>
              )}
            </button>
          ))}
        </div>

        {selected && (
          <div className="border-2 border-paper-edge p-6 space-y-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-bold">{selected.sponsorBusinessName}</h2>
                <span className={`text-2xs px-2 py-0.5 border ${confidenceBadgeClass(selected.contactConfidence?.tier)}`}>
                  {selected.contactConfidence?.label ?? (selected.hasContactEmail ? 'has contact' : 'needs contact')}
                </span>
              </div>
              <p className="text-sm text-paper-muted">
                to {selected.sponsorEmail ?? 'email not found'}
                {selected.sponsorContactName && selected.contactConfidence?.usable
                  ? ` · ${selected.sponsorContactName}`
                  : selected.sponsorContactName
                    ? ` · ${selected.sponsorContactName} (unverified — name only, not a contact path)`
                    : ''}
                {draftContext?.missingContact ? ' · needs contact before live send' : ''}
              </p>
              {draftContext?.reasoning && (
                <p className="text-xs text-paper-muted mt-2 italic">{draftContext.reasoning}</p>
              )}
              {selected.mediaKitName && (
                <p className="text-xs mt-2">media kit: {selected.mediaKitName}</p>
              )}
            </div>

            {recipientBlocked && (
              <div className="border-2 border-red-700/50 bg-red-50 px-4 py-3 text-sm space-y-1">
                <p className="font-bold text-red-800">Blocked from outreach — cannot be approved</p>
                <ul className="list-disc pl-5 text-xs text-red-900 space-y-1">
                  {(selected.recipientSafety?.blocks ?? []).map((block) => (
                    <li key={block.code}>{block.message}</li>
                  ))}
                </ul>
                <p className="text-xs text-red-900">
                  Reject this draft. Nothing here can be sent, and Benson will not draft to this
                  record again.
                </p>
              </div>
            )}

            {formOnlyPacket && !recipientBlocked && (
              <div className="border border-amber-700/40 bg-amber-50 px-4 py-3 text-sm space-y-1">
                <p className="font-bold text-amber-900">Form only — not an email send</p>
                <p className="text-xs text-amber-950">
                  Benson prepared answers for a published contact form. A human submits the form.
                  Do not use Approve &amp; send for email — use &quot;mark sent via contact form&quot;
                  after you submit.
                </p>
                {draftContext?.rightsWarning ? (
                  <p className="text-xs text-amber-950 mt-1">{draftContext.rightsWarning}</p>
                ) : null}
              </div>
            )}

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
              <button
                type="button"
                className="btn-secondary"
                disabled={busy !== null}
                onClick={() => void regenerateWithBenson()}
              >
                {busy === 'regenerate' ? 'regenerating…' : 'regenerate with Benson'}
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={busy !== null}
                onClick={() => void saveEdits()}
              >
                save edits
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={busy !== null || recipientBlocked}
                onClick={() => void approve(false)}
                title={
                  recipientBlocked
                    ? (selected.recipientSafety?.summary ?? 'Recipient is blocked from outreach')
                    : 'Approve this draft'
                }
              >
                {busy === 'approve' ? 'approving…' : 'approve'}
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={busy !== null || recipientBlocked}
                onClick={() => void approve(true)}
                title={
                  recipientBlocked
                    ? (selected.recipientSafety?.summary ?? 'Recipient is blocked from outreach')
                    : selected.sponsorEmail
                      ? simulateMode
                        ? 'Live email is off — this only records a simulated send'
                        : 'Approve and send the email now'
                      : 'No email on file'
                }
              >
                {sendButtonLabel}
              </button>
              <button
                type="button"
                className={!selected.hasContactEmail && !recipientBlocked ? 'btn-primary' : 'btn-secondary'}
                disabled={busy !== null || recipientBlocked}
                onClick={() => void markSentViaContactForm()}
                title={
                  recipientBlocked
                    ? (selected.recipientSafety?.summary ?? 'Recipient is blocked from outreach')
                    : 'Tell Benson you submitted this pitch through their online contact form'
                }
              >
                {busy === 'contact-form' ? 'notifying Benson…' : 'sent via contact form'}
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={busy !== null}
                onClick={() => void rejectDraft()}
              >
                reject
              </button>
            </div>

            {!selected.hasContactEmail && (
              <p className="text-xs text-amber-800">
                No email on file — approve & send cannot email them. If you used their online form,
                tap <span className="font-bold">sent via contact form</span>.
              </p>
            )}

            <p className="text-2xs text-paper-muted">
              updated {formatDateTime(selected.updatedAt)}
              {draftContext?.regeneratedAt
                ? ` · regenerated ${formatDateTime(draftContext.regeneratedAt)}`
                : ''}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
