'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { clientApiUrl } from '../lib/client-api';
import type { PlannerBatchAction, PlannerQuickAction } from '../lib/planner-types';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

type PlannerActionTarget = {
  id: string;
  title: string;
  tracking?: {
    saved?: boolean;
    covered?: boolean;
    note?: string | null;
    followUpAt?: string | null;
    draftCaption?: string | null;
    postedUrl?: string | null;
    postedAt?: string | null;
  };
};

export function patchPlannerItem(
  contentItemId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetch(`${API}/api/content-planner/items/${contentItemId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function patchPlannerBatch(
  contentItemIds: string[],
  action: PlannerBatchAction,
): Promise<{ ok: boolean; updated: number }> {
  const res = await fetch(`${API}/api/content-planner/items/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contentItemIds, action }),
  });
  if (!res.ok) throw new Error(await res.text());
  const json = (await res.json()) as { ok: boolean; updated: number };
  return { ok: json.ok, updated: json.updated };
}

export function PlannerNoteDialog({
  target,
  onClose,
  onSave,
}: {
  target: PlannerActionTarget;
  onClose: () => void;
  onSave: () => void;
}) {
  const [note, setNote] = useState(target.tracking?.note ?? '');
  const [followUp, setFollowUp] = useState(
    target.tracking?.followUpAt ? target.tracking.followUpAt.slice(0, 10) : '',
  );
  const [busy, setBusy] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-paper-ink/40 p-4">
      <div className="bg-paper border-2 border-paper-ink max-w-md w-full p-6 space-y-4">
        <h3 className="font-bold lowercase">{target.title.toLowerCase()}</h3>
        <label className="block space-y-1 text-xs">
          <span className="text-paper-muted">note</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            className="w-full border border-paper-edge p-2 bg-paper"
          />
        </label>
        <label className="block space-y-1 text-xs">
          <span className="text-paper-muted">follow-up date (optional)</span>
          <input
            type="date"
            value={followUp}
            onChange={(e) => setFollowUp(e.target.value)}
            className="w-full border border-paper-edge p-2 bg-paper"
          />
        </label>
        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onClose} className="text-xs text-paper-muted hover:text-paper-ink">
            cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void patchPlannerItem(target.id, {
                notes: note,
                followUpAt: followUp ? new Date(`${followUp}T12:00:00`).toISOString() : null,
              })
                .then((res) => {
                  if (!res.ok) throw new Error('save failed');
                  onSave();
                  onClose();
                })
                .finally(() => setBusy(false));
            }}
            className="border-2 border-paper-ink px-3 py-1.5 text-xs font-bold hover:bg-paper-ink hover:text-paper"
          >
            save note
          </button>
        </div>
      </div>
    </div>
  );
}

export function PlannerQuickActions({
  target,
  onAction,
  compact = false,
}: {
  target: PlannerActionTarget;
  onAction: () => void;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);

  async function runAction(action: PlannerQuickAction) {
    setBusy(action);
    try {
      const res = await patchPlannerItem(target.id, { action });
      if (!res.ok) throw new Error(await res.text());
      onAction();
    } finally {
      setBusy(null);
    }
  }

  const btn = compact
    ? 'border border-paper-edge px-2 py-1 hover:border-paper-ink disabled:opacity-40 text-2xs'
    : 'border border-paper-edge px-2 py-1 hover:border-paper-ink disabled:opacity-40 text-2xs';

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!!busy || target.tracking?.saved}
          onClick={() => void runAction('save')}
          className={btn}
        >
          {busy === 'save' ? '…' : target.tracking?.saved ? 'saved ✓' : 'save'}
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={() => void runAction('plan_today')}
          className={btn}
        >
          {busy === 'plan_today' ? '…' : 'plan today'}
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={() => void runAction('plan_this_week')}
          className={btn}
        >
          {busy === 'plan_this_week' ? '…' : 'plan this week'}
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={() => void runAction('plan_weekend')}
          className={btn}
        >
          {busy === 'plan_weekend' ? '…' : 'plan weekend'}
        </button>
        <button
          type="button"
          disabled={!!busy || target.tracking?.covered}
          onClick={() => void runAction('mark_covered')}
          className={btn}
        >
          {busy === 'mark_covered' ? '…' : 'mark covered'}
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={() => void runAction('skip')}
          className={btn}
        >
          {busy === 'skip' ? '…' : 'skip'}
        </button>
        <button type="button" onClick={() => setNoteOpen(true)} className={btn}>
          add note
        </button>
      </div>

      {noteOpen && (
        <PlannerNoteDialog
          target={target}
          onClose={() => setNoteOpen(false)}
          onSave={onAction}
        />
      )}
    </>
  );
}

