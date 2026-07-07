'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { EquipmentNav } from '../../../components/equipment-nav';
import { clientApiUrl } from '../../../lib/client-api';
import type { EquipmentReferenceVideoRecord } from '../../../lib/equipment-types';
import { websitePanelClass, websiteTitleClass } from '../../../lib/website-ui';

function usefulForLabels(video: EquipmentReferenceVideoRecord): string {
  return [
    video.usefulForChecklist ? 'checklist' : null,
    video.usefulForTroubleshooting ? 'troubleshooting' : null,
    video.usefulForTraining ? 'training' : null,
  ]
    .filter(Boolean)
    .join(', ');
}

export function EquipmentReferenceVideosPanel() {
  const [videos, setVideos] = useState<EquipmentReferenceVideoRecord[]>([]);
  const [filterSlug, setFilterSlug] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [updatingSlug, setUpdatingSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(clientApiUrl('/api/equipment/reference-videos'), { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load reference videos');
      const data = (await res.json()) as { videos: EquipmentReferenceVideoRecord[] };
      setVideos(data.videos);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const equipmentOptions = useMemo(() => {
    const names = new Map<string, string>();
    for (const v of videos) {
      if (v.equipmentSlug && v.equipmentName) names.set(v.equipmentSlug, v.equipmentName);
    }
    return [...names.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [videos]);

  const filtered = useMemo(() => {
    if (filterSlug === 'all') return videos;
    return videos.filter((v) => v.equipmentSlug === filterSlug);
  }, [videos, filterSlug]);

  async function runSeed() {
    setSeeding(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(clientApiUrl('/api/equipment/reference-videos/seed'), { method: 'POST' });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        result?: { inserted: number; updated: number };
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Seed failed');
      setMessage(
        `Reference videos synced — ${data.result?.inserted ?? 0} new, ${data.result?.updated ?? 0} updated.`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Seed failed');
    } finally {
      setSeeding(false);
    }
  }

  async function toggleWatched(slug: string, watched: boolean) {
    setUpdatingSlug(slug);
    setError(null);
    try {
      const res = await fetch(clientApiUrl(`/api/equipment/reference-videos/${slug}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ watchedByKellie: watched }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string; video?: EquipmentReferenceVideoRecord };
      if (!res.ok || !data.ok || !data.video) throw new Error(data.error ?? 'Update failed');
      setVideos((prev) => prev.map((v) => (v.slug === slug ? data.video! : v)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setUpdatingSlug(null);
    }
  }

  return (
    <div>
      <header className="mb-6">
        <p className="text-sm font-medium text-rose-600">Gear Coach</p>
        <h1 className={websiteTitleClass}>Reference videos</h1>
        <p className="mt-1 text-paper-muted">
          Official PDF manuals are the source of truth for buttons, menus, and specs. YouTube and DJI tutorial
          pages are practical demos Benson can suggest alongside manual answers.
        </p>
      </header>

      <EquipmentNav />

      {error ? <p className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p> : null}
      {message ? (
        <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</p>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-paper-muted">
          Equipment
          <select
            className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-800"
            value={filterSlug}
            onChange={(e) => setFilterSlug(e.target.value)}
          >
            <option value="all">All gear</option>
            {equipmentOptions.map(([slug, name]) => (
              <option key={slug} value={slug}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={seeding}
          onClick={() => void runSeed()}
          className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-50"
        >
          {seeding ? 'Syncing…' : 'Sync reference videos'}
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className={websitePanelClass}>
          <p className="text-sm text-paper-muted">
            No reference videos yet. Click &ldquo;Sync reference videos&rdquo; to load the Osmo Mobile 8 and LARK M2
            library.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-600">
              <tr>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Equipment</th>
                <th className="px-4 py-3 font-medium">Channel</th>
                <th className="px-4 py-3 font-medium">URL</th>
                <th className="px-4 py-3 font-medium">Tags</th>
                <th className="px-4 py-3 font-medium">Notes</th>
                <th className="px-4 py-3 font-medium">Priority</th>
                <th className="px-4 py-3 font-medium">Watched</th>
                <th className="px-4 py-3 font-medium">Useful for</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filtered.map((video) => (
                <tr key={video.id} className="align-top">
                  <td className="px-4 py-3 font-medium text-paper-ink">{video.title}</td>
                  <td className="px-4 py-3 text-paper-muted">{video.equipmentName ?? '—'}</td>
                  <td className="px-4 py-3 text-paper-muted">{video.sourceChannel}</td>
                  <td className="px-4 py-3">
                    <a
                      href={video.referenceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:underline"
                    >
                      {video.referenceKind === 'youtube' ? 'YouTube' : 'Web'}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-paper-muted">
                    <div className="flex max-w-[12rem] flex-wrap gap-1">
                      {video.topicTags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-700"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="max-w-xs px-4 py-3 text-paper-muted">{video.notes ?? '—'}</td>
                  <td className="px-4 py-3 text-paper-muted">{video.priority}</td>
                  <td className="px-4 py-3">
                    <label className="inline-flex items-center gap-2 text-paper-muted">
                      <input
                        type="checkbox"
                        checked={video.watchedByKellie}
                        disabled={updatingSlug === video.slug}
                        onChange={(e) => void toggleWatched(video.slug, e.target.checked)}
                      />
                      {video.watchedByKellie ? 'Yes' : 'No'}
                    </label>
                  </td>
                  <td className="px-4 py-3 text-paper-muted">{usefulForLabels(video) || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
