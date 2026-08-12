'use client';

import { clientApiOrigin } from '../../../lib/client-api';
import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type {
  EmailTemplateRecord,
  MediaKitRecord,
  OutreachEmailRecord,
  SponsorContactRecord,
} from '../../../lib/sponsor-outreach-types';

const API = clientApiOrigin();

function ComposePanelInner() {
  const searchParams = useSearchParams();
  const initialSponsor = searchParams.get('sponsor') ?? '';

  const [contacts, setContacts] = useState<SponsorContactRecord[]>([]);
  const [kits, setKits] = useState<MediaKitRecord[]>([]);
  const [templates, setTemplates] = useState<EmailTemplateRecord[]>([]);
  const [sponsorId, setSponsorId] = useState(initialSponsor);
  const [kitId, setKitId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [draftId, setDraftId] = useState<string | null>(null);
  const [previewed, setPreviewed] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      fetch(`${API}/api/sponsors`).then((r) => r.json()),
      fetch(`${API}/api/media-kits?active=true`).then((r) => r.json()),
      fetch(`${API}/api/outreach/templates`).then((r) => r.json()),
    ]).then(([sponsors, mediaKits, tmpl]) => {
      setContacts(sponsors.contacts ?? []);
      setKits(mediaKits.kits ?? []);
      setTemplates(tmpl.templates ?? []);
    });
  }, []);

  useEffect(() => {
    if (initialSponsor) setSponsorId(initialSponsor);
  }, [initialSponsor]);

  async function loadPreview() {
    if (!sponsorId || !templateId) {
      setError('Select a sponsor and template first');
      return;
    }
    setBusy('preview');
    setError(null);
    try {
      const res = await fetch(`${API}/api/outreach/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sponsorContactId: sponsorId,
          templateId,
          mediaKitId: kitId || null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as { preview: { subject: string; body: string } };
      setSubject(json.preview.subject);
      setBody(json.preview.body);
      setPreviewOpen(true);
      setPreviewed(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed');
    } finally {
      setBusy(null);
    }
  }

  async function saveDraft() {
    if (!sponsorId) return;
    setBusy('draft');
    setError(null);
    try {
      const payload = {
        sponsorContactId: sponsorId,
        mediaKitId: kitId || null,
        templateId: templateId || null,
        subject,
        body,
      };
      const res = draftId
        ? await fetch(`${API}/api/outreach/emails/${draftId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch(`${API}/api/outreach/emails`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as { email: OutreachEmailRecord };
      setDraftId(json.email.id);
      setMessage('Draft saved');
      setPreviewed(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(null);
    }
  }

  async function handleSaveDraftAndPreview() {
    setBusy('save-preview');
    setError(null);
    try {
      if (!sponsorId || !subject || !body) throw new Error('Sponsor, subject, and body required');
      let id = draftId;
      if (!id) {
        const res = await fetch(`${API}/api/outreach/emails`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sponsorContactId: sponsorId,
            mediaKitId: kitId || null,
            templateId: templateId || null,
            subject,
            body,
          }),
        });
        if (!res.ok) throw new Error(await res.text());
        const json = (await res.json()) as { email: OutreachEmailRecord };
        id = json.email.id;
        setDraftId(id);
      } else {
        const res = await fetch(`${API}/api/outreach/emails/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subject, body, mediaKitId: kitId || null, templateId: templateId || null }),
        });
        if (!res.ok) throw new Error(await res.text());
      }
      const previewRes = await fetch(`${API}/api/outreach/emails/${id}/preview`, { method: 'POST' });
      if (!previewRes.ok) throw new Error(await previewRes.text());
      setPreviewed(true);
      setPreviewOpen(false);
      setMessage('Preview confirmed — you can now schedule');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(null);
    }
  }

  async function scheduleEmail() {
    if (!draftId || !scheduledAt) {
      setError('Save and preview first, then pick a schedule time');
      return;
    }
    if (!previewed) {
      setError('Email must be previewed before scheduling');
      return;
    }
    setBusy('schedule');
    try {
      const res = await fetch(`${API}/api/outreach/emails/${draftId}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledSendAt: new Date(scheduledAt).toISOString() }),
      });
      if (!res.ok) throw new Error(await res.text());
      setMessage('Scheduled — awaiting approval in queue');
      window.location.href = '/outreach/queue';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Schedule failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex gap-4 text-sm">
        <Link href="/sponsors" className="bracket hover:text-accent">← sponsors</Link>
        <Link href="/outreach/queue" className="bracket hover:text-accent">outreach queue →</Link>
      </div>

      {error && <div className="border-2 border-accent px-4 py-3 text-sm text-accent">// {error}</div>}
      {message && <div className="border border-paper-edge px-4 py-2 text-xs text-paper-muted">{message}</div>}

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <label className="block space-y-1 text-sm">
          <span className="text-2xs uppercase text-paper-muted">sponsor contact</span>
          <select
            value={sponsorId}
            onChange={(e) => { setSponsorId(e.target.value); setPreviewed(false); }}
            className="w-full border border-paper-edge px-2 py-1.5 bg-paper"
          >
            <option value="">— select —</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>{c.businessName}</option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-2xs uppercase text-paper-muted">media kit</span>
          <select
            value={kitId}
            onChange={(e) => { setKitId(e.target.value); setPreviewed(false); }}
            className="w-full border border-paper-edge px-2 py-1.5 bg-paper"
          >
            <option value="">— optional —</option>
            {kits.map((k) => (
              <option key={k.id} value={k.id}>{k.name}</option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-2xs uppercase text-paper-muted">template</span>
          <select
            value={templateId}
            onChange={(e) => { setTemplateId(e.target.value); setPreviewed(false); }}
            className="w-full border border-paper-edge px-2 py-1.5 bg-paper"
          >
            <option value="">— select —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </label>
      </section>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!!busy}
          onClick={() => void loadPreview()}
          className="border border-paper-edge px-3 py-1.5 text-xs hover:border-paper-ink"
        >
          {busy === 'preview' ? '…' : 'generate from template'}
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={() => void saveDraft()}
          className="border border-paper-edge px-3 py-1.5 text-xs hover:border-paper-ink"
        >
          save draft
        </button>
      </div>

      <label className="block space-y-1 text-sm">
        <span className="text-2xs uppercase text-paper-muted">subject</span>
        <input
          value={subject}
          onChange={(e) => { setSubject(e.target.value); setPreviewed(false); }}
          className="w-full border border-paper-edge px-2 py-1.5 bg-paper"
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-2xs uppercase text-paper-muted">body</span>
        <textarea
          value={body}
          onChange={(e) => { setBody(e.target.value); setPreviewed(false); }}
          rows={14}
          className="w-full border border-paper-edge px-2 py-1.5 bg-paper font-mono text-xs"
        />
      </label>

      <div className="flex flex-wrap gap-2 border-t border-paper-edge pt-4">
        <button
          type="button"
          disabled={!!busy || !subject || !body}
          onClick={() => setPreviewOpen(true)}
          className="border-2 border-paper-ink px-3 py-1.5 text-xs font-bold"
        >
          preview email
        </button>
        <button
          type="button"
          disabled={!!busy || !subject || !body}
          onClick={() => void handleSaveDraftAndPreview()}
          className="border border-paper-edge px-3 py-1.5 text-xs hover:border-paper-ink"
        >
          {busy === 'save-preview' ? '…' : 'confirm preview'}
        </button>
        {previewed && (
          <span className="text-2xs text-accent self-center">✓ preview confirmed</span>
        )}
      </div>

      {previewed && (
        <section className="border-2 border-paper-edge p-4 space-y-3">
          <h2 className="font-bold lowercase">schedule send</h2>
          <p className="text-2xs text-paper-muted">
            Approval required by default. Live send uses Gmail when outreach live mode is on.
          </p>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="border border-paper-edge px-2 py-1.5 bg-paper text-sm"
          />
          <button
            type="button"
            disabled={!!busy || !scheduledAt}
            onClick={() => void scheduleEmail()}
            className="border-2 border-paper-ink px-4 py-2 text-xs font-bold hover:bg-paper-ink hover:text-paper"
          >
            {busy === 'schedule' ? '…' : 'schedule for approval'}
          </button>
        </section>
      )}

      {previewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-paper-ink/40 p-4">
          <div className="bg-paper border-2 border-paper-ink max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <h3 className="font-bold lowercase">email preview</h3>
            <div className="text-2xs text-paper-muted">subject</div>
            <div className="font-bold text-sm">{subject}</div>
            <div className="text-2xs text-paper-muted mt-4">body</div>
            <pre className="text-xs whitespace-pre-wrap font-sans text-paper-soft border border-paper-edge p-4">{body}</pre>
            <div className="flex gap-3 justify-end">
              <button type="button" onClick={() => setPreviewOpen(false)} className="text-xs text-paper-muted">close</button>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => void handleSaveDraftAndPreview()}
                className="border-2 border-paper-ink px-3 py-1.5 text-xs font-bold"
              >
                confirm preview &amp; continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function ComposePanel() {
  return (
    <Suspense fallback={<div className="py-12 text-paper-muted italic">// loading…</div>}>
      <ComposePanelInner />
    </Suspense>
  );
}
