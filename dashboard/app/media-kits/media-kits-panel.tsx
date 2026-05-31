'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { MediaKitRecord } from '../../lib/sponsor-outreach-types';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function MediaKitsPanel() {
  const [kits, setKits] = useState<MediaKitRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    targetAudience: '',
    fileUrl: '',
    version: '1.0',
  });

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
    const res = await fetch(`${API}/api/media-kits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        description: form.description || null,
        targetAudience: form.targetAudience || null,
        fileUrl: form.fileUrl || null,
        version: form.version,
      }),
    });
    if (!res.ok) return;
    setShowForm(false);
    setForm({ name: '', description: '', targetAudience: '', fileUrl: '', version: '1.0' });
    void reload();
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-4 text-sm">
        <Link href="/sponsors" className="bracket hover:text-accent">← sponsors</Link>
        <button type="button" onClick={() => setShowForm((v) => !v)} className="bracket hover:text-accent">
          {showForm ? 'cancel' : 'add media kit →'}
        </button>
      </div>

      {error && <div className="border-2 border-accent px-4 py-3 text-sm text-accent">// {error}</div>}

      {showForm && (
        <form onSubmit={(e) => void handleCreate(e)} className="border-2 border-paper-edge p-6 space-y-4 max-w-xl">
          <h2 className="font-bold lowercase">new media kit</h2>
          <p className="text-2xs text-paper-muted">Phase A: paste a manual file URL (Google Drive, Dropbox, etc.)</p>
          {(['name', 'description', 'targetAudience', 'fileUrl', 'version'] as const).map((field) => (
            <label key={field} className="block space-y-1 text-sm">
              <span className="text-2xs uppercase text-paper-muted">{field}</span>
              <input
                required={field === 'name'}
                value={form[field]}
                onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
                className="w-full border border-paper-edge px-2 py-1.5 bg-paper"
              />
            </label>
          ))}
          <button type="submit" className="border-2 border-paper-ink px-4 py-2 text-xs font-bold hover:bg-paper-ink hover:text-paper">
            save kit
          </button>
        </form>
      )}

      {loading && <div className="py-12 text-paper-muted italic text-center">// loading…</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {kits.map((kit) => (
          <article key={kit.id} className="border-2 border-paper-edge p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-bold lowercase">{kit.name.toLowerCase()}</h3>
              <span className="text-2xs text-paper-muted">v{kit.version}</span>
            </div>
            {kit.description && <p className="text-xs text-paper-soft">{kit.description}</p>}
            {kit.targetAudience && (
              <p className="text-2xs text-paper-muted">audience: {kit.targetAudience}</p>
            )}
            {kit.fileUrl ? (
              <a href={kit.fileUrl} target="_blank" rel="noopener noreferrer" className="link text-xs break-all">
                {kit.fileUrl}
              </a>
            ) : (
              <p className="text-2xs text-paper-dim italic">no file URL</p>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
