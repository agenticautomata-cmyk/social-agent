'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { clientApiUrl } from '@/lib/client-api';
import { humanizeCategoryLabel } from '@/lib/category-label';

type PartnershipRow = {
  id: string;
  title: string;
  brandName: string | null;
  retailerName: string | null;
  pipelineStatus: string;
  fitScore: number | null;
  researchStatus: string;
  monetizationPaths: string[];
  updatedAt: string;
};

export function PartnershipsPanel() {
  const [rows, setRows] = useState<PartnershipRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitUrl, setSubmitUrl] = useState('');
  const [submitNote, setSubmitNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(clientApiUrl('/api/creator-partnerships?limit=40'), { cache: 'no-store' });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'load_failed');
      setRows(data.partnerships ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load partnerships');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!submitUrl.trim() && !submitNote.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(clientApiUrl('/api/creator-partnerships/submit'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: submitUrl.trim() || undefined,
          text: submitNote.trim() || undefined,
          sourceScreen: 'partnerships_hub',
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'submit_failed');
      setSubmitUrl('');
      setSubmitNote('');
      await load();
      if (data.partnership?.id) {
        window.location.href = `/partnerships/${data.partnership.id}`;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="glass-panel p-4 space-y-3">
        <p className="text-sm font-semibold">Submit a brand, product, or URL</p>
        <input
          type="url"
          value={submitUrl}
          onChange={(e) => setSubmitUrl(e.target.value)}
          placeholder="https://…"
          className="input w-full text-sm"
        />
        <textarea
          value={submitNote}
          onChange={(e) => setSubmitNote(e.target.value)}
          placeholder="Optional note — creator program, campaign angle, etc."
          className="input w-full text-sm min-h-[72px]"
        />
        <button type="submit" disabled={submitting} className="btn-primary text-sm min-h-[40px] px-4">
          {submitting ? 'Researching…' : 'Start partnership research'}
        </button>
      </form>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {loading ? <p className="text-sm text-paper-muted">Loading…</p> : null}

      <div className="space-y-3">
        {rows.map((row) => (
          <Link
            key={row.id}
            href={`/partnerships/${row.id}`}
            className="glass-panel block p-4 hover:border-accent/40 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold leading-snug">{row.title}</p>
                <p className="text-xs text-paper-soft mt-1">
                  {[row.brandName, row.retailerName].filter(Boolean).join(' · ') || 'Creator partnership'}
                </p>
              </div>
              {row.fitScore != null ? (
                <span className="text-xs rounded-full border border-accent/40 px-2 py-1 text-accent whitespace-nowrap">
                  Fit {row.fitScore}
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2 mt-2 text-2xs">
              <span className="rounded-full border border-paper-edge px-2 py-0.5 capitalize">
                {row.pipelineStatus.replace(/_/g, ' ')}
              </span>
              <span className="rounded-full border border-paper-edge px-2 py-0.5">
                {humanizeCategoryLabel('creator_partnership') ?? 'Creator partnership'}
              </span>
              {row.researchStatus === 'researching' || row.researchStatus === 'queued' ? (
                <span className="rounded-full border border-yellow-500/40 text-yellow-300 px-2 py-0.5">
                  Researching…
                </span>
              ) : null}
            </div>
          </Link>
        ))}
        {!loading && rows.length === 0 ? (
          <p className="text-sm text-paper-muted">No creator partnerships yet. Submit a brand or URL above.</p>
        ) : null}
      </div>
    </div>
  );
}
