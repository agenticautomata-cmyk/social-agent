'use client';

import { useState } from 'react';
import { skipDiscoveryItem, useOptionalBensonDataRefresh } from '../lib/benson-data-refresh';
import { useActionToast } from './action-toast';
import { clientApiUrl } from '../lib/client-api';

type SnoozePreset = 'later_today' | 'tomorrow' | 'this_weekend' | 'next_week';

const SNOOZE_NEXT_STEP: Record<SnoozePreset, string> = {
  later_today: 'Hidden until later today, then it comes back in your queue.',
  tomorrow: 'Hidden until tomorrow morning, then it comes back in your queue.',
  this_weekend: 'Hidden until Saturday morning, then it comes back in your queue.',
  next_week: 'Hidden until Monday morning, then it comes back in your queue.',
};

export function DiscoverySkipButton({
  contentItemId,
  sourceScreen,
  onSkipped,
  className = 'btn-secondary text-xs py-2 min-h-[44px] px-4',
  showSnooze = false,
  dismissLabel = 'Skip',
}: {
  contentItemId: string;
  sourceScreen: string;
  onSkipped?: () => void;
  className?: string;
  showSnooze?: boolean;
  /** Operator-facing label for permanent skip (e.g. Dismiss on Today). */
  dismissLabel?: string;
}) {
  const refresh = useOptionalBensonDataRefresh();
  const { showToast } = useActionToast();
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function undoSkip() {
    try {
      await fetch(clientApiUrl(`/api/data-revision/skip/${contentItemId}/restore`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      refresh?.notifyLocalChange(['opportunities', 'discoveries', 'recommendations', 'home_briefing']);
      setHidden(false);
      showToast({ title: 'Skip undone', nextStep: 'It is back in your queue.', tone: 'info' });
    } catch {
      showToast({ title: 'Could not undo that skip', tone: 'error' });
    }
  }

  async function runSkip(snoozePreset?: SnoozePreset) {
    setBusy(true);
    setError(null);
    setHidden(true);
    try {
      await skipDiscoveryItem({ contentItemId, sourceScreen, snoozePreset });
      refresh?.notifyLocalChange(['opportunities', 'discoveries', 'recommendations', 'home_briefing']);
      setMenuOpen(false);
      showToast({
        title: snoozePreset ? 'Snoozed' : 'Skipped',
        nextStep: snoozePreset
          ? SNOOZE_NEXT_STEP[snoozePreset]
          : 'Gone from your queues for good, including duplicates of this same event from other sources.',
        undo: () => undoSkip(),
      });
      onSkipped?.();
    } catch (err) {
      setHidden(false);
      const message = err instanceof Error ? err.message : 'Skip failed';
      setError(message);
      showToast({ title: "That skip didn't save", nextStep: message, tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  if (hidden) return null;

  return (
    <div className="relative inline-flex flex-col items-stretch gap-1">
      <div className="inline-flex gap-2">
        <button type="button" disabled={busy} onClick={() => void runSkip()} className={className}>
          {busy ? '…' : dismissLabel}
        </button>
        {showSnooze && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setMenuOpen((v) => !v)}
            className="btn-secondary text-xs py-2 min-h-[44px] px-4"
            aria-expanded={menuOpen}
          >
            Later
          </button>
        )}
      </div>
      {menuOpen && (
        <div className="absolute top-full right-0 z-30 mt-1 min-w-[10rem] rounded-lg border border-white/10 bg-black/90 p-1 shadow-xl">
          {(
            [
              ['later_today', 'Later today'],
              ['tomorrow', 'Tomorrow'],
              ['this_weekend', 'This weekend'],
              ['next_week', 'Next week'],
            ] as const
          ).map(([preset, label]) => (
            <button
              key={preset}
              type="button"
              disabled={busy}
              onClick={() => void runSkip(preset)}
              className="block w-full rounded px-3 py-3 text-left text-xs min-h-[44px] hover:bg-white/10"
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {error ? <p className="text-2xs text-red-300 max-w-[16rem]">{error}</p> : null}
    </div>
  );
}
