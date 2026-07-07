'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { WebsiteNav } from '../../components/website-nav';
import { clientApiUrl } from '../../lib/client-api';
import type { WebsiteDraftRecord, WebsiteMediaRecord } from '../../lib/website-types';
import { draftStatusClass, draftStatusLabel } from '../../lib/website-types';

export function WebsiteHubPanel() {
  const [media, setMedia] = useState<WebsiteMediaRecord[]>([]);
  const [drafts, setDrafts] = useState<WebsiteDraftRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [mediaRes, draftsRes] = await Promise.all([
        fetch(clientApiUrl('/api/website/media'), { cache: 'no-store' }),
        fetch(clientApiUrl('/api/website/drafts'), { cache: 'no-store' }),
      ]);
      if (!mediaRes.ok || !draftsRes.ok) throw new Error('Failed to load website data');
      const mediaData = (await mediaRes.json()) as { media: WebsiteMediaRecord[] };
      const draftsData = (await draftsRes.json()) as { drafts: WebsiteDraftRecord[] };
      setMedia(mediaData.media);
      setDrafts(draftsData.drafts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pending = drafts.filter((d) => d.status === 'draft').length;
  const approved = drafts.filter((d) => d.status === 'approved').length;
  const published = drafts.filter((d) => d.status === 'published').length;

  return (
    <div>
      <header className="mb-6">
        <p className="text-sm font-medium text-rose-600">Website Manager</p>
        <h1 className="text-2xl font-bold text-neutral-900">kckellie.com</h1>
        <p className="mt-1 text-neutral-600 max-w-2xl">
          Upload media, review Benson&apos;s draft placements, and publish approved content to controlled
          sections — nothing goes live without your approval.
        </p>
      </header>

      <WebsiteNav />

      {error ? (
        <p className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {[
          { label: 'Uploaded media', value: media.length },
          { label: 'Awaiting review', value: pending },
          { label: 'Approved', value: approved },
          { label: 'Published', value: published },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-neutral-200 bg-white p-4">
            <p className="text-sm text-neutral-500">{stat.label}</p>
            <p className="text-2xl font-bold text-neutral-900">{loading ? '…' : stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-neutral-200 bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-neutral-900">Quick actions</h2>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/website/media"
              className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
            >
              Upload media
            </Link>
            <Link
              href="/website/drafts"
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
            >
              Review drafts
            </Link>
            <a
              href={process.env.NEXT_PUBLIC_PUBLIC_SITE_URL ?? 'https://kckellie.com'}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
            >
              View public site
            </a>
          </div>
        </section>

        <section className="rounded-xl border border-neutral-200 bg-white p-5">
          <h2 className="font-semibold text-neutral-900 mb-4">Recent drafts</h2>
          {loading ? (
            <p className="text-sm text-neutral-500">Loading…</p>
          ) : drafts.length === 0 ? (
            <p className="text-sm text-neutral-500">No drafts yet — upload media to get started.</p>
          ) : (
            <ul className="space-y-3">
              {drafts.slice(0, 5).map((draft) => (
                <li key={draft.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-neutral-900">{draft.title}</p>
                    <p className="text-xs text-neutral-500">{draft.sectionLabel}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${draftStatusClass(draft.status)}`}
                  >
                    {draftStatusLabel(draft.status)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
