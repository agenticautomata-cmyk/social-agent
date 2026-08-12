'use client';

import { clientApiOrigin } from '../../lib/client-api';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { ShareIntakeSubmission } from '../../lib/api';
import { formatDateTime } from '../../lib/datetime';
import { intakeDisplayTitle } from '../../lib/draft-display';
import { DraftVideoCard } from '../../components/draft-video-card';

const API = clientApiOrigin();

const PROCESSING_LABELS: Record<string, string> = {
  received: 'Received',
  queued: 'Queued',
  extracting_audio: 'Extracting audio',
  transcribing: 'Transcribing',
  analyzing: 'Analyzing',
  ready: 'Ready',
  failed: 'Failed',
  too_large: 'Too large',
};

function isMediaIntake(intake: ShareIntakeSubmission): boolean {
  return intake.intakeType === 'video' || intake.intakeType === 'audio';
}

function mediaProcessing(intake: ShareIntakeSubmission): boolean {
  if (!isMediaIntake(intake)) return false;
  const status = intake.processingStatus;
  return Boolean(status && !['ready', 'failed', 'too_large'].includes(status));
}

export function IntakeReviewCard({
  intake,
  idx,
}: {
  intake: ShareIntakeSubmission;
  idx: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);

  async function postAction(path: string, label: string) {
    setBusy(label);
    setError(null);
    try {
      const res = await fetch(`${API}/api/intake/${intake.id}/${path}`, {
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
      setError(err instanceof Error ? err.message : `${label} failed`);
    } finally {
      setBusy(null);
    }
  }

  async function approve() {
    await postAction('approve', 'approve');
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

  const captions = Array.isArray(intake.captionSuggestionsJson)
    ? (intake.captionSuggestionsJson as Array<{ text?: string; style?: string }>)
    : [];
  const hashtags = Array.isArray(intake.hashtagSuggestionsJson)
    ? (intake.hashtagSuggestionsJson as string[])
    : [];
  const followUps = Array.isArray(intake.followUpIdeasJson)
    ? (intake.followUpIdeasJson as string[])
    : [];

  const showVideoReady = isMediaIntake(intake) && intake.processingStatus === 'ready';
  const showVideoProcessing = mediaProcessing(intake);
  const showTooLarge = intake.processingStatus === 'too_large';
  const displayTitle = intake.displayTitle ?? intakeDisplayTitle(intake);
  const previewUrl = intake.previewUrl
    ? `${API}${intake.previewUrl}`
    : intake.uploadedImageUrl;

  return (
    <div className="border-t-2 border-paper-ink first:border-t-2 last:border-b-2 py-6">
      <div className="flex items-baseline justify-between gap-6 mb-4">
        <div className="flex items-baseline gap-3 flex-wrap">
          <span className="text-paper-muted text-sm tabular-nums">{(idx + 1).toString().padStart(2, '0')}.</span>
          {!isMediaIntake(intake) && !previewUrl && (
            <h3 className="text-xl font-bold lowercase">{displayTitle.toLowerCase()}</h3>
          )}
        </div>
        <div className="text-2xs text-paper-muted tabular-nums whitespace-nowrap">
          {formatDateTime(intake.submittedAt)}
        </div>
      </div>

      {!isMediaIntake(intake) && previewUrl && (
        <DraftVideoCard
          title={displayTitle}
          previewUrl={previewUrl}
          subtitle="shared image"
          compact
          className="mb-5 w-full max-w-md aspect-[9/16] sm:aspect-video"
        />
      )}

      {isMediaIntake(intake) && (
        <DraftVideoCard
          title={displayTitle}
          previewUrl={previewUrl}
          subtitle={
            showVideoProcessing
              ? `Benson is reading this ${intake.intakeType}…`
              : showTooLarge
                ? 'too large to process'
                : intake.processingStatus === 'failed'
                  ? 'processing failed'
                  : 'ready for review'
          }
          compact
          className="mb-5 w-full max-w-md aspect-[9/16] sm:aspect-video"
        />
      )}

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-2xs text-paper-muted mb-5">
        <span>intake={intake.intakeType}</span>
        <span>source={intake.sourceType}</span>
        {intake.processingStatus && <span>processing={intake.processingStatus}</span>}
        <span>confidence={confidence}</span>
        <span>by={intake.submittedBy}</span>
      </div>

      {showVideoProcessing && (
        <p className="text-sm text-paper-muted mb-4 italic">
          // Benson is reading this {intake.intakeType} —{' '}
          {PROCESSING_LABELS[intake.processingStatus ?? ''] ?? intake.processingStatus}
        </p>
      )}

      {showTooLarge && (
        <p className="text-sm text-accent mb-4">
          {intake.processingError ??
            'This video is too large for Benson to process from Share right now. Try trimming it, sending a shorter clip, or sending a voice note describing it.'}
        </p>
      )}

      {intake.processingStatus === 'failed' && intake.processingError && (
        <p className="text-sm text-accent mb-4">// {intake.processingError}</p>
      )}

      {!isMediaIntake(intake) && (
        <p className="text-2xs text-paper-muted mb-4 italic">// Benson · share intake extraction</p>
      )}

      <dl className="space-y-3 mb-6 text-sm grid gap-3">
        {intake.aiSummary && (
          <div>
            <dt className="text-2xs uppercase text-paper-muted">benson summary</dt>
            <dd className="mt-1">{intake.aiSummary}</dd>
          </div>
        )}
        {showVideoReady && intake.transcriptText && (
          <div>
            <dt className="text-2xs uppercase text-paper-muted">transcript</dt>
            <dd className="mt-1 whitespace-pre-wrap text-paper-muted max-h-48 overflow-y-auto">
              {intake.transcriptText}
            </dd>
          </div>
        )}
        {intake.hookSummary && (
          <div>
            <dt className="text-2xs uppercase text-paper-muted">hook</dt>
            <dd className="mt-1">{intake.hookSummary}</dd>
          </div>
        )}
        {intake.contentTheme && (
          <div>
            <dt className="text-2xs uppercase text-paper-muted">theme</dt>
            <dd className="mt-1">{intake.contentTheme}</dd>
          </div>
        )}
        {captions.length > 0 && (
          <div>
            <dt className="text-2xs uppercase text-paper-muted">suggested tiktok caption</dt>
            <dd className="mt-1 whitespace-pre-wrap">{captions[0]?.text}</dd>
          </div>
        )}
        {hashtags.length > 0 && (
          <div>
            <dt className="text-2xs uppercase text-paper-muted">hashtags</dt>
            <dd className="mt-1">{hashtags.map((h) => `#${h.replace(/^#/, '')}`).join(' ')}</dd>
          </div>
        )}
        {intake.sponsorRelevance && (
          <div>
            <dt className="text-2xs uppercase text-paper-muted">sponsor relevance</dt>
            <dd className="mt-1">{intake.sponsorRelevance}</dd>
          </div>
        )}
        {followUps.length > 0 && (
          <div>
            <dt className="text-2xs uppercase text-paper-muted">sequel ideas</dt>
            <dd className="mt-1">
              <ul className="list-disc pl-5 space-y-1">
                {followUps.map((idea) => (
                  <li key={idea}>{idea}</li>
                ))}
              </ul>
            </dd>
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
        {intake.originalFilename && !isMediaIntake(intake) && (
          <div>
            <dt className="text-2xs uppercase text-paper-muted">file</dt>
            <dd className="mt-1 text-2xs">
              {intake.originalFilename}
              {intake.fileSize != null ? ` · ${Math.round(intake.fileSize / 1024 / 1024)}MB` : ''}
              {intake.durationSeconds ? ` · ${intake.durationSeconds}s` : ''}
            </dd>
          </div>
        )}
        {isMediaIntake(intake) && intake.fileSize != null && (
          <div>
            <dt className="text-2xs uppercase text-paper-muted">media</dt>
            <dd className="mt-1 text-2xs">
              {intake.intakeType} · {Math.round(intake.fileSize / 1024 / 1024)}MB
              {intake.durationSeconds ? ` · ${intake.durationSeconds}s` : ''}
            </dd>
          </div>
        )}
        {intake.uploadedImagePath && (
          <div>
            <dt className="text-2xs uppercase text-paper-muted">image</dt>
            <dd className="mt-1 text-2xs break-all">{intake.uploadedImagePath}</dd>
          </div>
        )}
      </dl>

      {error && <p className="text-accent text-sm mb-4">// {error}</p>}

      <div className="flex flex-wrap gap-3 items-center">
        {showVideoReady && (
          <>
            <button
              type="button"
              onClick={() => postAction('create-post-package', 'package')}
              disabled={busy !== null || Boolean(intake.linkedPostPackageId)}
              className="bracket px-4 py-2 bg-paper-ink text-paper font-bold disabled:opacity-50 text-sm"
            >
              {busy === 'package'
                ? 'creating…'
                : intake.linkedPostPackageId
                  ? 'tiktok package created'
                  : 'create tiktok package'}
            </button>
            <button
              type="button"
              onClick={() => postAction('add-to-planner', 'planner')}
              disabled={busy !== null || Boolean(intake.linkedPlannerItemId)}
              className="bracket px-4 py-2 text-sm disabled:opacity-50"
            >
              {busy === 'planner' ? 'adding…' : intake.linkedPlannerItemId ? 'in planner' : 'add to planner'}
            </button>
          </>
        )}
        {!isMediaIntake(intake) && (
          <button
            type="button"
            onClick={approve}
            disabled={busy !== null || showVideoProcessing}
            className="bracket px-5 py-2 bg-paper-ink text-paper font-bold disabled:opacity-50"
          >
            {busy === 'approve' ? 'approving…' : 'approve → opportunity'}
          </button>
        )}
        {isMediaIntake(intake) && (
          <Link
            href="/drafts"
            className="bracket px-4 py-2 text-sm font-bold"
          >
            open draft inbox →
          </Link>
        )}
        {(intake.processingStatus === 'failed' || showVideoReady) && (
          <button
            type="button"
            onClick={() => postAction('retry-analysis', 'retry')}
            disabled={busy !== null}
            className="bracket px-4 py-2 text-sm disabled:opacity-50"
          >
            {busy === 'retry' ? 'retrying…' : 'retry analysis'}
          </button>
        )}
        <button
          type="button"
          onClick={() => postAction('archive', 'archive')}
          disabled={busy !== null}
          className="bracket px-4 py-2 text-paper-muted hover:text-paper-ink disabled:opacity-50 text-sm"
        >
          {busy === 'archive' ? 'archiving…' : 'archive'}
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
