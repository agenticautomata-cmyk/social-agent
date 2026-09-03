'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { clientApiUrl, parseApiJsonResponse } from '../../../lib/client-api';
import type { OutreachEmailRecord } from '../../../lib/sponsor-outreach-types';
import { useActionToast } from '../../../components/action-toast';

async function readApiError(res: Response, fallback: string): Promise<string> {
  const parsed = await parseApiJsonResponse<{ error?: string; message?: string }>(res);
  if (!parsed.ok) return parsed.error || fallback;
  return parsed.data.message ?? parsed.data.error ?? fallback;
}

export function FormPacketsPanel() {
  const [emails, setEmails] = useState<OutreachEmailRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useActionToast();

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(clientApiUrl('/api/outreach/form-packets'), { cache: 'no-store' });
      if (!res.ok) throw new Error(await readApiError(res, 'Load failed'));
      const data = (await res.json()) as { emails: OutreachEmailRecord[] };
      setEmails(data.emails);
      setSelectedId(data.emails[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const selected = emails.find((e) => e.id === selectedId) ?? null;
  const draftContext = selected?.bensonDraftContext as {
    formOnly?: boolean;
    bensonMustNotSubmit?: boolean;
    rightsWarning?: string | null;
    formUrl?: string | null;
  } | null;

  const formUrl =
    (typeof draftContext?.formUrl === 'string' && draftContext.formUrl) ||
    (selected?.body?.match(/https?:\/\/\S+/)?.[0] ?? null);

  async function confirmSubmitted() {
    if (!selected) return;
    setBusy('confirm');
    setError(null);
    try {
      const res = await fetch(
        clientApiUrl(`/api/outreach/approvals/${selected.id}/mark-contact-form-sent`),
        { method: 'POST' },
      );
      if (!res.ok) throw new Error(await readApiError(res, 'Could not record confirmation'));
      showToast({
        title: `Logged ${selected.sponsorBusinessName ?? 'business'} as contacted`,
        nextStep: 'Benson will not treat this as an email send.',
      });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not confirm');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4 text-sm">
        <Link href="/email/approvals" className="bracket hover:text-accent">
          email approvals →
        </Link>
      </div>

      <div className="border border-amber-700/40 bg-amber-50 px-4 py-3 text-sm space-y-1">
        <p className="font-bold text-amber-900">Manual contact-form queue</p>
        <p className="text-xs text-amber-950">
          These opportunities have an official form and no verified email. Benson prepared the pitch
          answers. A human opens the form and submits. Benson will not submit and will not email.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading && <p className="text-sm italic text-paper-muted">// loading form packets…</p>}
      {!loading && emails.length === 0 && (
        <p className="text-paper-muted italic">No form-only packets waiting.</p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
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
              <div className="text-2xs text-paper-muted truncate">{email.subject}</div>
              <div className="text-2xs text-amber-800 mt-1">Official contact form</div>
            </button>
          ))}
        </div>

        {selected && (
          <div className="border-2 border-paper-edge p-6 space-y-4">
            <div>
              <h2 className="text-2xl font-bold">{selected.sponsorBusinessName}</h2>
              <p className="text-sm text-paper-muted">
                {selected.contactConfidence?.label ?? 'Official contact form'}
              </p>
            </div>

            {(draftContext?.bensonMustNotSubmit || draftContext?.formOnly) && (
              <p className="text-xs text-amber-950 border border-amber-700/30 bg-amber-50 px-3 py-2">
                Benson must not submit this form.
              </p>
            )}
            {draftContext?.rightsWarning ? (
              <p className="text-xs text-amber-950 border border-amber-700/30 bg-amber-50 px-3 py-2">
                {draftContext.rightsWarning}
              </p>
            ) : null}

            <div>
              <h3 className="text-sm font-bold mb-2">Prepared pitch</h3>
              <p className="text-sm font-medium mb-2">{selected.subject}</p>
              <pre className="whitespace-pre-wrap text-xs leading-relaxed border border-paper-edge p-3 bg-paper-wash">
                {selected.body}
              </pre>
            </div>

            <div className="flex flex-wrap gap-3">
              {formUrl ? (
                <a
                  href={formUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary"
                >
                  Open official contact form
                </a>
              ) : null}
              <button
                type="button"
                className="btn-secondary"
                disabled={busy !== null}
                onClick={() => void confirmSubmitted()}
              >
                {busy === 'confirm' ? 'saving…' : 'I submitted the form'}
              </button>
            </div>
            <p className="text-2xs text-paper-muted">
              Confirm only after you personally submit. Contacted status is recorded with a
              timestamp — Benson does not imply it submitted.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
