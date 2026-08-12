'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { ImportResult } from '../../../lib/creator-analytics-types';
import { clientApiUrl, clientApiUploadUrl } from '../../../lib/client-api';

type ImportTab = 'csv' | 'json' | 'manual';

export function AnalyticsImportPanel() {
  const [tab, setTab] = useState<ImportTab>('csv');
  const [csvText, setCsvText] = useState('');
  const [jsonText, setJsonText] = useState('[\n  {\n    "video_id": "example_001",\n    "published_at": "2026-05-01T18:00:00Z",\n    "views": 10000\n  }\n]');
  const [manual, setManual] = useState({
    video_id: '',
    title: '',
    caption: '',
    post_url: '',
    published_at: '',
    content_category: '',
    content_pillar: '',
    location_tag: '',
    sponsor_tag: '',
    views: '',
    likes: '',
    comments: '',
    shares: '',
    saves: '',
  });
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitCsv(file?: File) {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      let res: Response;
      if (file) {
        const form = new FormData();
        form.append('file', file);
        res = await fetch(clientApiUploadUrl('/api/analytics/import/csv'), { method: 'POST', body: form });
      } else {
        res = await fetch(clientApiUrl('/api/analytics/import/csv'), {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: csvText,
        });
      }
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      setResult((await res.json()) as ImportResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setLoading(false);
    }
  }

  async function submitJson() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const parsed = JSON.parse(jsonText) as unknown;
      const res = await fetch(clientApiUrl('/api/analytics/import/json'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: 'tiktok', username: 'kelliekc', videos: parsed }),
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      setResult((await res.json()) as ImportResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'JSON import failed');
    } finally {
      setLoading(false);
    }
  }

  async function submitManual() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const num = (v: string) => (v.trim() ? parseInt(v, 10) : undefined);
      const res = await fetch(clientApiUrl('/api/analytics/import/manual'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: 'tiktok',
          username: 'kelliekc',
          video: {
            video_id: manual.video_id,
            title: manual.title || null,
            caption: manual.caption || null,
            post_url: manual.post_url || null,
            published_at: manual.published_at,
            content_category: manual.content_category || null,
            content_pillar: manual.content_pillar || null,
            location_tag: manual.location_tag || null,
            sponsor_tag: manual.sponsor_tag || null,
            views: num(manual.views),
            likes: num(manual.likes),
            comments: num(manual.comments),
            shares: num(manual.shares),
            saves: num(manual.saves),
          },
        }),
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      setResult((await res.json()) as ImportResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Manual import failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex gap-4 text-sm">
        {(['csv', 'json', 'manual'] as ImportTab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`bracket ${tab === t ? 'text-paper-ink font-bold' : 'text-paper-muted'}`}
          >
            {t}
          </button>
        ))}
        <a
          href={clientApiUrl('/api/analytics/import/template')}
          className="bracket text-paper-muted hover:text-paper-ink ml-auto"
        >
          download csv template →
        </a>
      </div>

      {tab === 'csv' && (
        <div className="space-y-4">
          <label className="block space-y-2">
            <span className="text-xs text-paper-muted">paste csv</span>
            <textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              rows={10}
              className="w-full border-2 border-paper-edge p-3 text-xs font-mono bg-paper"
              placeholder="video_id,published_at,views,..."
            />
          </label>
          <label className="block space-y-2">
            <span className="text-xs text-paper-muted">or upload file</span>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void submitCsv(file);
              }}
              className="text-xs"
            />
          </label>
          <button
            type="button"
            disabled={loading || !csvText.trim()}
            onClick={() => void submitCsv()}
            className="border-2 border-paper-ink px-4 py-2 text-sm hover:bg-paper-ink hover:text-paper disabled:opacity-40"
          >
            {loading ? 'importing...' : 'import csv'}
          </button>
        </div>
      )}

      {tab === 'json' && (
        <div className="space-y-4">
          <textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            rows={14}
            className="w-full border-2 border-paper-edge p-3 text-xs font-mono bg-paper"
          />
          <button
            type="button"
            disabled={loading}
            onClick={() => void submitJson()}
            className="border-2 border-paper-ink px-4 py-2 text-sm hover:bg-paper-ink hover:text-paper disabled:opacity-40"
          >
            {loading ? 'importing...' : 'import json'}
          </button>
        </div>
      )}

      {tab === 'manual' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {(
            [
              ['video_id', 'video_id *'],
              ['published_at', 'published_at * (ISO)'],
              ['title', 'title'],
              ['caption', 'caption'],
              ['post_url', 'post url'],
              ['content_category', 'category'],
              ['content_pillar', 'pillar'],
              ['location_tag', 'location'],
              ['sponsor_tag', 'sponsor'],
              ['views', 'views'],
              ['likes', 'likes'],
              ['comments', 'comments'],
              ['shares', 'shares'],
              ['saves', 'saves'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="space-y-1">
              <span className="text-paper-muted">{label}</span>
              <input
                value={manual[key]}
                onChange={(e) => setManual((m) => ({ ...m, [key]: e.target.value }))}
                className="w-full border border-paper-edge px-2 py-1 bg-paper"
              />
            </label>
          ))}
          <div className="md:col-span-2">
            <button
              type="button"
              disabled={loading || !manual.video_id || !manual.published_at}
              onClick={() => void submitManual()}
              className="border-2 border-paper-ink px-4 py-2 text-sm hover:bg-paper-ink hover:text-paper disabled:opacity-40"
            >
              {loading ? 'saving...' : 'save video'}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-700 border border-red-300 p-3">// {error}</p>
      )}

      {result && (
        <div className="border-2 border-paper-ink p-4 space-y-2 text-sm">
          <div>
            imported: {result.imported} · updated: {result.updated} · skipped: {result.skipped}
          </div>
          {result.errors.length > 0 && (
            <ul className="text-xs text-amber-800 space-y-1">
              {result.errors.slice(0, 10).map((e: { row: number; message: string }) => (
                <li key={`${e.row}-${e.message}`}>
                  row {e.row}: {e.message}
                </li>
              ))}
            </ul>
          )}
          <Link href="/analytics/tiktok" className="bracket text-xs inline-block mt-2 hover:text-accent">
            view tiktok dashboard →
          </Link>
        </div>
      )}
    </div>
  );
}
