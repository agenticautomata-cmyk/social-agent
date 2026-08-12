'use client';

import { useState } from 'react';
import Link from 'next/link';
import { clientApiOrigin } from '../lib/client-api';
import { PlannerQuickActions } from './planner-quick-actions';
import { CreateSponsorLeadButton } from './create-sponsor-lead-button';
import { DiscoverySkipButton } from './discovery-skip-button';

const API = clientApiOrigin();

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

type TodayActionProps = {
  primaryLabel?: string | null;
  primaryPlannerAction?: 'plan_weekend' | 'plan_today' | 'plan_this_week' | 'save' | null;
  showMarkCovered?: boolean;
  showSave?: boolean;
  viewSourceUrl?: string | null;
  detailsHref?: string;
  showSponsorLead?: boolean;
};

export function OpportunityActionBar({
  target,
  onAction,
  compact = true,
  showDismiss = true,
  todayMode = false,
  today,
}: {
  target: Target;
  onAction?: () => void;
  compact?: boolean;
  showDismiss?: boolean;
  todayMode?: boolean;
  today?: TodayActionProps;
}) {
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  async function dismissSponsor() {
    setBusy(true);
    try {
      const res = await fetch(`${API}/api/sponsor-intelligence/from-opportunity/${target.id}/dismiss`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(await res.text());
      setDismissed(true);
      onAction?.();
    } finally {
      setBusy(false);
    }
  }

  if (dismissed) {
    return <span className="text-2xs text-paper-muted italic">Dismissed</span>;
  }

  if (todayMode) {
    const primaryPlanner = today?.primaryPlannerAction ?? null;
    const showNonPlannerPrimary = !primaryPlanner && Boolean(today?.primaryLabel);

    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2 items-center">
          {showNonPlannerPrimary ? (
            <Link
              href={today?.detailsHref ?? `/review/inventory?id=${target.id}`}
              className="btn-primary text-xs py-2 min-h-[36px] px-3"
            >
              {today?.primaryLabel}
            </Link>
          ) : (
            <PlannerQuickActions
              target={target}
              onAction={() => onAction?.()}
              compact={compact}
              mode="today"
              primaryPlannerAction={primaryPlanner}
              showMarkCovered={today?.showMarkCovered ?? false}
              showSave={today?.showSave ?? false}
            />
          )}
          {today?.viewSourceUrl ? (
            <a
              href={today.viewSourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost text-xs py-2 min-h-[36px] px-3"
            >
              View source
            </a>
          ) : null}
          <Link
            href={today?.detailsHref ?? `/review/inventory?id=${target.id}`}
            className="btn-ghost text-xs py-2 min-h-[36px] px-3"
          >
            Details
          </Link>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <DiscoverySkipButton
            contentItemId={target.id}
            sourceScreen="today"
            showSnooze
            dismissLabel="Dismiss"
            className="btn-secondary text-2xs py-2 min-h-[36px] px-3"
            onSkipped={() => {
              setDismissed(true);
              onAction?.();
            }}
          />
          {today?.showSponsorLead ? (
            <CreateSponsorLeadButton contentItemId={target.id} title={target.title} compact />
          ) : null}
        </div>
      </div>
    );
  }

  const btn =
    'border border-paper-edge px-2 py-1 hover:border-paper-ink disabled:opacity-40 text-2xs';

  return (
    <div className="space-y-2">
      <PlannerQuickActions target={target} onAction={() => onAction?.()} compact={compact} />
      <div className="flex flex-wrap gap-2">
        <CreateSponsorLeadButton contentItemId={target.id} title={target.title} compact />
        {showDismiss && (
          <button type="button" disabled={busy} onClick={() => void dismissSponsor()} className={btn}>
            {busy ? '…' : 'dismiss'}
          </button>
        )}
      </div>
    </div>
  );
}
