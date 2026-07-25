'use client';

import { useState } from 'react';
import { skipDiscoveryItem, useBensonDataRefresh } from '../lib/benson-data-refresh';

type SnoozePreset = 'later_today' | 'tomorrow' | 'this_weekend' | 'next_week';

export function DiscoverySkipButton({
  contentItemId,
  sourceScreen,
  onSkipped,
  className = 'btn-secondary text-xs py-2 min-h-[36px] px-3',
  showSnooze = false,
}: {
  contentItemId: string;
  sourceScreen: string;
  onSkipped?: () => void;
  className?: string;
  showSnooze?: boolean;
}) {
  const { notifyLocalChange } = useBensonDataRefresh();
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runSkip(snoozePreset?: SnoozePreset) {
    setBusy(true);
    setError(null);
    try {
      await skipDiscoveryItem({ contentItemId, sourceScreen, snoozePreset });
      notifyLocalChange(['opportunities', 'discoveries', 'recommendations', 'home_briefing']);
      setMenuOpen(false);
      onSkipped?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Skip failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative inline-flex flex-col items-stretch gap-1">
      <div className="inline-flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void runSkip()}
          className={className}
        >
          {busy ? '…' : 'Skip'}
        </button>
        {showSnooze && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setMenuOpen((v) => !v)}
            className="btn-secondary text-xs py-2 min-h-[36px] px-3"
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
              className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-white/10"
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {error && <span className="text-2xs text-red-300">{error}</span>}
    </div>
  );
}
