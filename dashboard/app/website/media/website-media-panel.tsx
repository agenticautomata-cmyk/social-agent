'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { WebsiteNav } from '../../../components/website-nav';
import { WebsiteDraftPreview } from '../../../components/website-draft-preview';
import { WebsiteBensonRevise } from '../../../components/website-benson-revise';
import { clientApiLongRunningUrl, clientApiUrl, sleep } from '../../../lib/client-api';
import type { WebsiteDraftRecord, WebsiteMediaRecord } from '../../../lib/website-types';
import { formatWebsiteFileSize } from '../../../lib/website-types';
import { resolveWebsiteFileUrl, websiteTitleClass } from '../../../lib/website-ui';

const ACCEPT = '.jpg,.jpeg,.png,.webp,.mp4,.mov,.webm,image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm';

export function WebsiteMediaPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [media, setMedia] = useState<WebsiteMediaRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastDraft, setLastDraft] = useState<WebsiteDraftRecord | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(clientApiUrl('/api/website/media'), { cache: 'no-store' });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = (await res.json()) as { media: WebsiteMediaRecord[] };
      setMedia(data.media);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load media');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

  async function pollAnalysisJob(jobId: string): Promise<WebsiteDraftRecord> {
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      const res = await fetch(clientApiLongRunningUrl(`/api/website/media/analysis-jobs/${jobId}`), {
        cache: 'no-store',
      });
      const data = (await res.json()) as {
        ok: boolean;
        job?: {
          status: string;
          draft: WebsiteDraftRecord | null;
          error: string | null;
        };
      };
      if (!res.ok || !data.ok || !data.job) throw new Error('Analysis status check failed');
      if (data.job.status === 'failed') throw new Error(data.job.error ?? 'Analysis failed');
      if (data.job.status === 'complete' && data.job.draft) return data.job.draft;
      setUploadStatus('Benson is analyzing your image…');
      await sleep(2000);
    }
    throw new Error('Analysis is taking longer than usual — check Drafts in a moment.');
  }

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    setLastDraft(null);
    setUploadStatus('Uploading…');
    try {
      const body = new FormData();
      body.set('file', file);
      body.set('uploadedBy', 'kellie');
      const res = await fetch(clientApiLongRunningUrl('/api/website/media'), { method: 'POST', body });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        jobId?: string;
        draft?: WebsiteDraftRecord;
        analysisPending?: boolean;
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Upload failed');

      if (data.jobId && data.analysisPending) {
        const draft = await pollAnalysisJob(data.jobId);
        setLastDraft(draft);
      } else {
        setLastDraft(data.draft ?? null);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      setUploadStatus(null);
    }
  }

  return (
    <div>
      <header className="mb-6">
        <p className="text-sm font-medium text-rose-600">Website Manager</p>
        <h1 className="text-2xl font-bold text-neutral-900">Media library</h1>
        <p className="mt-1 text-neutral-600">
          Upload photos and videos. Benson analyzes each upload and creates a website draft for your review.
        </p>
      </header>

      <WebsiteNav />

      <div className="mb-6 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-6 text-center">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleUpload(file);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {uploading ? 'Uploading & analyzing…' : 'Choose photo or video'}
        </button>
        {uploadStatus ? <p className="mt-2 text-sm text-neutral-600">{uploadStatus}</p> : null}
        <p className="mt-2 text-xs text-neutral-500">JPG, PNG, WEBP · MP4, MOV, WEBM · max size in Settings</p>
      </div>

      {error ? (
        <p className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>
      ) : null}

      {lastDraft ? (
        <section className="mb-8 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <h2 className="font-semibold text-emerald-900 mb-1">Benson created a draft</h2>
          <p className="text-sm text-emerald-800 mb-4">
            Review Benson&apos;s recommendation, then approve or edit before publishing.
          </p>
          <div className="grid gap-6 lg:grid-cols-2">
            <WebsiteDraftPreview draft={lastDraft} />
            <div className="space-y-3 text-sm">
              <div>
                <p className="font-medium text-neutral-900">Content type</p>
                <p className="text-neutral-700">{lastDraft.media?.aiContentType ?? '—'}</p>
              </div>
              <div>
                <p className="font-medium text-neutral-900">Suggested placement</p>
                <p className="text-neutral-700">{lastDraft.media?.aiSuggestedPlacement ?? '—'}</p>
              </div>
              <div>
                <p className="font-medium text-neutral-900">Section</p>
                <p className="text-neutral-700">{lastDraft.sectionLabel}</p>
              </div>
              {lastDraft.bensonReasoning ? (
                <div>
                  <p className="font-medium text-neutral-900">Benson says</p>
                  <p className="text-neutral-700">{lastDraft.bensonReasoning}</p>
                </div>
              ) : null}
              <Link
                href="/website/drafts"
                className="inline-block rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
              >
                Review draft
              </Link>
            </div>
          </div>
          <div className="mt-6">
            <WebsiteBensonRevise
              draftId={lastDraft.id}
              draft={lastDraft}
              onRevised={(draft) => setLastDraft(draft)}
            />
          </div>
        </section>
      ) : null}

      <h2 className="font-semibold text-neutral-900 mb-4">All uploads</h2>
      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : media.length === 0 ? (
        <p className="text-sm text-neutral-500">No media uploaded yet.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {media.map((item) => {
            const preview = resolveWebsiteFileUrl(
              item.thumbnailUrl ?? (item.mediaKind === 'image' ? item.fileUrl : null),
            );
            return (
              <article
                key={item.id}
                className="rounded-xl border border-neutral-200 bg-white overflow-hidden"
              >
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt={item.aiAltText ?? item.originalFilename} className="h-40 w-full object-cover" />
                ) : (
                  <div className="flex h-40 items-center justify-center bg-neutral-100 text-sm text-neutral-500">
                    Video (metadata only on public site)
                  </div>
                )}
                <div className="p-4 space-y-2">
                  <p className="truncate text-sm font-medium text-neutral-900">{item.originalFilename}</p>
                  <p className="text-xs text-neutral-500">
                    {formatWebsiteFileSize(item.fileSize)} · {item.mediaKind} · {item.aiContentType ?? 'uncategorized'}
                  </p>
                  {item.aiCaption ? <p className="text-xs text-neutral-600 line-clamp-2">{item.aiCaption}</p> : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