export function PlannerPostAssist({
  contentItemId,
  draftCaption,
  postedUrl,
  onUpdate,
}: {
  contentItemId: string;
  draftCaption?: string | null;
  postedUrl?: string | null;
  onUpdate: () => void;
}) {
  const router = useRouter();
  const [caption, setCaption] = useState(draftCaption ?? '');
  const [url, setUrl] = useState(postedUrl ?? '');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generateCaption() {
    setBusy('caption');
    setError(null);
    try {
      const res = await fetch(`${API}/api/content-planner/items/${contentItemId}/caption`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as { caption: string };
      setCaption(json.caption);
      onUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Caption failed');
    } finally {
      setBusy(null);
    }
  }

  async function markPosted() {
    setBusy('posted');
    setError(null);
    try {
      const res = await fetch(`${API}/api/content-planner/items/${contentItemId}/mark-posted`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postedUrl: url.trim() || null }),
      });
      if (!res.ok) throw new Error(await res.text());
      onUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mark posted failed');
    } finally {
      setBusy(null);
    }
  }

  async function prepareForTikTok() {
    setBusy('prepare');
    setError(null);
    try {
      const res = await fetch(clientApiUrl('/api/tiktok-operator/packages/prepare'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          relatedContentItemId: contentItemId,
          reason: 'Prepared from planner item',
          formatLabel: 'planner_post',
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as { package: { id: string } };
      router.push(`/analytics/tiktok/operator?pkg=${json.package.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Prepare failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3 border border-paper-edge p-3 bg-paper-tint">
      <div className="text-2xs uppercase text-paper-muted tracking-wider">Post assist</div>
      <textarea
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        rows={4}
        placeholder="TikTok caption draft…"
        className="w-full border border-paper-edge p-2 bg-paper text-xs"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!!busy}
          onClick={() => void prepareForTikTok()}
          className="text-2xs border-2 border-paper-ink px-2 py-1 font-bold hover:bg-paper-ink hover:text-paper disabled:opacity-40"
        >
          {busy === 'prepare' ? '…' : 'Prepare for TikTok'}
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={() => void generateCaption()}
          className="text-2xs border border-paper-edge px-2 py-1 hover:border-paper-ink disabled:opacity-40"
        >
          {busy === 'caption' ? '…' : 'generate caption'}
        </button>
      </div>
      <label className="block space-y-1 text-2xs">
        <span className="text-paper-muted">TikTok URL (optional)</span>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.tiktok.com/…"
          className="w-full border border-paper-edge p-2 bg-paper text-xs"
        />
      </label>
      <button
        type="button"
        disabled={!!busy}
        onClick={() => void markPosted()}
        className="text-2xs border-2 border-paper-ink px-2 py-1 font-bold hover:bg-paper-ink hover:text-paper disabled:opacity-40"
      >
        {busy === 'posted' ? '…' : 'mark posted'}
      </button>
      {error && <p className="text-2xs text-accent">// {error}</p>}
    </div>
  );
}

export function InventoryBatchBar({
  selectedCount,
  busy,
  onAction,
  onClear,
}: {
  selectedCount: number;
  busy: boolean;
  onAction: (action: PlannerBatchAction) => void;
  onClear: () => void;
}) {
  if (selectedCount === 0) return null;

  const btn =
    'text-2xs border border-paper-edge px-2 py-1 hover:border-paper-ink disabled:opacity-40';

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-2 border-paper-ink bg-paper px-4 py-3">
      <span className="text-xs font-bold tabular-nums">{selectedCount} selected</span>
      <button type="button" disabled={busy} onClick={() => onAction('plan_today')} className={btn}>
        plan today
      </button>
      <button type="button" disabled={busy} onClick={() => onAction('plan_weekend')} className={btn}>
        plan weekend
      </button>
      <button type="button" disabled={busy} onClick={() => onAction('skip')} className={btn}>
        skip
      </button>
      <button type="button" disabled={busy} onClick={() => onAction('dismiss')} className={btn}>
        dismiss
      </button>
      <button type="button" disabled={busy} onClick={onClear} className="text-2xs text-paper-muted ml-auto">
        clear
      </button>
    </div>
  );
}
