'use client';

import { clientApiOrigin } from '../../lib/client-api';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { formatDateTime } from '../../lib/datetime';
import { draftDisplayTitle } from '../../lib/draft-display';
import { DraftVideoCard } from '../../components/draft-video-card';

const API = clientApiOrigin();

type DraftItem = {
  id: string;
  draftTitle: string | null;
  displayTitle?: string | null;
  status: string;
  overallSummary: string | null;
  suggestedCaption: string | null;
  hookAssessment: string | null;
  sourceType: string;
  sourceChannel: string;
  readinessScore: string | null;
  suggestedPostWindow: string | null;
  shouldPost: string | null;
  suggestedAction: string | null;
  linkedOpportunityId: string | null;
  updatedAt: string;
};

const STATUS_LABELS: Record<string, string> = {
  received: 'Received',
  processing: 'Benson is watching…',
  analyzed: 'Benson watched this draft',
  needs_review: 'Needs review',
  ready_to_post: 'Ready to post',
  hold: 'On hold',
  revise: 'Needs a better hook',
  scheduled: 'Scheduled',
  posted: 'Posted',
  completed: 'Completed',
  scrapped: 'Archived',
  failed: 'Failed',
};

export function DraftInboxPanel() {
  const router = useRouter();
  const [items, setItems] = useState<DraftItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API}/api/drafts`)
      .then((r) => r.json())
      .then((body) => setItems(body.items ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : 'Load failed'));
  }, []);

  if (error) {
    return <p className="text-accent text-sm">// {error}</p>;
  }

  if (items.length === 0) {
    return (
      <div className="border-2 border-paper-ink py-16 text-center">
        <div className="text-3xl font-bold text-accent">// no unposted drafts yet</div>
        <p className="text-paper-muted mt-2 italic">
          Share a video from your phone to Benson — it lands here as a private draft.
        </p>
      </div>
    );
  }

  return (
    <section className="space-y-0">
      {items.map((draft, idx) => {
        const displayTitle = draft.displayTitle ?? draftDisplayTitle(draft);
        const statusLine = [
          STATUS_LABELS[draft.status] ?? draft.status,
          draft.suggestedAction ? draft.suggestedAction.replace(/_/g, ' ') : null,
        ]
          .filter(Boolean)
          .join(' · ');

        return (
        <div key={draft.id} className="border-t-2 border-paper-ink py-6">
          <div className="flex items-baseline justify-between gap-4 mb-3">
            <span className="text-paper-muted text-sm tabular-nums">
              {(idx + 1).toString().padStart(2, '0')}.
            </span>
            <span className="text-2xs text-paper-muted">{formatDateTime(draft.updatedAt)}</span>
          </div>

          {(draft.sourceType === 'video' || draft.sourceType === 'audio') && (
            <DraftVideoCard
              title={displayTitle}
              subtitle={statusLine}
              compact
              className="mb-4 w-full max-w-md aspect-[9/16] sm:aspect-video"
            />
          )}

          {draft.sourceType !== 'video' && draft.sourceType !== 'audio' && (
            <h3 className="text-xl font-bold lowercase mb-2">{displayTitle.toLowerCase()}</h3>
          )}

          {draft.overallSummary && (
            <p className="text-sm mb-4 line-clamp-3">{draft.overallSummary}</p>
          )}
          <div className="flex flex-wrap gap-3">
            <Link
              href={`/drafts/${draft.id}`}
              className="bracket px-4 py-2 bg-paper-ink text-paper font-bold text-sm"
            >
              open draft
            </Link>
            <button
              type="button"
              onClick={() => router.push(`/drafts/${draft.id}?discuss=1`)}
              className="bracket px-4 py-2 text-sm"
            >
              ask benson
            </button>
          </div>
        </div>
        );
      })}
    </section>
  );
}
