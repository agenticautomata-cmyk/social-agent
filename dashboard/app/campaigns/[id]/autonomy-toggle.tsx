'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

const MODES = ['manual', 'hitl', 'auto'] as const;
type Mode = (typeof MODES)[number];

export function AutonomyToggle({ campaignId, current }: { campaignId: string; current: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<Mode | null>(null);

  async function set(mode: Mode) {
    if (mode === current) return;
    setPending(mode);
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/api/campaigns/${campaignId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autonomyMode: mode }),
      });
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="inline-flex rounded-md border border-border overflow-hidden">
      {MODES.map((m) => (
        <button
          key={m}
          onClick={() => set(m)}
          disabled={pending !== null}
          className={`px-3 py-1.5 text-xs font-mono transition ${
            current === m
              ? 'bg-accent text-white'
              : 'bg-bg-card text-zinc-400 hover:bg-bg-subtle'
          } ${pending === m ? 'opacity-50' : ''}`}
        >
          {m}
        </button>
      ))}
    </div>
  );
}
