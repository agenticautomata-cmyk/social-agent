'use client';

import { useEffect, useState } from 'react';
import type { PreAlphaStatus } from '../lib/pre-alpha-types';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function PreAlphaStatusBanner() {
  const [status, setStatus] = useState<PreAlphaStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/pre-alpha/status`, { cache: 'no-store' })
      .then(async (res) => res.json() as Promise<PreAlphaStatus>)
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  const hasWarning =
    (status && status.database === 'error') ||
    (status && !status.safety.liveSendBlocked);

  if (dismissed && !hasWarning) return null;

  return (
    <div
      className={`border-b text-xs px-4 py-1.5 md:px-6 ${
        hasWarning
          ? 'border-amber-400/30 bg-amber-400/10 text-amber-100'
          : 'border-white/10 bg-white/[0.03] text-paper-muted'
      }`}
      role="status"
    >
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-3 gap-y-1">
        {hasWarning ? (
          <>
            {status?.database === 'error' && (
              <span className="font-semibold">Database offline</span>
            )}
            {status && !status.safety.liveSendBlocked && (
              <span className="font-semibold">Live send may be enabled</span>
            )}
          </>
        ) : (
          <span>Pre-alpha · KC data live · outreach simulated</span>
        )}
        {!hasWarning && (
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="ml-auto text-paper-dim hover:text-paper-muted"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}
