'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { BensonChatPanel } from '../../components/benson-chat-panel';
import {
  ASK_BENSON_MEDIA_KIT_REVIEW_PROMPT,
  formatFileSize,
} from '../../lib/ask-benson-types';
import type { MediaKitRecord } from '../../lib/sponsor-outreach-types';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const ACCEPT =
  '.pdf,.docx,.png,.jpg,.jpeg,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg';

type FormState = {
  name: string;
  description: string;
  targetAudience: string;
  fileUrl: string;
  version: string;
};

const EMPTY_FORM: FormState = {
  name: '',
  description: '',
  targetAudience: '',
  fileUrl: '',
  version: '1.0',
};

function kitFileLabel(kit: MediaKitRecord): string {
  if (kit.originalFilename) return kit.originalFilename;
  if (kit.fileUrl) {
    try {
      const url = new URL(kit.fileUrl);
      return url.pathname.split('/').pop() ?? kit.fileUrl;
    } catch {
      return kit.fileUrl;
    }
  }
  return 'no file';
}

export function MediaKitsPanel() {
  const [kits, setKits] = useState<MediaKitRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [file, setFile] = useState<File | null>(null);
  const [reviewKit, setReviewKit] = useState<MediaKitRecord | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    return fetch(`${API}/api/media-kits`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json() as Promise<{ kits: MediaKitRecord[] }>;
      })
      .then((data) => setKits(data.kits))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      let res: Response;

      if (file) {
        const body = new FormData();
        body.set('name', form.name.trim());
        body.set('description', form.description);
        body.set('targetAudience', form.targetAudience);
        body.set('version', form.version);
        if (form.fileUrl.trim()) body.set('fileUrl', form.fileUrl.trim());
        body.set('file', file);

        res = await fetch(`${API}/api/media-kits`, { method: 'POST', body });
      } else {
        res = await fetch(`${API}/api/media-kits`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name.trim(),
            description: form.description || null,
            targetAudience: form.targetAudience || null,
            fileUrl: form.fileUrl.trim() || null,
            version: form.version,
          }),
        });
      }

      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(typeof json?.error === 'string' ? json.error : `${res.status}`);
      }

      setShowForm(false);
      setForm(EMPTY_FORM);
      setFile(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save media kit');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(kit: MediaKitRecord) {
    if (!window.confirm(`Delete "${kit.name}"? This cannot be undone.`)) return;

    setDeletingId(kit.id);
    setError(null);
    try {
      const res = await fetch(`${API}/api/media-kits/${kit.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`${res.status}`);
      if (reviewKit?.id === kit.id) setReviewKit(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4 text-sm">
        <Link href="/sponsors" className="bracket hover:text-accent">
          ← sponsors
        </Link>
        <button type="button" onClick={() => setShowForm((v) => !v)} className="bracket hover:text-accent">
          {showForm ? 'cancel' : 'add media kit →'}
        </button>
      </div>

      {error && (
        <div className="border-2 border-accent px-4 py-3 text-sm text-accent">// {error}</div>
      )}

      {showForm && (
        <form onSubmit={(e) => void handleCreate(e)} className="border-2 border-paper-edge p-6 space-y-4 max-w-xl">
          <h2 className="font-bold lowercase">new media kit</h2>
          <p className="text-2xs text-paper-muted">
            Upload a PDF, DOCX, PNG, or JPG (max 10MB) — or paste an external file URL.
          </p>

          <label className="block space-y-1 text-sm">
            <span className="text-2xs uppercase text-paper-muted">name</span>
            <input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full border border-paper-edge px-2 py-1.5 bg-paper"
            />
          </label>

          {(['description', 'targetAudience', 'version'] as const).map((field) => (
            <label key={field} className="block space-y-1 text-sm">
              <span className="text-2xs uppercase text-paper-muted">{field}</span>
              <input
                value={form[field]}
                onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
                className="w-full border border-paper-edge px-2 py-1.5 bg-paper"
              />
            </label>
          ))}

          <label className="block space-y-1 text-sm">
            <span className="text-2xs uppercase text-paper-muted">upload file</span>
            <input
              type="file"
              accept={ACCEPT}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-xs"
            />
            {file && (
              <span className="text-2xs text-paper-muted">
                {file.name} · {formatFileSize(file.size)}
              </span>
            )}
          </label>

          <label className="block space-y-1 text-sm">
            <span className="text-2xs uppercase text-paper-muted">file url (optional if uploading)</span>
            <input
              value={form.fileUrl}
              onChange={(e) => setForm((f) => ({ ...f, fileUrl: e.target.value }))}
              placeholder="https://drive.google.com/…"
              className="w-full border border-paper-edge px-2 py-1.5 bg-paper"
            />
          </label>

          <button
            type="submit"
            disabled={submitting || (!file && !form.fileUrl.trim())}
            className="border-2 border-paper-ink px-4 py-2 text-xs font-bold hover:bg-paper-ink hover:text-paper disabled:opacity-50"
          >
            {submitting ? 'saving…' : 'save kit'}
          </button>
        </form>
      )}

      {loading && <div className="py-12 text-paper-muted italic text-center">// loading…</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {kits.map((kit) => (
          <article key={kit.id} className="border-2 border-paper-edge p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-bold lowercase">{kit.name.toLowerCase()}</h3>
              <span className="text-2xs text-paper-muted">v{kit.version}</span>
            </div>

            {kit.description && <p className="text-xs text-paper-soft">{kit.description}</p>}
            {kit.targetAudience && (
              <p className="text-2xs text-paper-muted">audience: {kit.targetAudience}</p>
            )}

            <div className="text-2xs text-paper-muted space-y-0.5">
              <p>file: {kitFileLabel(kit)}</p>
              {kit.fileSize != null && <p>size: {formatFileSize(kit.fileSize)}</p>}
              {kit.mimeType && <p>type: {kit.mimeType}</p>}
            </div>

            {kit.fileUrl ? (
              <a
                href={kit.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="link text-xs break-all inline-block"
              >
                open file →
              </a>
            ) : (
              <p className="text-2xs text-paper-dim italic">no file attached</p>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => setReviewKit(kit)}
                className="border border-paper-ink px-3 py-1.5 text-2xs font-bold hover:bg-paper-ink hover:text-paper"
              >
                send to benson →
              </button>
              <button
                type="button"
                onClick={() => void handleDelete(kit)}
                disabled={deletingId === kit.id}
                className="border border-paper-edge px-3 py-1.5 text-2xs text-paper-muted hover:border-accent hover:text-accent disabled:opacity-50"
              >
                {deletingId === kit.id ? 'deleting…' : 'delete'}
              </button>
            </div>
          </article>
        ))}
      </div>

      {reviewKit && (
        <section className="space-y-4 border-t-2 border-paper-edge pt-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold lowercase">benson review — {reviewKit.name.toLowerCase()}</h2>
              <p className="text-xs text-paper-muted mt-1 max-w-2xl">
                Benson reviews metadata and your analytics — not the PDF contents. Ask follow-ups below.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setReviewKit(null)}
              className="text-xs bracket hover:text-accent shrink-0"
            >
              close ×
            </button>
          </div>
          <BensonChatPanel
            variant="page"
            pageContext="media-kit-library"
            mediaKitId={reviewKit.id}
            seedMessage={ASK_BENSON_MEDIA_KIT_REVIEW_PROMPT}
          />
        </section>
      )}
    </div>
  );
}
