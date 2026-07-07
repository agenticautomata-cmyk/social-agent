'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  CURRENT_STUDIO_UPDATE,
  STUDIO_UPDATE_DISMISS_KEY,
} from '../lib/studio-update-announcements';

export function StudioUpdateAnnouncement() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const dismissed = localStorage.getItem(STUDIO_UPDATE_DISMISS_KEY);
      setVisible(dismissed !== CURRENT_STUDIO_UPDATE.id);
    } catch {
      setVisible(true);
    }
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(STUDIO_UPDATE_DISMISS_KEY, CURRENT_STUDIO_UPDATE.id);
    } catch {
      /* ignore */
    }
    setVisible(false);
  }

  if (!visible) return null;

  const update = CURRENT_STUDIO_UPDATE;

  return (
    <div
      className="border-b border-violet-400/25 bg-gradient-to-r from-violet-950/40 via-fuchsia-950/30 to-transparent px-4 py-3 md:px-6"
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto flex max-w-[1200px] flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <p className="text-2xs font-bold uppercase tracking-wider text-violet-200/90">
            {update.title}
          </p>
          <p className="text-sm font-medium text-paper-ink">{update.summary}</p>
          <ul className="space-y-1 text-xs text-paper-muted">
            {update.highlights.map((line) => (
              <li key={line} className="flex gap-2">
                <span className="text-violet-300 shrink-0" aria-hidden>
                  ·
                </span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2 pt-1">
            <Link href={update.primaryHref} className="btn-primary text-xs py-1.5 px-3 min-h-0">
              {update.primaryLabel}
            </Link>
            {update.secondaryHref && update.secondaryLabel ? (
              <Link
                href={update.secondaryHref}
                className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-paper-ink hover:bg-white/10"
              >
                {update.secondaryLabel}
              </Link>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 self-start text-xs text-paper-dim hover:text-paper-muted sm:ml-4"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
