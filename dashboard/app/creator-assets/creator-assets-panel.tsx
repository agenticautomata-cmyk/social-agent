'use client';

import { useCallback, useEffect, useState } from 'react';
import { clientApiUrl } from '../../lib/client-api';

type Asset = {
  id: string;
  role: string;
  publicUseState: string;
  originalFilename: string | null;
  caption: string | null;
  thumbUrl: string | null;
  webUrl: string | null;
  createdAt: string;
};

const ROLES = [
  'hero',
  'headshot',
  'proof_still',
  'lifestyle',
  'property',
  'food',
  'event',
  'other',
] as const;

function stateLabel(state: string): string {
  switch (state) {
    case 'draft':
      return 'Draft — not public';
    case 'pending_public_use':
      return 'Waiting for your OK';
    case 'approved_public_use':
      return 'Approved for public kits';
    case 'rejected_public_use':
      return 'Rejected';
    case 'archived':
      return 'Archived';
    default:
      return state;
  }
}

export function CreatorAssetsPanel() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<string>('lifestyle');
  const [busyId, setBusyId] = useState<string | null>(null);

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
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6 max-w-xl mx-auto px-4 pb-24">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Creator Assets</h1>
        <p className="text-sm text-paper-muted leading-relaxed">
          Photos you upload stay private until you approve public use. Nothing is added to a
          media kit silently.
        </p>
      </header>

      <section className="space-y-3 border-t border-paper-border pt-4">
        <label className="block text-sm font-medium">Role for next upload</label>
        <select
          className="w-full rounded-md border border-paper-border bg-transparent px-3 py-2 text-sm"
          value={role}
          onChange={(e) => setRole(e.target.value)}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r.replace('_', ' ')}
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
            <div className="flex-1 min-w-0 space-y-1">
              <p className="text-sm font-medium truncate">
                {asset.originalFilename || 'Photo'} · {asset.role.replace('_', ' ')}
              </p>
              <p className="text-xs text-paper-muted">{stateLabel(asset.publicUseState)}</p>
              <div className="flex flex-wrap gap-2 pt-1">
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
                {asset.publicUseState === 'draft' ? (
                  <button
                    type="button"
                    disabled={busyId === asset.id}
                    className="text-xs underline"
                    onClick={() => void act(asset.id, 'request-public-use')}
                  >
                    Request review
                  </button>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {!loading && assets.length === 0 ? (
        <p className="text-sm text-paper-muted">
          No photos yet. Upload from here or Ask Benson — then approve before any kit uses them.
        </p>
      ) : null}
    </div>
  );
}
