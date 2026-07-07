'use client';

import { useState } from 'react';
import { PlannerQuickActions } from './planner-quick-actions';
import { CreateSponsorLeadButton } from './create-sponsor-lead-button';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

type Target = {
  id: string;
  title: string;
  tracking?: {
    saved?: boolean;
    covered?: boolean;
    note?: string | null;
    followUpAt?: string | null;
  };
};

export function OpportunityActionBar({
  target,
  onAction,
  compact = true,
  showDismiss = true,
}: {
  target: Target;
  onAction?: () => void;
  compact?: boolean;
  showDismiss?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  async function dismiss() {
    setBusy(true);
    try {
      const res = await fetch(
        `${API}/api/sponsor-intelligence/from-opportunity/${target.id}/dismiss`,
        { method: 'POST' },
      );
      if (!res.ok) throw new Error(await res.text());
      setDismissed(true);
      onAction?.();
    } finally {
      setBusy(false);
    }
  }

  if (dismissed) {
    return <span className="text-2xs text-paper-muted italic">dismissed</span>;
  }

  const btn =
    'border border-paper-edge px-2 py-1 hover:border-paper-ink disabled:opacity-40 text-2xs';

  return (
    <div className="space-y-2">
      <PlannerQuickActions target={target} onAction={() => onAction?.()} compact={compact} />
      <div className="flex flex-wrap gap-2">
        <CreateSponsorLeadButton contentItemId={target.id} title={target.title} compact />
        {showDismiss && (
          <button type="button" disabled={busy} onClick={() => void dismiss()} className={btn}>
            {busy ? '…' : 'dismiss'}
          </button>
        )}
      </div>
    </div>
  );
}
