'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { clientApiUrl } from '../../lib/client-api';

type Asset = {
  id: string;
  role: string;
  publicUseState: string;
  displayStatus?: string;
  originalFilename: string | null;
  caption: string | null;
  thumbUrl: string | null;
  webUrl: string | null;
  createdAt: string;
  assignments?: Array<{ mediaKitId: string; placement: string }>;
};

const ROLE_OPTIONS = [
  { value: 'headshot', label: 'Headshot' },
  { value: 'lifestyle', label: 'Lifestyle' },
  { value: 'hero', label: 'Brand/logo' },
  { value: 'proof_still', label: 'Work/sample' },
  { value: 'other', label: 'Other' },
] as const;

const ASSIGN_TARGETS = [
  { value: 'hotel', label: 'Hotel' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'destination', label: 'Destination' },
  { value: 'all', label: 'All applicable kits' },
  { value: 'unassigned', label: 'Approved but unassigned' },
] as const;

export function CreatorAssetsPanel() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<string>('headshot');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [assignForId, setAssignForId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(clientApiUrl('/api/creator-assets'));
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setAssets(data.assets ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onUpload(file: File) {
    setError(null);
    const form = new FormData();
    form.append('image', file);
    form.append('role', role);
    form.append('requestPublicUse', 'true');
    form.append('source', 'creator_assets_ui');
    const res = await fetch(clientApiUrl('/api/creator-assets'), { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Upload failed');
      return;
    }
    await load();
  }

  async function act(id: string, path: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(clientApiUrl(`/api/creator-assets/${id}/${path}`), { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Action failed');
      if (path === 'approve-public-use') {
        setAssignForId(id);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  }

  async function updateRole(id: string, nextRole: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(clientApiUrl(`/api/creator-assets/${id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: nextRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Role update failed');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Role update failed');
    } finally {
      setBusyId(null);
    }
  }

  async function assignTarget(id: string, target: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(clientApiUrl(`/api/creator-assets/${id}/assign-target`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Assignment failed');
      setAssignForId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Assignment failed');
    } finally {
      setBusyId(null);
    }
  }

  const preview = assets.find((a) => a.id === previewId) ?? null;

  return (
    <div className="space-y-6 max-w-xl mx-auto px-4 pb-24">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Creator Assets</h1>
        <p className="text-sm text-paper-muted leading-relaxed">
          Photos stay private until you approve public use, then you choose which kits they belong
          in. Nothing is added to a media kit silently.
        </p>
        <Link href="/media-kits" className="text-xs underline text-paper-muted">
          Open Media Kit Library →
        </Link>
      </header>

      <section className="space-y-3 border-t border-paper-border pt-4">
        <label className="block text-sm font-medium">Role for next upload</label>
        <select
          className="w-full rounded-md border border-paper-border bg-transparent px-3 py-2 text-sm"
          value={role}
          onChange={(e) => setRole(e.target.value)}
        >
          {ROLE_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <label className="flex items-center justify-center rounded-md border border-dashed border-paper-border px-4 py-8 text-sm cursor-pointer hover:bg-paper-muted/10">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onUpload(file);
              e.target.value = '';
            }}
          />
          Tap to upload a photo
        </label>
      </section>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {loading ? <p className="text-sm text-paper-muted">Loading…</p> : null}

      <ul className="space-y-4">
        {assets.map((asset) => (
          <li key={asset.id} className="flex gap-3 items-start border-b border-paper-border pb-4">
            <button
              type="button"
              className="shrink-0"
              onClick={() => setPreviewId(asset.id)}
              aria-label="Preview photo"
            >
              {asset.thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={clientApiUrl(asset.thumbUrl)}
                  alt={asset.caption || asset.originalFilename || 'Creator asset'}
                  className="h-20 w-20 object-cover rounded-sm bg-paper-muted/20"
                />
              ) : (
                <div className="h-20 w-20 rounded-sm bg-paper-muted/20" />
              )}
            </button>
            <div className="flex-1 min-w-0 space-y-1">
              <p className="text-sm font-medium truncate">
                {asset.originalFilename || 'Photo'}
              </p>
              <p className="text-xs text-paper-muted">
                {asset.displayStatus ?? asset.publicUseState}
              </p>
              <label className="block text-xs text-paper-muted">
                Role
                <select
                  className="mt-1 w-full rounded-md border border-paper-border bg-transparent px-2 py-1"
                  value={asset.role}
                  disabled={busyId === asset.id}
                  onChange={(e) => void updateRole(asset.id, e.target.value)}
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  className="text-xs underline"
                  onClick={() => setPreviewId(asset.id)}
                >
                  Preview
                </button>
                {asset.publicUseState === 'pending_public_use' ||
                asset.publicUseState === 'draft' ? (
                  <>
                    <button
                      type="button"
                      disabled={busyId === asset.id}
                      className="text-xs underline"
                      onClick={() => void act(asset.id, 'approve-public-use')}
                    >
                      Approve public use
                    </button>
                    <button
                      type="button"
                      disabled={busyId === asset.id}
                      className="text-xs underline text-paper-muted"
                      onClick={() => void act(asset.id, 'reject-public-use')}
                    >
                      Reject
                    </button>
                  </>
                ) : null}
                {asset.publicUseState === 'approved_public_use' ? (
                  <button
                    type="button"
                    className="text-xs underline"
                    onClick={() => setAssignForId(asset.id)}
                  >
                    Assign to kits
                  </button>
                ) : null}
              </div>
              {(assignForId === asset.id ||
                (asset.publicUseState === 'approved_public_use' && assignForId === asset.id)) && (
                <div className="pt-2 space-y-2 rounded-md border border-paper-border p-3">
                  <p className="text-xs font-medium">Where should this photo be used?</p>
                  <div className="flex flex-col gap-2">
                    {ASSIGN_TARGETS.map((t) => (
                      <button
                        key={t.value}
                        type="button"
                        disabled={busyId === asset.id}
                        className="text-left text-xs underline"
                        onClick={() => void assignTarget(asset.id, t.value)}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {asset.assignments && asset.assignments.length > 0 ? (
                <p className="text-2xs text-paper-muted pt-1">
                  Assigned to {asset.assignments.length} kit
                  {asset.assignments.length === 1 ? '' : 's'}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {preview ? (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-paper max-w-lg w-full rounded-md p-4 space-y-3">
            <div className="flex justify-between items-center">
              <h2 className="text-sm font-semibold">Preview</h2>
              <button type="button" className="text-xs underline" onClick={() => setPreviewId(null)}>
                Close
              </button>
            </div>
            {preview.webUrl || preview.thumbUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={clientApiUrl(preview.webUrl || preview.thumbUrl!)}
                alt={preview.originalFilename || 'Preview'}
                className="w-full max-h-[70vh] object-contain"
              />
            ) : null}
            <p className="text-xs text-paper-muted">
              {preview.displayStatus ?? preview.publicUseState} · {preview.role}
            </p>
          </div>
        </div>
      ) : null}

      {!loading && assets.length === 0 ? (
        <p className="text-sm text-paper-muted">
          No photos yet. Upload from here or Ask Benson — then approve before any kit uses them.
        </p>
      ) : null}
    </div>
  );
}
