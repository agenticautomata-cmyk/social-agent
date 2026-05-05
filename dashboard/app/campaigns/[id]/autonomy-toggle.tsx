'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Hand, User, Zap } from 'lucide-react';

const MODES = [
  { value: 'manual', icon: Hand, label: 'manual' },
  { value: 'hitl', icon: User, label: 'hitl' },
  { value: 'auto', icon: Zap, label: 'auto' },
] as const;

type Mode = (typeof MODES)[number]['value'];

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
    <div className="inline-flex rounded-lg border border-border bg-bg-card overflow-hidden">
      {MODES.map((m) => {
        const Icon = m.icon;
        const isActive = current === m.value;
        return (
          <button
            key={m.value}
            onClick={() => set(m.value)}
            disabled={pending !== null}
            className={`px-3 py-1.5 text-xs font-mono transition inline-flex items-center gap-1.5 ${
              isActive
                ? 'bg-accent text-white'
                : 'text-zinc-400 hover:bg-bg-subtle hover:text-zinc-200'
            } ${pending === m.value ? 'opacity-50' : ''}`}
          >
            <Icon className="h-3 w-3" strokeWidth={2.25} />
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
