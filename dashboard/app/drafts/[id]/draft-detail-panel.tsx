'use client';

import { clientApiOrigin } from '../../../lib/client-api';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { formatDateTime } from '../../../lib/datetime';
import { draftDisplayTitle } from '../../../lib/draft-display';
import { DraftVideoCard } from '../../../components/draft-video-card';
import { BensonChatPanel } from '../../../components/benson-chat-panel';

const API = clientApiOrigin();

type DraftDetail = {
  id: string;
  draftTitle: string | null;
  displayTitle?: string | null;
  sourceType?: string;
  status: string;
  overallSummary: string | null;
  visualSummary: string | null;
  audioSummary: string | null;
  transcriptText: string | null;
  contextLimitations: string | null;
  hookAssessment: string | null;
  suggestedCaption: string | null;
  suggestedHashtagsJson: string[] | null;
  suggestedPostWindow: string | null;
  postingRecommendation: Record<string, unknown> | null;
  opportunityMatch: Record<string, unknown> | null;
  linkedOpportunityId: string | null;
  linkedPostPackageId: string | null;
  frameSummariesJson: Array<{ label: string; description: string; timestamp_seconds?: number }> | null;
  detectedBrandsJson: string[] | null;
  detectedLocationsJson: string[] | null;
  updatedAt: string;
};

type Decision = {
  id: string;
  decisionType: string;
  decisionSummary: string;
  reason: string | null;
  decidedBy: string;
  createdAt: string;
};

