'use client';

import { useState } from 'react';
import { clientApiLongRunningUrl, sleep } from '../lib/client-api';
import type { WebsiteDraftRecord } from '../lib/website-types';
import {
  draftPreviewImageUrl,
  friendlyWebsiteError,
  websiteFieldClass,
  websiteLabelClass,
  websitePanelClass,
} from '../lib/website-ui';

const QUICK_PROMPTS = [
  'This is a TikTok analytics screenshot — describe the stats accurately.',
  'This is a TikTok profile screenshot, not a sponsor ad.',
  'Put this in Latest posts with a casual KC creator caption.',
  'Rewrite the caption shorter and more like Kellie.',
];

type ReviseJobResponse = {
  ok: boolean;
  job?: {
    status: 'processing' | 'complete' | 'failed';
    draft: WebsiteDraftRecord | null;
    assistantReply: string | null;
    error: string | null;
  };
  error?: string;
};

type Props = {
  draftId: string;
  draft?: WebsiteDraftRecord | null;
  disabled?: boolean;
  onRevised: (draft: WebsiteDraftRecord, assistantReply: string) => void;
};

export function WebsiteBensonRevise({ draftId, draft, disabled, onRevised }: Props) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastReply, setLastReply] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const previewUrl = draft ? draftPreviewImageUrl(draft) : null;

  async function pollReviseJob(jobId: string): Promise<ReviseJobResponse['job']> {
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      const res = await fetch(clientApiLongRunningUrl(`/api/website/drafts/revise-jobs/${jobId}`), {
        cache: 'no-store',
      });
      const data = (await res.json()) as ReviseJobResponse;
      if (!res.ok || !data.ok || !data.job) {
        throw new Error(data.error ?? 'Failed to check revision status');
      }
      if (data.job.status === 'complete' || data.job.status === 'failed') {
        return data.job;
      }
      setProgress('Benson is studying the image…');
      await sleep(2000);
    }
    throw new Error('Benson is taking longer than usual — try again in a moment.');
  }

  async function revise(instruction: string) {
    setBusy(true);
    setError(null);
    setProgress('Sending to Benson…');
    try {
      const res = await fetch(clientApiLongRunningUrl(`/api/website/drafts/${draftId}/revise`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: instruction, async: true }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        jobId?: string;
        draft?: WebsiteDraftRecord;
        assistantReply?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? 'Benson could not revise this draft');
      }

      if (res.status === 202 && data.jobId) {
        const job = await pollReviseJob(data.jobId);
        if (job?.status === 'failed' || !job?.draft) {
          throw new Error(job?.error ?? 'Revision failed');
        }
        setLastReply(job.assistantReply ?? 'Draft updated.');
        setMessage('');
        onRevised(job.draft, job.assistantReply ?? 'Draft updated.');
        return;
      }

      if (data.draft) {
        setLastReply(data.assistantReply ?? 'Draft updated.');
        setMessage('');
        onRevised(data.draft, data.assistantReply ?? 'Draft updated.');
      }
    } catch (err) {
      setError(friendlyWebsiteError(err instanceof Error ? err.message : 'Revision failed'));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <div className={`${websitePanelClass} space-y-4 border border-accent/20`}>
      <div>
        <h2 className="font-semibold text-paper-ink">Talk to Benson</h2>
        <p className="text-sm text-paper-muted mt-1">
          Benson can see your uploaded image below. Tell him what it actually is and he&apos;ll
          rewrite the draft.
        </p>
      </div>

      {previewUrl ? (
        <div>
          <p className={`${websiteLabelClass} mb-2`}>Uploaded media (Benson sees this)</p>
          <div className="rounded-xl border border-white/10 bg-black/40 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt={draft?.altText ?? draft?.title ?? 'Uploaded media'}
              className="max-h-56 w-full object-contain"
            />
          </div>
        </div>
      ) : (
        <p className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-paper-muted">
          No image attached to this draft — Benson can still revise text fields from your notes.
        </p>
      )}

      {progress ? (
        <p className="rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">{progress}</p>
      ) : null}

      {lastReply ? (
        <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm text-paper-ink">
          <p className="text-xs font-medium text-accent mb-1">Benson</p>
          {lastReply}
        </div>
      ) : null}

      {error ? (
        <p className="rounded-lg bg-signal-alert_tint px-3 py-2 text-sm text-signal-alert">{error}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {QUICK_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            disabled={disabled || busy}
            onClick={() => void revise(prompt)}
            className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-paper-ink hover:bg-white/10 disabled:opacity-50 text-left"
          >
            {prompt}
          </button>
        ))}
      </div>

      <label className="block">
        <span className={websiteLabelClass}>Your instructions</span>
        <textarea
          className={websiteFieldClass}
          rows={3}
          placeholder="e.g. This is my TikTok For You page stats from last week — not a sponsor."
          value={message}
          disabled={disabled || busy}
          onChange={(e) => setMessage(e.target.value)}
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled || busy || !message.trim()}
          onClick={() => void revise(message)}
          className="btn-primary text-sm disabled:opacity-50"
        >
          {busy ? 'Working…' : 'Ask Benson to revise'}
        </button>
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() =>
            void revise('Look at this image again and rewrite the draft based on what you actually see.')
          }
          className="btn-ghost text-sm disabled:opacity-50"
        >
          Re-analyze image
        </button>
      </div>
    </div>
  );
}
