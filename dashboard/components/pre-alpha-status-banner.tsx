'use client';

import { useEffect, useState } from 'react';
import type { PreAlphaStatus } from '../lib/pre-alpha-types';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function PreAlphaStatusBanner() {
  const [status, setStatus] = useState<PreAlphaStatus | null>(null);

  useEffect(() => {
    fetch(`${API}/api/pre-alpha/status`, { cache: 'no-store' })
      .then(async (res) => res.json() as Promise<PreAlphaStatus>)
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  const demoMode =
    status?.demoMode ??
    (process.env.NEXT_PUBLIC_DEMO_MODE === 'true' ||
      process.env.NEXT_PUBLIC_DEMO_MODE === '1');

  const outreachMode = status?.outreach.mode ?? 'simulate';

  return (
    <div
      className="border-b border-paper-edge bg-paper-tint text-2xs px-4 py-2 md:px-6"
      role="status"
    >
      <div className="max-w-[1400px] mx-auto flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="font-bold uppercase tracking-wider text-paper-ink">pre-alpha</span>
        <span className={demoMode ? 'text-paper-muted' : 'text-accent font-bold'}>
          demo_mode={demoMode ? 'true' : 'false'}
        </span>
        <span className="text-paper-muted">
          outreach={outreachMode}
          {status?.safety.liveSendBlocked ? ' · live send blocked' : ''}
        </span>
        {status && status.database === 'error' && (
          <span className="text-accent font-bold">database offline</span>
        )}
        {status && !status.safety.liveSendBlocked && (
          <span className="text-accent font-bold">warning: live send may be enabled</span>
        )}
      </div>
    </div>
  );
}