export function DraftDetailPanel({ draftId }: { draftId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [draft, setDraft] = useState<DraftDetail | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [discussOpen, setDiscussOpen] = useState(searchParams.get('discuss') === '1');

  const load = useCallback(async () => {
    const res = await fetch(`${API}/api/drafts/${draftId}`);
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? `${res.status}`);
    setDraft(body.draft);
    setDecisions(body.decisions ?? []);
  }, [draftId]);

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : 'Load failed'));
  }, [load]);

  async function action(path: string, label: string, body?: object) {
    setBusy(label);
    setError(null);
    try {
      const res = await fetch(`${API}/api/drafts/${draftId}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message ?? json.error ?? `${res.status}`);
      await load();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : `${label} failed`);
    } finally {
      setBusy(null);
    }
  }

  if (error && !draft) return <p className="text-accent">// {error}</p>;
  if (!draft) return <p className="text-paper-muted italic">loading draft…</p>;

  const rec = draft.postingRecommendation;
  const match = draft.opportunityMatch;
  const hashtags = Array.isArray(draft.suggestedHashtagsJson) ? draft.suggestedHashtagsJson : [];
  const analysisReady = !['failed', 'received', 'processing'].includes(draft.status);
  const displayTitle = draft.displayTitle ?? draftDisplayTitle(draft);
  const isVideoDraft = draft.sourceType === 'video' || draft.sourceType === 'audio';

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div className="w-full">
          <Link href="/drafts" className="text-sm link">
            ← draft inbox
          </Link>
          {isVideoDraft ? (
            <div className="mt-3">
              <DraftVideoCard
                title={displayTitle}
                subtitle={
                  draft.status === 'processing'
                    ? 'Benson is reading this draft…'
                    : 'Benson watched this draft'
                }
                className="w-full max-w-md aspect-[9/16] sm:aspect-video sm:max-h-80"
              />
            </div>
          ) : (
            <h1 className="text-4xl font-bold lowercase mt-2">{displayTitle.toLowerCase()}</h1>
          )}
          {!isVideoDraft && (
            <p className="text-paper-muted mt-1 italic">
              {draft.status === 'processing'
                ? 'Benson is reading this draft…'
                : 'Benson watched this draft'}
            </p>
          )}
        </div>
        <span className="text-2xs text-paper-muted">{formatDateTime(draft.updatedAt)}</span>
      </div>

      {draft.contextLimitations && (
        <p className="text-sm text-paper-muted border-l-2 border-accent pl-4">{draft.contextLimitations}</p>
      )}

      {draft.overallSummary && (
        <section>
          <h2 className="text-2xs uppercase text-paper-muted mb-2">summary</h2>
          <p className="text-sm">{draft.overallSummary}</p>
        </section>
      )}

      {draft.visualSummary && (
        <section>
          <h2 className="text-2xs uppercase text-paper-muted mb-2">what benson saw</h2>
          <p className="text-sm text-paper-muted">{draft.visualSummary}</p>
        </section>
      )}

      {draft.transcriptText && (
        <section>
          <h2 className="text-2xs uppercase text-paper-muted mb-2">transcript</h2>
          <p className="text-sm whitespace-pre-wrap text-paper-muted max-h-56 overflow-y-auto">
            {draft.transcriptText}
          </p>
        </section>
      )}

      {rec && (
        <section className="border-2 border-paper-ink p-5 space-y-2">
          <h2 className="text-2xs uppercase text-paper-muted">posting recommendation</h2>
          <p className="text-sm font-medium">
            {String(rec.should_post ?? 'maybe').toUpperCase()} — {String(rec.recommended_action ?? '').replace(/_/g, ' ')}
          </p>
          {typeof rec.reason === 'string' && <p className="text-sm">{rec.reason}</p>}
          {draft.suggestedPostWindow && (
            <p className="text-2xs text-paper-muted">Next window: {draft.suggestedPostWindow}</p>
          )}
          <button
            type="button"
            disabled={busy !== null || !analysisReady}
            onClick={() => action('refresh-posting-advice', 'refresh-posting')}
            className="bracket px-3 py-1.5 text-2xs disabled:opacity-50"
            title="Recalculate posting time using current date and analytics"
          >
            {busy === 'refresh-posting' ? 'refreshing…' : 'refresh posting time'}
          </button>
        </section>
      )}

      {match && typeof match.title === 'string' && (
        <section>
          <h2 className="text-2xs uppercase text-paper-muted mb-2">opportunity match</h2>
          <p className="text-sm">{String(match.reason ?? '')}</p>
        </section>
      )}

      {draft.suggestedCaption && (
        <section>
          <h2 className="text-2xs uppercase text-paper-muted mb-2">suggested caption</h2>
          <p className="text-sm whitespace-pre-wrap">{draft.suggestedCaption}</p>
          {hashtags.length > 0 && (
            <p className="text-2xs mt-2">{hashtags.map((h) => `#${h.replace(/^#/, '')}`).join(' ')}</p>
          )}
        </section>
      )}

      {draft.status === 'failed' && (
        <section className="border-2 border-accent p-4 space-y-3">
          <p className="text-sm text-accent">
            Benson hit an error analyzing this draft. Retry after fixes — your video file is still saved.
          </p>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => action('retry', 'retry')}
            className="bracket px-4 py-2 bg-paper-ink text-paper font-bold text-sm disabled:opacity-50"
          >
            {busy === 'retry' ? 'retrying…' : 'retry analysis'}
          </button>
        </section>
      )}

      {error && <p className="text-accent text-sm">// {error}</p>}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => setDiscussOpen(true)}
          className="bracket px-4 py-2 bg-paper-ink text-paper font-bold text-sm"
        >
          ask benson about this draft
        </button>
        <button
          type="button"
          disabled={busy !== null || Boolean(draft.linkedPostPackageId) || !analysisReady}
          onClick={() => action('create-post-package', 'package')}
          className="bracket px-4 py-2 text-sm disabled:opacity-50"
          title={analysisReady ? undefined : 'Available after Benson finishes analyzing'}
        >
          {draft.linkedPostPackageId ? 'tiktok package created' : 'create tiktok package'}
        </button>
        <button
          type="button"
          disabled={busy !== null || !analysisReady}
          onClick={() => action('add-to-planner', 'planner')}
          className="bracket px-4 py-2 text-sm disabled:opacity-50"
          title={analysisReady ? undefined : 'Available after Benson finishes analyzing'}
        >
          add to planner
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => action('decision', 'hold', { action: 'hold' })}
          className="bracket px-4 py-2 text-sm disabled:opacity-50"
        >
          hold this one
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => action('decision', 'posted', { action: 'mark_posted' })}
          className="bracket px-4 py-2 text-sm disabled:opacity-50"
        >
          mark posted
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => action('decision', 'scrap', { action: 'scrap' })}
          className="bracket px-4 py-2 text-paper-muted text-sm disabled:opacity-50"
        >
          archive
        </button>
      </div>

      {decisions.length > 0 && (
        <section>
          <h2 className="text-2xs uppercase text-paper-muted mb-3">decision history</h2>
          <ul className="space-y-2 text-sm">
            {decisions.map((d) => (
              <li key={d.id} className="border-l-2 border-paper-edge pl-3">
                <span className="text-paper-muted text-2xs">{formatDateTime(d.createdAt)}</span>
                <p>{d.decisionSummary}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {discussOpen && (
        <div className="border-2 border-paper-ink p-4">
          <BensonChatPanel
            variant="embedded"
            pageContext={`/drafts/${draftId}`}
            draftAssetId={draftId}
            isOpen
            onClose={() => setDiscussOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
