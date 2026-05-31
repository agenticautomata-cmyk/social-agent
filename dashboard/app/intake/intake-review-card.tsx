'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { ShareIntakeSubmission } from '../../lib/api';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function IntakeReviewCard({
  intake,
  idx,
}: {
  intake: ShareIntakeSubmission;
  idx: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);

  async function approve() {
    setBusy('approve');
    setError(null);
    try {
      const res = await fetch(`${API}/api/intake/${intake.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewedBy: 'kellie-dashboard' }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.message ?? body.error ?? `${res.status}`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approve failed');
    } finally {
      setBusy(null);
    }
  }

  async function reject() {
    setBusy('reject');
    setError(null);
    try {
      const res = await fetch(`${API}/api/intake/${intake.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewedBy: 'kellie-dashboard', reason: rejectReason || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? body.error ?? `${res.status}`);
      }
      setShowReject(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reject failed');
    } finally {
      setBusy(null);
    }
  }

  const confidence =
    intake.confidenceScore != null ? `${Math.round(parseFloat(intake.confidenceScore) * 100)}%` : '—';

  return (
    <div className="border-t-2 border-paper-ink first:border-t-2 last:border-b-2 py-6">
      <div className="flex items-baseline justify-between gap-6 mb-4">
        <div className="flex items-baseline gap-3 flex-wrap">
          <span className="text-paper-muted text-sm tabular-nums">{(idx + 1).toString().padStart(2, '0')}.</span>
          <h3 className="text-xl font-bold lowercase">
            {(intake.extractedTitle ?? 'untitled share').toLowerCase()}
          </h3>
        </div>
        <div className="text-2xs text-paper-muted tabular-nums whitespace-nowrap">
          {new Date(intake.submittedAt).toLocaleString()}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-2xs text-paper-muted mb-5">
        <span>intake={intake.intakeType}</span>
        <span>source={intake.sourceType}</span>
        <span>confidence={confidence}</span>
        <span>by={intake.submittedBy}</span>
      </div>

      <p className="text-2xs text-paper-muted mb-4 italic">// Benson · stub extraction (no OpenAI yet)</p>

      <dl className="space-y-3 mb-6 text-sm grid gap-3">
        {intake.aiSummary && (
          <div>
            <dt className="text-2xs uppercase text-paper-muted">benson summary</dt>
            <dd className="mt-1">{intake.aiSummary}</dd>
          </div>
        )}
        {intake.extractedCategory && (
          <div>
            <dt className="text-2xs uppercase text-paper-muted">category</dt>
            <dd className="mt-1">{intake.extractedCategory}</dd>
          </div>
        )}
        {intake.extractedLocation && (
          <div>
            <dt className="text-2xs uppercase text-paper-muted">location</dt>
            <dd className="mt-1">{intake.extractedLocation}</dd>
          </div>
        )}
        {intake.extractedBusiness && (
          <div>
            <dt className="text-2xs uppercase text-paper-muted">business</dt>
            <dd className="mt-1">{intake.extractedBusiness}</dd>
          </div>
        )}
        {intake.extractedDate && (
          <div>
            <dt className="text-2xs uppercase text-paper-muted">date</dt>
            <dd className="mt-1">{new Date(intake.extractedDate).toLocaleString()}</dd>
          </div>
        )}
        {intake.originalUrl && (
          <div>
            <dt className="text-2xs uppercase text-paper-muted">url</dt>
            <dd className="mt-1">
              <a href={intake.originalUrl} className="link break-all" target="_blank" rel="noreferrer">
                {intake.originalUrl}
              </a>
            </dd>
          </div>
        )}
        {intake.rawText && (
          <div>
            <dt className="text-2xs uppercase text-paper-muted">submitted text</dt>
            <dd className="mt-1 whitespace-pre-wrap text-paper-muted">{intake.rawText}</dd>
          </div>
        )}
        {intake.notes && (
          <div>
            <dt className="text-2xs uppercase text-paper-muted">notes</dt>
            <dd className="mt-1 whitespace-pre-wrap">{intake.notes}</dd>
          </div>
        )}
        {intake.uploadedImagePath && (
          <div>
            <dt className="text-2xs uppercase text-paper-muted">image</dt>
            <dd className="mt-1 text-2xs break-all">{intake.uploadedImagePath}</dd>
          </div>
        )}
        {Boolean(intake.clientMetadata?.imagePlaceholder) && !intake.uploadedImagePath && (
          <div>
            <dt className="text-2xs uppercase text-paper-muted">image</dt>
            <dd className="mt-1 text-paper-muted italic">placeholder flagged — upload in Phase B</dd>
          </div>
        )}
      </dl>

      {error && <p className="text-accent text-sm mb-4">// {error}</p>}

      <div className="flex flex-wrap gap-4 items-center">
        <button
          type="button"
          onClick={approve}
          disabled={busy !== null}
          className="bracket px-5 py-2 bg-paper-ink text-paper font-bold disabled:opacity-50"
        >
          {busy === 'approve' ? 'approving…' : 'approve → opportunity'}
        </button>
        {!showReject ? (
          <button
            type="button"
            onClick={() => setShowReject(true)}
            disabled={busy !== null}
            className="bracket px-5 py-2 text-paper-muted hover:text-paper-ink disabled:opacity-50"
          >
            reject
          </button>
        ) : (
          <div className="flex flex-wrap gap-2 items-center">
            <input
              type="text"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="optional reason"
              className="border border-paper-edge px-2 py-1 text-sm"
            />
            <button
              type="button"
              onClick={reject}
              disabled={busy !== null}
              className="bracket px-4 py-1 text-accent"
            >
              confirm reject
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
