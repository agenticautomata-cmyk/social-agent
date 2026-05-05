'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function PlannerButton({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function plan() {
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/api/planner/run?campaignId=${campaignId}`, {
        method: 'POST',
      });
      const data = await res.json();
      setResult(`+${data.result?.itemsCreated ?? 0} items`);
      router.refresh();
    } catch (err) {
      setResult(`error: ${err instanceof Error ? err.message : 'unknown'}`);
    } finally {
      setRunning(false);
      setTimeout(() => setResult(null), 4000);
    }
  }

  return (
    <button
      onClick={plan}
      disabled={running}
      className="px-3 py-1.5 text-sm rounded-md bg-bg-subtle border border-border hover:border-accent hover:text-accent disabled:opacity-50"
    >
      {running ? 'Planning…' : result ?? 'Plan now'}
    </button>
  );
}
