'use client';

import { useState } from 'react';
import type { PlannerQuickAction } from '../lib/planner-types';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

type PlannerActionTarget = {
  id: string;
  title: string;
  tracking?: {
    saved?: boolean;
    covered?: boolean;
    note?: string | null;
    followUpAt?: string | null;
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
