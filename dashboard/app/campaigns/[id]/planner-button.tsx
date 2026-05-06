'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function PlannerButton({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function plan() {
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/api/planner/run?campaignId=${campaignId}`, {
        method: 'POST',
      });
      const data = await res.json();
      setResult({ kind: 'ok', text: `+${data.result?.itemsCreated ?? 0}` });
      router.refresh();
    } catch (err) {
      setResult({ kind: 'err', text: err instanceof Error ? err.message : 'error' });
    } finally {
      setRunning(false);
      setTimeout(() => setResult(null), 4000);
    }
  }

  let label: string;
  let cls = 'border border-paper-ink px-3 py-1.5 text-sm text-paper-ink hover:bg-paper-ink hover:text-paper transition';

  if (running) {
    label = '[ planning… ]';
    cls += ' opacity-60';
  } else if (result?.kind === 'ok') {
    label = `[ ok · ${result.text} ]`;
    cls = 'border border-accent px-3 py-1.5 text-sm text-accent';
  } else if (result?.kind === 'err') {
    label = `[ err ]`;
    cls = 'border border-signal-alert px-3 py-1.5 text-sm text-signal-alert';
  } else {
    label = '[ plan now ]';
  }

  return (
    <button onClick={plan} disabled={running} className={cls}>
      {label}
    </button>
  );
}
